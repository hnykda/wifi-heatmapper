import { expect, Page } from "@playwright/test";
import { deflateSync } from "node:zlib";

/** A plain white PNG of the given size, built without any image library. */
export function makePng(width: number, height: number): Buffer {
  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  const crc32 = (buf: Buffer) => {
    let c = -1;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.alloc(1 + width * 3, 0xff);
  row[0] = 0; // filter: none
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let counter = 0;
export function uniqueName(prefix = "e2e"): string {
  counter++;
  return `${prefix}-${Date.now().toString(36)}-${counter}.png`;
}

/**
 * Upload a fresh floor plan so the test owns an empty survey.
 * Returns the floor plan file name.
 */
export async function uploadFloorplan(
  page: Page,
  name = uniqueName(),
  size: [number, number] = [800, 500],
): Promise<string> {
  await page.goto("/#settings");
  await page.getByTestId("floorplan-picker").waitFor();
  await page.getByTestId("floorplan-file-input").setInputFiles({
    name,
    mimeType: "image/png",
    buffer: makePng(size[0], size[1]),
  });
  await expect(page.getByTestId("floorplan-picker")).toContainText(name);
  await expect(page.getByTestId("summary-floorplan")).toContainText(name);
  return name;
}

export async function gotoTab(
  page: Page,
  tab: "settings" | "floorplan" | "heatmaps" | "points",
) {
  await page.getByTestId(`tab-${tab}`).click();
}

/** Click an empty spot on the floor plan and wait for the mock measurement. */
export async function measureAt(page: Page, fx: number, fy: number) {
  const canvas = page.getByTestId("floorplan-canvas");
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * fx, y: box.height * fy } });
  const panel = page.getByTestId("measurement-panel");
  await expect(panel).toHaveAttribute("data-phase", "running");
  await expect(panel).toHaveAttribute("data-phase", "done", {
    timeout: 30_000,
  });
}

type Survey = any;

/**
 * Read the survey file. Saves are asynchronous, so pass `until` to wait for
 * the state you expect (polls for up to 5 s).
 */
export async function readSurvey(
  page: Page,
  name: string,
  until: (survey: Survey) => boolean = () => true,
): Promise<Survey> {
  let last: Survey = null;
  await expect
    .poll(
      async () => {
        const res = await page.request.get(
          `/api/settings?name=${encodeURIComponent(name)}`,
        );
        if (!res.ok()) return false;
        last = await res.json();
        return until(last);
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  return last;
}

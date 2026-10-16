import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

// Bundle the actual renderer sources into this isolated browser fixture. This
// avoids adding a production debug route or relying on Next's private chunks.
function rendererBundle() {
  const modules = new Map<string, string>();
  function visit(file: string): string {
    if (modules.has(file)) return file;
    modules.set(file, "");
    let code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText;
    code = code.replace(/require\("([^"]+)"\)/g, (_match, name: string) => {
      const resolved = name.startsWith("@/")
        ? path.resolve("src", name.slice(2)) + ".ts"
        : path.resolve(path.dirname(file), name) + ".ts";
      return `require(${JSON.stringify(visit(resolved))})`;
    });
    modules.set(file, code);
    return file;
  }
  const entry = visit(path.resolve("src/app/webGL/renderers/mainRenderer.ts"));
  const factories = [...modules]
    .map(
      ([file, code]) =>
        `${JSON.stringify(file)}: function(require, module, exports) {\n${code}\n}`,
    )
    .join(",\n");
  return `const modules = {${factories}}; const cache = {};
    function require(id) { if (!cache[id]) { const module = { exports: {} }; cache[id] = module; modules[id](require, module, module.exports); } return cache[id].exports; }
    return require(${JSON.stringify(entry)}).default;`;
}

for (const lowPrecision of [false, true]) {
  test(`real renderer pixels with ${lowPrecision ? "forced low fragment precision fallback" : "normal highp GPU"}`, async ({
    page,
  }) => {
    await page.setContent("<canvas></canvas>");
    const result = await page.evaluate(
      async ({ bundle, lowPrecision }) => {
        const mainRenderer = new Function(bundle)();
        const canvas = document.querySelector("canvas")!;
        const gl = canvas.getContext("webgl")!;
        const originalPrecision = gl.getShaderPrecisionFormat.bind(gl);
        gl.getShaderPrecisionFormat = (shader, precision) => {
          if (
            lowPrecision &&
            shader === gl.FRAGMENT_SHADER &&
            precision === gl.HIGH_FLOAT
          ) {
            return {
              precision: 0,
              rangeMin: 0,
              rangeMax: 0,
            } as WebGLShaderPrecisionFormat;
          }
          return originalPrecision(shader, precision);
        };
        let idwShader = false;
        const shaderSource = gl.shaderSource.bind(gl);
        gl.shaderSource = (shader, source) => {
          idwShader ||= source.includes("u_points");
          shaderSource(shader, source);
        };
        // Loading a real image first exercises the background's UNPACK_FLIP_Y
        // state. The fallback must not invert its top-left sample coordinates.
        const background = document.createElement("canvas");
        background.width = 5;
        background.height = 9;
        const ctx = background.getContext("2d")!;
        ctx.fillStyle = "rgb(40, 40, 40)";
        ctx.fillRect(0, 0, 5, 9);
        const points = [
          { x: 0.5, y: 0.5, value: -100 },
          { x: 4.5, y: 0.5, value: 200 },
        ];
        const renderer = mainRenderer(canvas, points, {
          0: "rgb(0, 0, 0)",
          1: "rgb(255, 255, 255)",
        });
        await renderer.render({
          points,
          width: 5,
          height: 9,
          influenceRadius: 100,
          minOpacity: 0.5,
          maxOpacity: 0.5,
          valueRange: { min: 20, max: 100 },
          backgroundImageSrc: background.toDataURL(),
        });
        const pixels = new Uint8Array(5 * 9 * 4);
        gl.readPixels(0, 0, 5, 9, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return { pixels: [...pixels], idwShader, error: gl.getError() };
      },
      { bundle: rendererBundle(), lowPrecision },
    );
    expect(result.error).toBe(0);
    expect(result.idwShader).toBe(!lowPrecision);
    const top = (x: number) => result.pixels[(8 * 5 + x) * 4];
    expect(top(0)).toBeCloseTo(20, -1);
    expect(top(4)).toBeCloseTo(148, -1);
    // Raw mean 50 -> 0.375 -> LUT ~96, blended over 40 -> ~68.
    // Clamping samples first gives 0.5 -> blended ~84, an observable error.
    expect(Math.abs(top(2) - 68)).toBeLessThanOrEqual(2);
    expect(top(4) - top(0)).toBeGreaterThan(120);
    expect(result.pixels[0]).toBeGreaterThan(top(0));
  });
}

test("low precision preserves narrow-offset colours, large distances, and distant outlier influence", async ({
  page,
}) => {
  await page.setContent("<canvas></canvas>");
  const result = await page.evaluate(async (bundle) => {
    const mainRenderer = new Function(bundle)();
    const canvas = document.querySelector("canvas")!;
    const gl = canvas.getContext("webgl")!;
    gl.getShaderPrecisionFormat = () =>
      ({
        precision: 0,
        rangeMin: 0,
        rangeMax: 0,
      }) as WebGLShaderPrecisionFormat;
    const points = [
      { x: 0.5, y: 0.5, value: 1e9 },
      { x: 800.5, y: 0.5, value: 1e9 + 2 },
      { x: 2000.5, y: 0.5, value: 2e9 },
    ];
    const renderer = mainRenderer(canvas, points, {
      0: "rgb(0, 0, 0)",
      1: "rgb(255, 255, 255)",
    });
    const options = {
      points,
      width: 801,
      height: 1,
      minOpacity: 1,
      maxOpacity: 1,
      valueRange: { min: 1e9, max: 1e9 + 2 },
    };
    const read = () => {
      const pixels = new Uint8Array(801 * 4);
      gl.readPixels(0, 0, 801, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return [pixels[0], pixels[400 * 4], pixels[800 * 4]];
    };
    await renderer.render({ ...options, influenceRadius: 801 });
    const excluded = read();
    await renderer.render({ ...options, influenceRadius: 3000 });
    return { excluded, included: read(), error: gl.getError() };
  }, rendererBundle());
  expect(result.error).toBe(0);
  expect(result.excluded[0]).toBe(0);
  expect(Math.abs(result.excluded[1] - 128)).toBeLessThanOrEqual(1);
  expect(result.excluded[2]).toBe(255);
  expect(result.included).toEqual([0, 255, 255]);
});

test("highp still falls back when a valid span becomes zero in float32", async ({
  page,
}) => {
  await page.setContent("<canvas></canvas>");
  const result = await page.evaluate(async (bundle) => {
    const mainRenderer = new Function(bundle)();
    const canvas = document.querySelector("canvas")!;
    const gl = canvas.getContext("webgl")!;
    let idwShader = false;
    const shaderSource = gl.shaderSource.bind(gl);
    gl.shaderSource = (shader, source) => {
      idwShader ||= source.includes("u_points");
      shaderSource(shader, source);
    };
    const points = [
      { x: 0.5, y: 0.5, value: 0 },
      { x: 4.5, y: 0.5, value: 2e-50 },
      { x: 100, y: 100, value: 1e6 },
    ];
    await mainRenderer(canvas, points, {
      0: "rgb(0, 0, 0)",
      1: "rgb(255, 255, 255)",
    }).render({
      points,
      width: 5,
      height: 1,
      influenceRadius: 5,
      minOpacity: 1,
      maxOpacity: 1,
      valueRange: { min: 0, max: 2e-50 },
    });
    const pixels = new Uint8Array(20);
    gl.readPixels(0, 0, 5, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { pixels: [...pixels], idwShader, error: gl.getError() };
  }, rendererBundle());
  expect(result.error).toBe(0);
  expect(result.idwShader).toBe(false);
  expect(result.pixels[0]).toBe(0);
  expect(Math.abs(result.pixels[8] - 128)).toBeLessThanOrEqual(1);
  expect(result.pixels[16]).toBe(255);
});

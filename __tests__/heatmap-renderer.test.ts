import { describe, expect, it, vi } from "vitest";
import mainRenderer from "../src/app/webGL/renderers/mainRenderer";
import { createHeatmapLayerRenderer } from "../src/app/webGL/renderers/layers/heatmapLayerRenderer";
import generateHeatmapFragmentShader from "../src/app/webGL/shaders/heatmapFragmentShader";

vi.mock("../src/app/webGL/renderers/layers/imageLayerRenderer", () => ({
  createBackgroundLayerRenderer: () => ({ draw: vi.fn() }),
}));

const createMockGL = (precision = 23) => ({
  FRAGMENT_SHADER: 0x8b30,
  HIGH_FLOAT: 0x8df2,
  getShaderPrecisionFormat: vi.fn(() => ({
    precision,
    rangeMin: 127,
    rangeMax: 127,
  })),
  createProgram: vi.fn(() => ({})),
  createShader: vi.fn(() => ({})),
  shaderSource: vi.fn(),
  compileShader: vi.fn(),
  getShaderParameter: vi.fn(() => true),
  attachShader: vi.fn(),
  linkProgram: vi.fn(),
  getProgramParameter: vi.fn(() => true),
  createBuffer: vi.fn(() => ({})),
  bindBuffer: vi.fn(),
  bufferData: vi.fn(),
  getAttribLocation: vi.fn(() => 0),
  getUniformLocation: vi.fn((_program: unknown, name: string) => name),
  useProgram: vi.fn(),
  enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(),
  uniform1f: vi.fn(),
  uniform2f: vi.fn(),
  uniform1i: vi.fn(),
  uniform3fv: vi.fn(),
  activeTexture: vi.fn(),
  createTexture: vi.fn(() => ({})),
  bindTexture: vi.fn(),
  pixelStorei: vi.fn(),
  texImage2D: vi.fn(),
  texParameteri: vi.fn(),
  drawArrays: vi.fn(),
  viewport: vi.fn(),
  enable: vi.fn(),
  blendFunc: vi.fn(),
});

const options = {
  width: 5,
  height: 3,
  influenceRadius: 100,
  minOpacity: 1,
  maxOpacity: 1,
  valueRange: { min: 20, max: 100 },
};
const gradient = { 0: "rgb(0, 0, 0)", 1: "rgb(255, 255, 255)" };
const makePoints = (values: number[]) =>
  values.map((value, i) => ({ x: i * 4 + 0.5, y: 0.5, value }));
type MockGL = ReturnType<typeof createMockGL>;
const context = (gl: MockGL) => gl as unknown as WebGLRenderingContext;
const uniform = (gl: MockGL, name: string): number =>
  gl.uniform1f.mock.calls.find(([key]) => key === name)![1];
const samples = (gl: MockGL): number[] => {
  const data = gl.uniform3fv.mock.calls[0][1] as Float32Array;
  return Array.from(data).filter((_, i) => i % 3 === 2);
};

// Uniform assertions verify selection and preparation, NOT GPU precision.
// The Playwright test exercises real shader compilation and pixel readback.
describe("heatmap renderer precision", () => {
  it("requires and forwards the resolved range via mainRenderer", async () => {
    const gl = createMockGL();
    const canvas = {
      getContext: () => context(gl),
    } as unknown as HTMLCanvasElement;
    const points = makePoints([20, 60, 100]);
    await mainRenderer(canvas, points, gradient).render({ ...options, points });
    expect(
      samples(gl).map((value) => value / uniform(gl, "u_maxSignal")),
    ).toEqual([0, 0.5, 1]);
    expect(
      gl.getUniformLocation.mock.calls.some(
        ([, name]) => name === "u_minSignal",
      ),
    ).toBe(false);
  });

  it("retains unclamped outliers on the normal highp path", () => {
    const gl = createMockGL();
    createHeatmapLayerRenderer(
      context(gl),
      makePoints([-100, 200]),
      gradient,
    ).draw(options);
    const [a, b] = samples(gl);
    expect(a).toBeLessThan(0);
    expect(b).toBeGreaterThan(uniform(gl, "u_maxSignal"));
    expect((a + b) / 2 / uniform(gl, "u_maxSignal")).toBeCloseTo(0.375);
    expect(gl.getShaderPrecisionFormat).toHaveBeenCalledWith(
      gl.FRAGMENT_SHADER,
      gl.HIGH_FLOAT,
    );
  });

  it("subtracts large offsets before float32 upload", () => {
    const gl = createMockGL();
    createHeatmapLayerRenderer(
      context(gl),
      makePoints([1e9, 1e9 + 1, 1e9 + 2]),
      gradient,
    ).draw({ ...options, valueRange: { min: 1e9, max: 1e9 + 2 } });
    expect(samples(gl)).toEqual([0, 0.5, 1]);
  });

  it.each([0, 10, 16])(
    "uses an RGBA texture, not IDW shader arithmetic, at precision %i",
    (precision) => {
      const gl = createMockGL(precision);
      createHeatmapLayerRenderer(
        context(gl),
        makePoints([-100, 200]),
        gradient,
      ).draw(options);
      expect(gl.uniform3fv).not.toHaveBeenCalled();
      expect(
        gl.shaderSource.mock.calls.some(([, source]) =>
          source.includes("u_points"),
        ),
      ).toBe(false);
      const pixels = gl.texImage2D.mock.calls[0][8] as Uint8Array;
      // Top row is the final texture row. Outliers give 0.375 at the midpoint,
      // rather than the 0.5 that per-sample clamping would produce.
      expect(pixels[(2 * 5 + 2) * 4]).toBeCloseTo(96, 0);
      expect(pixels[2 * 5 * 4]).toBe(0);
      expect(pixels[(2 * 5 + 4) * 4]).toBe(255);
      expect(gl.drawArrays).toHaveBeenCalledOnce();
    },
  );

  it.each([
    { valueRange: { min: 0, max: 1 }, outlier: 1e6 },
    { valueRange: { min: 0, max: 1e-50 }, outlier: 1 },
    { valueRange: { min: 1e9, max: 1e9 + 2 }, outlier: 2e9 },
  ])(
    "falls back for unsafe affine data even with highp: %j",
    ({ valueRange, outlier }) => {
      const gl = createMockGL();
      createHeatmapLayerRenderer(
        context(gl),
        makePoints([valueRange.min, outlier]),
        gradient,
      ).draw({ ...options, valueRange });
      expect(gl.uniform3fv).not.toHaveBeenCalled();
      expect(gl.texImage2D).toHaveBeenCalledOnce();
    },
  );

  it("does not draw empty datasets", () => {
    const gl = createMockGL();
    createHeatmapLayerRenderer(context(gl), [], gradient).draw(options);
    expect(gl.drawArrays).not.toHaveBeenCalled();
  });

  it.each([
    { min: 1, max: 1 },
    { min: 2, max: 1 },
    { min: NaN, max: 1 },
    { min: 0, max: Infinity },
  ])("asserts finite ordered bounds %j", (valueRange) => {
    const gl = createMockGL();
    const layer = createHeatmapLayerRenderer(
      context(gl),
      makePoints([1]),
      gradient,
    );
    expect(() => layer.draw({ ...options, valueRange })).toThrow(RangeError);
  });

  it("normalizes only after IDW in the highp shader", () => {
    const shader = generateHeatmapFragmentShader(2);
    expect(shader).toContain("precision highp float;");
    expect(shader).not.toContain("mediump");
    expect(shader).not.toContain("u_minSignal");
    expect(shader).toContain("1.0 / pow(distSq, u_power * 0.5)");
    expect(shader).toContain("weightedSum += weight * value;");
    expect(shader).toContain("float signal = weightedSum / weightTotal;");
    expect(shader).toContain("clamp(signal / u_maxSignal, 0.0, 1.0)");
    expect(shader.match(/clamp\(/g)).toHaveLength(1);
    expect(generateHeatmapFragmentShader(0)).toContain(
      "uniform vec3 u_points[1]",
    );
  });
});

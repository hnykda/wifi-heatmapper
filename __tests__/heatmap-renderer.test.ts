import { describe, expect, it, vi } from "vitest";
import mainRenderer from "@/app/webGL/renderers/mainRenderer";
import { createHeatmapLayerRenderer } from "@/app/webGL/renderers/layers/heatmapLayerRenderer";
import generateHeatmapFragmentShader from "@/app/webGL/shaders/heatmapFragmentShader";

vi.mock("@/app/webGL/renderers/layers/imageLayerRenderer", () => ({
  createBackgroundLayerRenderer: () => ({ draw: vi.fn() }),
}));

const createMockGL = () => ({
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
const samples = (gl: MockGL): number[] => {
  const data = gl.uniform3fv.mock.calls[0][1] as Float32Array;
  return Array.from(data).filter((_, i) => i % 3 === 2);
};
const draw = (values: number[], valueRange = options.valueRange) => {
  const gl = createMockGL();
  createHeatmapLayerRenderer(context(gl), makePoints(values), gradient).draw({
    ...options,
    valueRange,
  });
  return gl;
};

describe("heatmap renderer", () => {
  it("scales values to the range passed through mainRenderer", async () => {
    const gl = createMockGL();
    const canvas = {
      getContext: () => context(gl),
    } as unknown as HTMLCanvasElement;
    const points = makePoints([20, 60, 100]);
    await mainRenderer(canvas, points, gradient).render({ ...options, points });
    expect(samples(gl)).toEqual([0, 0.5, 1]);
  });

  it("keeps values outside the range unclamped for interpolation", () => {
    expect(samples(draw([-60, 180]))).toEqual([-1, 2]);
  });

  it("subtracts large offsets before the float32 upload", () => {
    const gl = draw([1e9, 1e9 + 1, 1e9 + 2], { min: 1e9, max: 1e9 + 2 });
    expect(samples(gl)).toEqual([0, 0.5, 1]);
  });

  it("does not draw empty datasets", () => {
    expect(draw([]).drawArrays).not.toHaveBeenCalled();
  });

  it.each([
    { min: 1, max: 1 },
    { min: 2, max: 1 },
    { min: NaN, max: 1 },
    { min: 0, max: Infinity },
  ])("rejects range %j", (valueRange) => {
    expect(() => draw([1], valueRange)).toThrow(RangeError);
  });

  it("clamps once, after interpolation, at the best available precision", () => {
    const shader = generateHeatmapFragmentShader(2);
    expect(shader).toContain("#ifdef GL_FRAGMENT_PRECISION_HIGH");
    expect(shader).toContain("float signal = weightedSum / weightTotal;");
    expect(shader).toContain("clamp(signal, 0.0, 1.0)");
    expect(shader.match(/clamp\(/g)).toHaveLength(1);
    expect(generateHeatmapFragmentShader(0)).toContain(
      "uniform vec3 u_points[1]",
    );
  });
});

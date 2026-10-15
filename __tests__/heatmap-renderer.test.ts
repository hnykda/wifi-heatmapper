import { describe, expect, it, vi } from "vitest";
import mainRenderer from "../src/app/webGL/renderers/mainRenderer";
import { createHeatmapLayerRenderer } from "../src/app/webGL/renderers/layers/heatmapLayerRenderer";
import generateHeatmapFragmentShader from "../src/app/webGL/shaders/heatmapFragmentShader";

vi.mock("@/app/webGL/shaders/fullscreenQuadVertexShader", () => ({
  fullscreenQuadVertexShaderFlipY: "vertex shader",
}));
vi.mock("../src/app/webGL/renderers/textures/createGradientLUTTexture", () => ({
  createGradientLUTTexture: vi.fn(() => ({})),
}));
vi.mock("../src/app/webGL/renderers/layers/imageLayerRenderer", () => ({
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
  bindTexture: vi.fn(),
  drawArrays: vi.fn(),
  viewport: vi.fn(),
  enable: vi.fn(),
  blendFunc: vi.fn(),
});

const options = {
  width: 800,
  height: 600,
  influenceRadius: 100,
  minOpacity: 0.2,
  maxOpacity: 0.7,
};
const gradient = { 0: "#000000", 1: "#ffffff" };
const makePoints = (values: number[]) =>
  values.map((value, i) => ({ x: i * 10, y: 20, value }));
type MockGL = ReturnType<typeof createMockGL>;
const context = (gl: MockGL) => gl as unknown as WebGLRenderingContext;
const uniform = (gl: MockGL, name: string): number =>
  gl.uniform1f.mock.calls.find(([key]) => key === name)![1];
const samples = (gl: MockGL): number[] => {
  const data = gl.uniform3fv.mock.calls[0][1] as Float32Array;
  return Array.from(data).filter((_, i) => i % 3 === 2);
};
const normalize = (gl: MockGL, signal: number) => {
  const min = uniform(gl, "u_minSignal");
  const max = uniform(gl, "u_maxSignal");
  return Math.max(0, Math.min(1, (signal - min) / (max - min)));
};

// These tests inspect the actual uniforms passed through the WebGL layer.
// Shader assertions below guard the interpolation/normalization order.
describe("heatmap colour scale", () => {
  it("forwards the optional range from mainRenderer.render and retains old callers", async () => {
    const gl = createMockGL();
    const canvas = {
      getContext: () => context(gl),
    } as unknown as HTMLCanvasElement;
    const points = makePoints([20, 40]);
    const renderer = mainRenderer(canvas, points, gradient);
    await renderer.render({
      ...options,
      points,
      valueRange: { min: 0, max: 100 },
    });
    expect(normalize(gl, samples(gl)[1])).toBeCloseTo(0.4);

    gl.uniform1f.mockClear();
    gl.uniform3fv.mockClear();
    await renderer.render({ ...options, points });
    expect(normalize(gl, samples(gl)[1])).toBe(1);
  });

  it("supports nonzero bounds, endpoints, and negative raw values", () => {
    const gl = createMockGL();
    createHeatmapLayerRenderer(
      context(gl),
      makePoints([-100, -60, -20]),
      gradient,
    ).draw({ ...options, valueRange: { min: -100, max: -20 } });
    expect(samples(gl).map((value) => normalize(gl, value))).toEqual([
      0, 0.5, 1,
    ]);
  });

  it("does not clamp outliers before interpolation", () => {
    const gl = createMockGL();
    createHeatmapLayerRenderer(
      context(gl),
      makePoints([-100, 200]),
      gradient,
    ).draw({ ...options, valueRange: { min: 20, max: 100 } });
    const [a, b] = samples(gl);
    expect(a).toBeLessThan(uniform(gl, "u_minSignal"));
    expect(b).toBeGreaterThan(uniform(gl, "u_maxSignal"));
    // Equal IDW weights give raw signal 50: (50 - 20) / 80 = 0.375.
    // Clamping the individual samples instead would incorrectly give 0.5.
    expect(normalize(gl, (a + b) / 2)).toBeCloseTo(0.375);
    expect(normalize(gl, a)).toBe(0);
    expect(normalize(gl, b)).toBe(1);
  });

  it("keeps gigabit values bounded and preserves a narrow span at a large offset", () => {
    const gl = createMockGL();
    createHeatmapLayerRenderer(
      context(gl),
      makePoints([1e9, 1e9 + 1, 1e9 + 2, 2e9]),
      gradient,
    ).draw({ ...options, valueRange: { min: 1e9, max: 1e9 + 2 } });
    expect(
      samples(gl).every(
        (value) => Number.isFinite(value) && Math.abs(value) <= 1,
      ),
    ).toBe(true);
    expect(normalize(gl, samples(gl)[1])).toBeCloseTo(0.5);
    expect(uniform(gl, "u_maxSignal")).toBeGreaterThan(0);
  });

  it.each([
    [20, 40],
    [1e-10, 2e-10],
  ])("auto-scales to the positive observed max (%j)", (a, b) => {
    const gl = createMockGL();
    createHeatmapLayerRenderer(context(gl), makePoints([a, b]), gradient).draw(
      options,
    );
    expect(samples(gl).map((value) => normalize(gl, value))).toEqual([0.5, 1]);
  });

  it.each([
    [0, 0],
    [-20, -10],
  ])("uses a safe positive span without positive samples (%j)", (a, b) => {
    const gl = createMockGL();
    createHeatmapLayerRenderer(context(gl), makePoints([a, b]), gradient).draw(
      options,
    );
    expect(uniform(gl, "u_maxSignal")).toBeGreaterThan(0);
    expect(samples(gl).every(Number.isFinite)).toBe(true);
    expect(samples(gl).map((value) => normalize(gl, value))).toEqual([0, 0]);
  });

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
  ])("rejects invalid explicit bounds %j", (valueRange) => {
    const gl = createMockGL();
    const layer = createHeatmapLayerRenderer(
      context(gl),
      makePoints([1]),
      gradient,
    );
    expect(() => layer.draw({ ...options, valueRange })).toThrow(RangeError);
  });

  it("normalizes only the interpolated signal in the shader", () => {
    const shader = generateHeatmapFragmentShader(2);
    expect(shader).toContain("#ifdef GL_FRAGMENT_PRECISION_HIGH");
    expect(shader).toContain("precision highp float;");
    expect(shader).toContain("weightedSum += weight * value;");
    expect(shader).toContain("float signal = weightedSum / weightTotal;");
    expect(shader).toContain(
      "clamp((signal - u_minSignal) / (u_maxSignal - u_minSignal), 0.0, 1.0)",
    );
    expect(shader.match(/clamp\(/g)).toHaveLength(1);
    expect(shader.indexOf("float signal =")).toBeLessThan(
      shader.indexOf("clamp("),
    );
    expect(generateHeatmapFragmentShader(0)).toContain(
      "uniform vec3 u_points[1]",
    );
  });
});

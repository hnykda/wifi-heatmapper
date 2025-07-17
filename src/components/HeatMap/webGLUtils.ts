// -- BUFFER SETUP --
export const createFullScreenQuad = (
  gl: WebGLRenderingContext,
): WebGLBuffer => {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  return buffer;
};

// -- UNIFORM LOOKUPS --

export const getUniformLocations = (
  gl: WebGLRenderingContext,
  program: WebGLProgram,
) => ({
  u_radius: gl.getUniformLocation(program, "u_radius"),
  u_power: gl.getUniformLocation(program, "u_power"),
  u_opacity: gl.getUniformLocation(program, "u_opacity"),
  u_maxSignal: gl.getUniformLocation(program, "u_maxSignal"),
  u_resolution: gl.getUniformLocation(program, "u_resolution"),
  u_pointCount: gl.getUniformLocation(program, "u_pointCount"),
  u_points: gl.getUniformLocation(program, "u_points"),
  u_lut: gl.getUniformLocation(program, "u_lut"),
});

export const getAttribLocations = (
  gl: WebGLRenderingContext,
  program: WebGLProgram,
) => ({
  a_position: gl.getAttribLocation(program, "a_position"),
});

export const compileShader = (
  gl: WebGLRenderingContext,
  type: number,
  source: string,
) => {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
  }
  return shader;
};

export const createShaderProgram = (
  gl: WebGLRenderingContext,
  vertexSrc: string,
  fragmentSrc: string,
): WebGLProgram => {
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create WebGL program");

  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSrc));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc));
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(
      gl.getProgramInfoLog(program) || "Shader program failed to link",
    );
  }

  return program;
};

// -- SHADER SETUP --
export const createWebGLContext = (
  canvas: HTMLCanvasElement,
): WebGLRenderingContext => {
  const gl = canvas.getContext("webgl", { alpha: true });
  if (!gl) throw new Error("WebGL not supported");

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  return gl;
};

import { fullscreenQuadVertexShader } from "@/app/webGL/shaders/fullscreenQuadVertexShaderFlipY";
import {
  createShaderProgram,
  createFullScreenQuad,
  getAttribLocations,
} from "./webGLUtils";
import { fragmentShader } from "@/app/webGL/fragments/fragmentShader";

const contextCache = new WeakMap<
  WebGLRenderingContext,
  {
    program: WebGLProgram;
    quad: WebGLBuffer;
    attribs: { a_position: number };
    u_texture: WebGLUniformLocation;
  }
>();

export const drawTextureFullScreen = (
  gl: WebGLRenderingContext,
  texture: WebGLTexture,
) => {
  let ctx = contextCache.get(gl);

  if (!ctx) {
    const program = createShaderProgram(
      gl,
      fullscreenQuadVertexShader,
      fragmentShader,
    );
    const quad = createFullScreenQuad(gl);
    const attribs = getAttribLocations(gl, program);
    const u_texture = gl.getUniformLocation(program, "u_texture")!;

    ctx = { program, quad, attribs, u_texture };
    contextCache.set(gl, ctx);
  }

  gl.useProgram(ctx.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.quad);
  gl.enableVertexAttribArray(ctx.attribs.a_position);
  gl.vertexAttribPointer(ctx.attribs.a_position, 2, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(ctx.u_texture, 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
};

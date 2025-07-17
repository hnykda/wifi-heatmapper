const vertexShaderSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = vec2(a_position.x * 0.5 + 0.5, -a_position.y * 0.5 + 0.5);
      gl_Position = vec4(a_position, 0, 1);
    }
  `;

export default vertexShaderSource;

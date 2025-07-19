import React, { useRef, useEffect } from 'react';
const vertexShaderSource = `
  attribute vec2 a_position;

  void main() {
    gl_Position = vec4(a_position, 0, 1);
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  uniform vec2 u_resolution;
  uniform float u_radius;
  uniform float u_max_opacity;
  uniform float u_min_opacity;
  uniform sampler2D u_gradient;
  uniform vec3 u_points[100]; // Assuming a maximum of 100 points for now
  uniform int u_num_points;

  void main() {
    vec2 st = gl_FragCoord.xy;
    float total_value = 0.0;
    float total_weight = 0.0;

    for (int i = 0; i < u_num_points; i++) {
      float dist = distance(st, u_points[i].xy);
      if (dist < u_radius) {
        float weight = pow(1.0 - dist / u_radius, 2.0);
        total_value += u_points[i].z * weight;
        total_weight += weight;
      }
    }

    if (total_weight > 0.0) {
      float value = total_value / total_weight / 100.0; // Normalize to 0-1
      vec4 color = texture2D(u_gradient, vec2(value, 0.5));
      float opacity = mix(u_min_opacity, u_max_opacity, value);
      gl_FragColor = vec4(color.rgb, opacity);
    } else {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }
  }
`;

interface WebGLHeatmapProps {
  width: number;
  height: number;
  points: { x: number; y: number; value: number }[];
  radius: number;
  maxOpacity: number;
  minOpacity: number;
  gradient: { [key: string]: string };
}

const WebGLHeatmap: React.FC<WebGLHeatmapProps> = ({
  width,
  height,
  points,
  radius,
  maxOpacity,
  minOpacity,
  gradient,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    const program = createProgram(gl, vertexShader, fragmentShader);

    if (!program) {
        return;
    }

    const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
    const resolutionUniformLocation = gl.getUniformLocation(program, 'u_resolution');
    const pointsUniformLocation = gl.getUniformLocation(program, 'u_points');
    const numPointsUniformLocation = gl.getUniformLocation(program, 'u_num_points');
    const radiusUniformLocation = gl.getUniformLocation(program, 'u_radius');
    const maxOpacityUniformLocation = gl.getUniformLocation(program, 'u_max_opacity');
    const minOpacityUniformLocation = gl.getUniformLocation(program, 'u_min_opacity');
    const gradientUniformLocation = gl.getUniformLocation(program, 'u_gradient');


    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);

    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(radiusUniformLocation, radius);
    gl.uniform1f(maxOpacityUniformLocation, maxOpacity);
    gl.uniform1f(minOpacityUniformLocation, minOpacity);

    const pointsData = new Float32Array(points.flatMap(p => [p.x, p.y, p.value]));
    gl.uniform3fv(pointsUniformLocation, pointsData);
    gl.uniform1i(numPointsUniformLocation, points.length);

    const gradientTexture = createGradientTexture(gl, gradient);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gradientTexture);
    gl.uniform1i(gradientUniformLocation, 0);


    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }, [width, height, points, radius, maxOpacity, minOpacity, gradient]);

  const createShader = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) {
      console.error('unable to create shader');
      return null;
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
      return shader;
    }
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  };

  const createProgram = (gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null => {
    const program = gl.createProgram();
    if (!program) {
      console.error('unable to create program');
      return null;
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
      return program;
    }
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  };

  const createGradientTexture = (gl: WebGLRenderingContext, gradient: { [key: string]: string }): WebGLTexture | null => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return null;
    }
    canvas.width = 256;
    canvas.height = 1;
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    for (const stop in gradient) {
      grad.addColorStop(parseFloat(stop), gradient[stop]);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 1);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  };


  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'none' }} />;
};

export default WebGLHeatmap;

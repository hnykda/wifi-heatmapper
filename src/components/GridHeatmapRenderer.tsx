import { mapValueToColor } from "@/lib/colorLookup";
import React, { useEffect, useRef } from "react";

export interface GridHeatmapRendererProps {
  points: HeatmapPoint[];
  width: number;
  height: number;
  backgroundImageSrc?: string;
  globalOpacity?: number;
  influenceRadius?: number;
}

export type HeatmapPoint = {
  x: number;
  y: number;
  value: number;
};

function createColorLUTTexture(gl: WebGLRenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  const size = 256;
  const buffer = new Uint8Array(size * 4);

  for (let i = 0; i < size; i++) {
    const [r, g, b] = mapValueToColor(i / 255);
    buffer[i * 4 + 0] = r;
    buffer[i * 4 + 1] = g;
    buffer[i * 4 + 2] = b;
    buffer[i * 4 + 3] = 255;
  }

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    size,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    buffer,
  );

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return texture;
}

function generateFragmentShader(pointCount: number): string {
  console.log(pointCount);
  return `
    precision mediump float;
    varying vec2 v_uv;
    uniform float u_radius;
    uniform float u_power;
    uniform float u_maxSignal;
    uniform float u_opacity;
    uniform vec2 u_resolution;
    uniform int u_pointCount;
    uniform vec3 u_points[${pointCount}];
    uniform sampler2D u_lut;

    void main() {
      vec2 pixel = v_uv * u_resolution;
      float weightedSum = 0.0;
      float weightTotal = 0.0;

      for (int i = 0; i < ${pointCount}; ++i) {
        if (i >= u_pointCount) break;
        vec2 point = u_points[i].xy;
        float value = u_points[i].z;
        vec2 diff = pixel - point;
        float distSq = dot(diff, diff);
        if (distSq < 1e-6) {
          weightedSum = value;
          weightTotal = 1.0;
          break;
        }
        if (distSq > u_radius * u_radius) continue;
        float weight = 1.0 / pow(distSq, u_power * 0.5);
        weightedSum += weight * value;
        weightTotal += weight;
      }

      float signal = weightTotal == 0.0 ? 0.0 : weightedSum / weightTotal;
      float normalized = clamp(signal / u_maxSignal, 0.0, 1.0);
      vec3 color = texture2D(u_lut, vec2(normalized, 0.5)).rgb;
      gl_FragColor = vec4(color, u_opacity);
    }
  `;
}

const createHeatmapWebGLRenderer = (
  canvas: HTMLCanvasElement,
  size: number,
) => {
  const gl = canvas.getContext("webgl", { alpha: true });
  if (!gl) throw new Error("WebGL not supported");
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const vertexShaderSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = vec2(a_position.x * 0.5 + 0.5, -a_position.y * 0.5 + 0.5);
      gl_Position = vec4(a_position, 0, 1);
    }
  `;

  const fragmentShaderSource = generateFragmentShader(size);

  const compileShader = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
    }
    return shader;
  };

  const program = gl.createProgram()!;
  gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShaderSource));
  gl.attachShader(
    program,
    compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource),
  );
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Program link failed");
  }

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const attribs = {
    a_position: gl.getAttribLocation(program, "a_position"),
  };

  const uniforms = {
    u_radius: gl.getUniformLocation(program, "u_radius"),
    u_power: gl.getUniformLocation(program, "u_power"),
    u_opacity: gl.getUniformLocation(program, "u_opacity"),
    u_maxSignal: gl.getUniformLocation(program, "u_maxSignal"),
    u_resolution: gl.getUniformLocation(program, "u_resolution"),
    u_pointCount: gl.getUniformLocation(program, "u_pointCount"),
    u_points: gl.getUniformLocation(program, "u_points"),
    u_lut: gl.getUniformLocation(program, "u_lut"),
  };

  const render = (props: GridHeatmapRendererProps, colorLUT: WebGLTexture) => {
    const {
      points,
      width,
      height,
      globalOpacity = 0.5,
      influenceRadius = 100,
    } = props;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);

    const pointData = new Float32Array(points.length * 3);
    let maxSignal = 0;
    for (let i = 0; i < points.length; i++) {
      const { x, y, value } = points[i];
      pointData[i * 3 + 0] = x;
      pointData[i * 3 + 1] = y;
      pointData[i * 3 + 2] = value;
      if (value > maxSignal) maxSignal = value;
    }
    if (maxSignal === 0) maxSignal = 1;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(attribs.a_position);
    gl.vertexAttribPointer(attribs.a_position, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(uniforms.u_radius, influenceRadius);
    gl.uniform1f(uniforms.u_power, 2);
    gl.uniform1f(uniforms.u_opacity, globalOpacity);
    gl.uniform1f(uniforms.u_maxSignal, maxSignal);
    gl.uniform2f(uniforms.u_resolution, width, height);
    gl.uniform1i(uniforms.u_pointCount, Math.min(points.length, points.length));
    gl.uniform3fv(uniforms.u_points, pointData);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, colorLUT);
    gl.uniform1i(uniforms.u_lut, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  return { render };
};

export const GridHeatmapRenderer: React.FC<GridHeatmapRendererProps> = ({
  points,
  width,
  height,
  backgroundImageSrc,
  globalOpacity = 0.5,
  influenceRadius = 200,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      const visibleCanvas = canvasRef.current;
      if (!visibleCanvas) return;

      const context = visibleCanvas.getContext("2d");
      if (!context) return;

      const glCanvas = document.createElement("canvas");
      glCanvas.width = width;
      glCanvas.height = height;

      const gl = glCanvas.getContext("webgl");
      if (!gl) throw new Error("WebGL not supported");

      const colorLUT = createColorLUTTexture(gl);
      const renderer = createHeatmapWebGLRenderer(glCanvas, points.length);

      renderer.render(
        {
          points,
          influenceRadius,
          globalOpacity,
          width,
          height,
        },
        colorLUT,
      );

      const draw = () => {
        context.clearRect(0, 0, width, height);

        if (backgroundImageSrc) {
          const image = new Image();
          image.src = backgroundImageSrc;
          image.onload = () => {
            context.drawImage(image, 0, 0, width, height);
            context.drawImage(glCanvas, 0, 0); // draw WebGL result
          };
        } else {
          context.drawImage(glCanvas, 0, 0);
        }
      };

      if (!cancelled) {
        draw();
      }
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [
    points,
    width,
    height,
    backgroundImageSrc,
    globalOpacity,
    influenceRadius,
  ]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: "600px" }}
    />
  );
};

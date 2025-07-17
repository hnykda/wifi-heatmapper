/**
 * Generates a GLSL fragment shader for rendering a weighted signal map.
 *
 * Each point contributes signal based on inverse-distance weighting.
 * The result is normalized and mapped through a color LUT.
 *
 * @param pointCount - Number of max point uniforms; sets array + loop bounds
 * @returns A fully constructed GLSL fragment shader as a string
 */
const generateFragmentShader = (pointCount: number): string => `
  precision mediump float;

  varying vec2 v_uv; // Normalized coordinates from vertex shader, in [0, 1]

  uniform float u_radius;       // Radius of influence for each point
  uniform float u_power;        // Weight falloff exponent (higher = faster decay)
  uniform float u_maxSignal;    // Maximum expected signal value (used for normalization)
  uniform float u_opacity;      // Final fragment opacity
  uniform vec2 u_resolution;    // Pixel dimensions of output framebuffer
  uniform int u_pointCount;     // Actual number of active points (may be < ${pointCount})
  uniform vec3 u_points[${pointCount}]; // Each point = (x, y, value) in pixel-space
  uniform sampler2D u_lut;      // 1D LUT texture mapping signal to RGB color

  void main() {
    // Example: if v_uv = (0.5, 0.5) and resolution = (800, 600), then pixel = (400, 300)
    vec2 pixel = v_uv * u_resolution;

    float weightedSum = 0.0; // Sum of (weight * value)
    float weightTotal = 0.0; // Sum of weights

    // Iterate over all provided points (vec3: x, y, value)
    for (int i = 0; i < ${pointCount}; ++i) {
      if (i >= u_pointCount) break; // Prevent reading undefined data

      vec2 point = u_points[i].xy;  // Point position in pixels
      float value = u_points[i].z;  // Scalar signal at that point

      vec2 diff = pixel - point;
      float distSq = dot(diff, diff); // Squared Euclidean distance (cheaper than sqrt)

      // Example: if pixel == point, distSq == 0 → use this point's value directly
      if (distSq < 1e-6) {
        weightedSum = value;
        weightTotal = 1.0;
        break;
      }

      // Skip points outside of influence radius
      // Example: if u_radius = 100, skip if dist > 100 → distSq > 100^2 = 10000
      if (distSq > u_radius * u_radius) continue;

      // Inverse-distance weighting with power falloff
      // Example: distSq = 25, u_power = 2 → weight = 1 / 25 = 0.04
      float weight = 1.0 / pow(distSq, u_power * 0.5);

      weightedSum += weight * value;
      weightTotal += weight;
    }

    // Normalize signal to [0, 1] range
    // Example: if weightedSum = 3, weightTotal = 5 → signal = 0.6
    float signal = weightTotal == 0.0 ? 0.0 : weightedSum / weightTotal;
    float normalized = clamp(signal / u_maxSignal, 0.0, 1.0);

    // Lookup color from LUT texture using normalized signal
    // Example: normalized = 0.75 → texture2D(u_lut, vec2(0.75, 0.5))
    vec3 color = texture2D(u_lut, vec2(normalized, 0.5)).rgb;

    // Output the final fragment color with given opacity
    gl_FragColor = vec4(color, u_opacity);
  }
`;

export default generateFragmentShader;

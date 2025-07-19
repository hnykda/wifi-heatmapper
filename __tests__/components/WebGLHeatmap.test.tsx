import React from 'react';
import { render } from '@testing-library/react';
import { describe, it } from 'vitest';
import WebGLHeatmap from '@/components/WebGLHeatmap';
import 'vitest-canvas-mock';

describe('WebGLHeatmap', () => {
  it('renders without crashing', () => {
    const points = [
      { x: 10, y: 10, value: 50 },
      { x: 50, y: 50, value: 100 },
    ];
    const gradient = {
      '0.0': 'blue',
      '0.5': 'cyan',
      '1.0': 'red',
    };
    render(
      <WebGLHeatmap
        width={100}
        height={100}
        points={points}
        radius={20}
        maxOpacity={0.8}
        minOpacity={0.2}
        gradient={gradient}
      />
    );
  });
});

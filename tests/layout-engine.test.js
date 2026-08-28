import { describe, it, expect } from 'vitest';
import { calculateLayout } from '../js/layout-engine.js';

describe('calculateLayout', () => {
  it('packs 一寸 (25x35) into A4 with zero margin/gap', () => {
    const layout = calculateLayout(
      { w: 25, h: 35 },
      { w: 210, h: 297 },
      { top: 0, bottom: 0, left: 0, right: 0 },
      { h: 0, v: 0 }
    );
    expect(layout.cols).toBe(8);
    expect(layout.rows).toBe(8);
    expect(layout.count).toBe(64);
  });

  it('packs 一寸 (25x35) into A4 with default margin (5mm) and gap (2mm)', () => {
    const layout = calculateLayout(
      { w: 25, h: 35 },
      { w: 210, h: 297 },
      { top: 5, bottom: 5, left: 5, right: 5 },
      { h: 2, v: 2 }
    );
    expect(layout.cols).toBe(7);
    expect(layout.rows).toBe(7);
    expect(layout.count).toBe(49);
  });

  it('returns 0 count when paper is too small', () => {
    const layout = calculateLayout(
      { w: 25, h: 35 },
      { w: 30, h: 30 },
      { top: 5, bottom: 5, left: 5, right: 5 },
      { h: 2, v: 2 }
    );
    // usableW = 20 < 25 + 2, so cols = 0 → count = 0
    expect(layout.count).toBe(0);
    expect(layout.positions).toEqual([]);
  });

  it('produces correct positions for a single-row case', () => {
    const layout = calculateLayout(
      { w: 20, h: 20 },
      { w: 100, h: 30 },
      { top: 5, bottom: 5, left: 5, right: 5 },
      { h: 0, v: 0 }
    );
    // usableW = 90, cols = floor(90/20) = 4
    // usableH = 20, rows = floor(20/20) = 1
    expect(layout.cols).toBe(4);
    expect(layout.rows).toBe(1);
    expect(layout.positions).toEqual([
      { x: 5, y: 5 },
      { x: 25, y: 5 },
      { x: 45, y: 5 },
      { x: 65, y: 5 },
    ]);
  });

  it('handles asymmetric margins', () => {
    const layout = calculateLayout(
      { w: 25, h: 35 },
      { w: 100, h: 200 },
      { top: 10, bottom: 0, left: 0, right: 0 },
      { h: 0, v: 0 }
    );
    // usableW = 100, cols = 4
    // usableH = 190, rows = floor(190/35) = 5
    expect(layout.cols).toBe(4);
    expect(layout.rows).toBe(5);
    expect(layout.positions[0]).toEqual({ x: 0, y: 10 });
    expect(layout.positions[3]).toEqual({ x: 75, y: 10 }); // last column, first row
  });
});

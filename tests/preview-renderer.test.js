import { describe, it, expect, vi } from 'vitest';
import { renderPreview } from '../js/preview-renderer.js';
import { SourceItem } from '../js/source-item.js';
import { PAPER_SIZES } from '../js/constants.js';

// Minimal SourceItem that returns a small canvas (real canvas needed because
// renderPreview calls ctx.drawImage on it).
function makeItem(w, h) {
  return new (class extends SourceItem {
    constructor() { super(); this._size = { w, h }; }
    get size() { return this._size; }
    get canvas() {
      const c = document.createElement('canvas');
      c.width = 1; c.height = 1;
      return c;
    }
  })();
}

// Count any dark pixel in the canvas — crop marks paint black strokes.
function countBlackPixels(canvas) {
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let blackPixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    if (r < 50 && g < 50 && b < 50) blackPixels++;
  }
  return blackPixels;
}

describe('renderPreview — crop marks', () => {
  it('draws crop marks when showCropMarks is true (card mode, once)', () => {
    const c = document.createElement('canvas');
    const item = makeItem(25, 35);
    renderPreview(
      c,
      { paperSize: 'A4', margin: { top: 5, bottom: 5, left: 5, right: 5 },
        gap: { h: 2, v: 2 }, drawing: 'once', showCropMarks: true },
      PAPER_SIZES,
      [item]
    );
    // Crop marks should paint black pixels around items.
    // jsdom+canvas doesn't render fillText/glyphs the same, but stroke() does work.
    expect(countBlackPixels(c)).toBeGreaterThan(0);
  });

  it('omits crop marks when showCropMarks is false (card mode, once)', () => {
    const c = document.createElement('canvas');
    const item = makeItem(25, 35);
    renderPreview(
      c,
      { paperSize: 'A4', margin: { top: 5, bottom: 5, left: 5, right: 5 },
        gap: { h: 2, v: 2 }, drawing: 'once', showCropMarks: false },
      PAPER_SIZES,
      [item]
    );
    expect(countBlackPixels(c)).toBe(0);
  });
});

describe('renderPreview — arrange orientation', () => {
  it('uses arrangedSize for layout when arrangeOrient differs from item.size', () => {
    // Item designed landscape (90, 54); arrange portrait → arrangedSize = (54, 90).
    // 6 寸 paper = (102, 152). usableW = 92, usableH = 142.
    // cols = floor(94/56) = 1, rows = floor(144/92) = 1.
    const c = document.createElement('canvas');
    const item = makeItem(90, 54);
    const layout = renderPreview(
      c,
      { paperSize: '6寸（4R）', margin: { top: 5, bottom: 5, left: 5, right: 5 },
        gap: { h: 2, v: 2 }, drawing: 'once', showCropMarks: false,
        arrangeOrient: 'portrait' },
      PAPER_SIZES,
      [item]
    );
    expect(layout.count).toBe(1);
    expect(layout.cols).toBe(1);
    expect(layout.rows).toBe(1);
  });

  it('zoom centers the photo on cell center, not top-left corner', () => {
    // Custom paper 15×15 mm, margin 0, gap 0, item 5×5 → grid 3×3.
    // Cell at (5, 5) has center (7.5, 7.5) mm.
    // Preview scale = 600/15 = 40 px/mm.
    // zoom=2 → drawn wPx = hPx = 5*2*40 = 400; centered on cell → top-left = (100, 100).
    const c = document.createElement('canvas');
    const item = makeItem(5, 5);
    const ctx = c.getContext('2d');
    const drawImageSpy = vi.spyOn(ctx, 'drawImage');
    renderPreview(
      c,
      { paperSize: 'TINY', margin: { top: 0, bottom: 0, left: 0, right: 0 },
        gap: { h: 0, v: 0 }, drawing: 'repeat', zoom: 2,
        showCropMarks: false, showFooter: false },
      { TINY: { w: 15, h: 15 } },
      [item]
    );
    // Find a drawImage call for cell at (5, 5): x = y = 100, w = h = 400.
    const matched = drawImageSpy.mock.calls.find(args =>
      args[1] === 100 && args[2] === 100 && args[3] === 400 && args[4] === 400
    );
    expect(matched).toBeTruthy();
  });

  it('rotation path uses layoutSize for cell center, not designedSize', () => {
    // Item designed landscape (90, 54); arrange portrait → layoutSize = (54, 90).
    // Paper 220×300 mm, margin 0, gap 0 → first cell at (0, 0).
    // Layout cell is layoutSize = (54, 90); its center is (27, 45) mm.
    // Card drawn rotated 90° should be centered on layout cell center.
    // Preview scale = min(600/220, 600/300) = 2.0 (height-bounded in jsdom).
    const c = document.createElement('canvas');
    const item = makeItem(90, 54);
    const ctx = c.getContext('2d');
    const translateSpy = vi.spyOn(ctx, 'translate');
    renderPreview(
      c,
      { paperSize: 'ARR', margin: { top: 0, bottom: 0, left: 0, right: 0 },
        gap: { h: 0, v: 0 }, drawing: 'once', zoom: 1,
        showCropMarks: false, showFooter: false,
        arrangeOrient: 'portrait' },
      { ARR: { w: 220, h: 300 } },
      [item]
    );
    // Cell center in mm = (27, 45); preview scale = 2; expect translate(54, 90).
    const expectedX = Math.round(27 * 2);  // 54
    const expectedY = Math.round(45 * 2);  // 90
    const matched = translateSpy.mock.calls.find(args =>
      Math.round(args[0]) === expectedX && Math.round(args[1]) === expectedY
    );
    expect(matched).toBeTruthy();
  });

  it('uses designedSize when arrangeOrient matches item orientation', () => {
    // Item portrait (25, 35); arrange portrait → size (25, 35).
    // 6 寸 (102, 152). cols = floor(94/27) = 3, rows = floor(144/37) = 3.
    const c = document.createElement('canvas');
    const item = makeItem(25, 35);
    const layout = renderPreview(
      c,
      { paperSize: '6寸（4R）', margin: { top: 5, bottom: 5, left: 5, right: 5 },
        gap: { h: 2, v: 2 }, drawing: 'once', showCropMarks: false,
        arrangeOrient: 'portrait' },
      PAPER_SIZES,
      [item]
    );
    expect(layout.count).toBe(9);
  });

  it('arrangeOrient landscape on landscape item: no swap', () => {
    // Item landscape (90, 54); arrange landscape → size (90, 54).
    // 6 寸 (102, 152). cols = floor(94/92) = 1, rows = floor(144/56) = 2.
    const c = document.createElement('canvas');
    const item = makeItem(90, 54);
    const layout = renderPreview(
      c,
      { paperSize: '6寸（4R）', margin: { top: 5, bottom: 5, left: 5, right: 5 },
        gap: { h: 2, v: 2 }, drawing: 'once', showCropMarks: false,
        arrangeOrient: 'landscape' },
      PAPER_SIZES,
      [item]
    );
    expect(layout.count).toBe(2);
  });
});
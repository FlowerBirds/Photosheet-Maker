import { describe, it, expect } from 'vitest';
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
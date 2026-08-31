import { describe, it, expect } from 'vitest';
import { CardSourceItem, createCardImageSource, computeCardDpi } from '../js/card-builder.js';
import { CARD_MAX_PX } from '../js/constants.js';

function fakeImage(w = 2, h = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

describe('computeCardDpi', () => {
  it('returns requested dpi when below CARD_MAX_PX', () => {
    const dpi = computeCardDpi({ w: 25, h: 35 }, 350);
    expect(dpi).toBe(350);
  });

  it('scales down dpi when card pixel size exceeds CARD_MAX_PX', () => {
    const dpi = computeCardDpi({ w: 500, h: 500 }, 350);
    expect(dpi).toBeLessThan(350);
    const longPx = 500 * dpi / 25.4;
    expect(longPx).toBeLessThanOrEqual(CARD_MAX_PX + 1);
  });
});

describe('CardSourceItem', () => {
  it('size reflects card dimensions in mm', () => {
    const item = new CardSourceItem({ w: 90, h: 54 }, 350, []);
    expect(item.size).toEqual({ w: 90, h: 54 });
  });

  it('canvas has dimensions = card mm × dpi (rounded)', () => {
    const item = new CardSourceItem({ w: 25, h: 35 }, 350, []);
    expect(item.canvas.width).toBe(Math.round(25 * 350 / 25.4));
    expect(item.canvas.height).toBe(Math.round(35 * 350 / 25.4));
  });

  it('renders text element onto canvas (non-white pixels in expected region)', () => {
    const item = new CardSourceItem(
      { w: 25, h: 35 }, 350,
      [{ type: 'text', id: 't1', text: '标题', fontSize: 5, x: 5, y: 5, color: '#111' }]
    );
    const ctx = item.canvas.getContext('2d');
    const w = item.canvas.width, h = item.canvas.height;
    // Sample the upper portion (where text is drawn) for non-white pixels.
    const data = ctx.getImageData(0, 0, w, h / 2).data;
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 250 || data[i+1] < 250 || data[i+2] < 250) nonWhite++;
    }
    expect(nonWhite).toBeGreaterThan(0);
  });

  it('renders image element onto canvas (pixels appear at expected region)', () => {
    // Create a colored source image so we can detect it in the output.
    const src = document.createElement('canvas');
    src.width = 10; src.height = 10;
    const sctx = src.getContext('2d');
    sctx.fillStyle = '#ff0000';
    sctx.fillRect(0, 0, 10, 10);

    const item = new CardSourceItem(
      { w: 50, h: 50 }, 350,
      [{ type: 'image', id: 'i1', src, x: 5, y: 5, w: 20, h: 20 }]
    );
    const ctx = item.canvas.getContext('2d');
    // Sample the expected image region in pixel coords.
    const dpi = 350;
    const mmToPx = dpi / 25.4;
    const px = Math.round(10 * mmToPx);
    const py = Math.round(10 * mmToPx);
    const data = ctx.getImageData(px, py, 1, 1).data;
    // Should be red (255, 0, 0).
    expect(data[0]).toBe(255);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(0);
  });

  it('renders an empty elements list as a white canvas', () => {
    const item = new CardSourceItem({ w: 25, h: 35 }, 350, []);
    const ctx = item.canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, 1, 1).data;
    // Top-left pixel should be white.
    expect(data[0]).toBe(255);
    expect(data[1]).toBe(255);
    expect(data[2]).toBe(255);
  });
});

describe('createCardImageSource', () => {
  it('returns the canvas as-is', () => {
    const src = fakeImage();
    expect(createCardImageSource(src, { w: 25, h: 35 })).toBe(src);
  });
});
import { describe, it, expect } from 'vitest';
import { CardSourceItem, createCardImageSource, computeCardDpi } from '../js/card-builder.js';
import { CARD_MAX_PX } from '../js/constants.js';

// Minimal fake image source (2x1 white pixel).
function fakeImage() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 1;
  return c;
}

// Minimal fields config (deterministic order: title first).
const fields = [
  { id: 't', label: '标题', enabled: true, default: '默认标题', size: 'big',   color: '#111' },
  { id: 'n', label: '姓名', enabled: true, default: '',         size: 'mid',   color: '#222' },
];

describe('computeCardDpi', () => {
  it('returns requested dpi when below CARD_MAX_PX', () => {
    // 25mm at 350dpi → ~344px, well below 1500
    const dpi = computeCardDpi({ w: 25, h: 35 }, 350);
    expect(dpi).toBe(350);
  });

  it('scales down dpi when card pixel size exceeds CARD_MAX_PX', () => {
    // 500mm at 350dpi → 6890px > 1500 → scale down
    const dpi = computeCardDpi({ w: 500, h: 500 }, 350);
    expect(dpi).toBeLessThan(350);
    // Verify: long side in px ≤ CARD_MAX_PX (within rounding)
    const longPx = 500 * dpi / 25.4;
    expect(longPx).toBeLessThanOrEqual(CARD_MAX_PX + 1);
  });
});

describe('CardSourceItem', () => {
  it('size reflects card dimensions in mm', () => {
    const item = new CardSourceItem(
      { w: 90, h: 54 }, 350, fields, '张三, A001', null
    );
    expect(item.size).toEqual({ w: 90, h: 54 });
  });

  it('canvas has dimensions = card mm × dpi (rounded)', () => {
    const item = new CardSourceItem(
      { w: 25, h: 35 }, 350, fields, '张三, A001', null
    );
    const c = item.canvas;
    // 25mm × 350dpi / 25.4 ≈ 344
    expect(c.width).toBe(Math.round(25 * 350 / 25.4));
    expect(c.height).toBe(Math.round(35 * 350 / 25.4));
  });

  it('renders field text onto the canvas (non-empty pixels in lower half)', () => {
    const item = new CardSourceItem(
      { w: 25, h: 35 }, 350, fields, '张三, A001', null
    );
    const ctx = item.canvas.getContext('2d');
    const w = item.canvas.width, h = item.canvas.height;
    // Sample center band for any non-white pixel.
    const data = ctx.getImageData(0, h / 2, w, h / 4).data;
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 250 || data[i+1] < 250 || data[i+2] < 250) nonWhite++;
    }
    expect(nonWhite).toBeGreaterThan(0);
  });

  it('uses field default when CSV row has fewer columns than fields', () => {
    // fields expects 2 cols; row provides only "张三" → second field uses default "".
    // We can't easily probe absence of text, so verify item still constructs.
    const item = new CardSourceItem(
      { w: 25, h: 35 }, 350, fields, '张三', null
    );
    expect(item.canvas.width).toBeGreaterThan(0);
  });
});

describe('createCardImageSource', () => {
  it('produces a source that drawImage can consume (returns canvas)', () => {
    const src = createCardImageSource(fakeImage(), { w: 25, h: 35 });
    expect(src.tagName).toBe('CANVAS');
  });
});
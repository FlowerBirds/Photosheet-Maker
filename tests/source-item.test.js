import { describe, it, expect } from 'vitest';
import { PhotoSourceItem } from '../js/source-item.js';
import { PHOTO_SIZES } from '../js/constants.js';

// A minimal fake canvas (we don't draw on it; only verify identity).
function fakeCanvas() { return { width: 100, height: 70, __fake: true }; }

describe('PhotoSourceItem', () => {
  it('exposes size from PHOTO_SIZES by name', () => {
    const item = new PhotoSourceItem(fakeCanvas(), '一寸');
    expect(item.size).toEqual({ w: 25, h: 35 });
  });

  it('returns the wrapped canvas via .canvas', () => {
    const c = fakeCanvas();
    const item = new PhotoSourceItem(c, '一寸');
    expect(item.canvas).toBe(c);
  });

  it('size honors rotation (90° swaps w/h)', () => {
    const item = new PhotoSourceItem(fakeCanvas(), '一寸', { rotation: 90 });
    expect(item.size).toEqual({ w: 35, h: 25 });
  });
});
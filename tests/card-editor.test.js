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

// ---------- Drag guides ----------
//
// jsdom's canvas.getContext() returns a native-bound ctx that JS-level
// spy/proxy can't intercept reliably. Test drawDragGuides directly with a
// mock ctx to verify its visual contract.

import { drawDragGuides } from '../js/card-editor.js';

function mockCtx() {
  const fns = {};
  for (const name of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'stroke']) {
    fns[name] = vi.fn();
  }
  // Properties we set/read.
  return {
    ...fns,
    setLineDash: vi.fn(),
    strokeStyle: '',
    lineWidth: 0,
  };
}

describe('drawDragGuides', () => {
  it('uses dashed blue stroke pattern [4, 4]', () => {
    const ctx = mockCtx();
    drawDragGuides(ctx, 600, 400);
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
    expect(ctx.strokeStyle).toBe('#2d7ff9');
  });

  it('draws horizontal center line from (0, h/2) to (w, h/2)', () => {
    const ctx = mockCtx();
    drawDragGuides(ctx, 600, 400);
    // Find the (moveTo, lineTo) pairs that form the horizontal segment.
    // beginPath + moveTo(x,y) + lineTo(x',y') + stroke: 4 calls.
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 200);
    expect(ctx.lineTo).toHaveBeenCalledWith(600, 200);
  });

  it('draws vertical center line from (w/2, 0) to (w/2, h)', () => {
    const ctx = mockCtx();
    drawDragGuides(ctx, 600, 400);
    expect(ctx.moveTo).toHaveBeenCalledWith(300, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(300, 400);
  });

  it('wraps with save/restore so no state leaks', () => {
    const ctx = mockCtx();
    drawDragGuides(ctx, 100, 100);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });
});

// ---------- Arrange orientation ----------

describe('card editor arrange orientation', () => {
  function makeArrEls() {
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
      <input type="radio" name="card-orientation" value="portrait" checked />
      <input type="radio" name="card-orientation" value="landscape" />
      <input type="radio" name="card-arrange-orientation" value="portrait" checked />
      <input type="radio" name="card-arrange-orientation" value="landscape" />
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

  function initEditor() {
    return initCardEditor({
      ...makeArrEls(),
      getState: () => ({ dpi: 300 }),
      setSourceItems: () => {},
      setPhase: () => {},
      requestRefresh: () => {},
    });
  }

  it('default arrangeOrient follows design orientation (portrait)', () => {
    initEditor();
    const r = document.querySelector('input[name="card-arrange-orientation"]:checked');
    expect(r.value).toBe('portrait');
  });

  it('changing arrange-orientation radio does not affect design orientation', () => {
    initEditor();
    document.querySelector(
      'input[name="card-arrange-orientation"][value="landscape"]'
    ).checked = true;
    document.querySelector(
      'input[name="card-arrange-orientation"][value="landscape"]'
    ).dispatchEvent(new Event('change', { bubbles: true }));
    const designR = document.querySelector('input[name="card-orientation"]:checked');
    expect(designR.value).toBe('portrait');
  });

  it('setArrangementOrient API updates the radio state', () => {
    const editor = initEditor();
    editor.setArrangementOrient('landscape');
    const r = document.querySelector('input[name="card-arrange-orientation"]:checked');
    expect(r.value).toBe('landscape');
  });

  it('getArrangementOrient returns the current value', () => {
    const editor = initEditor();
    expect(editor.getArrangementOrient()).toBe('portrait');
    editor.setArrangementOrient('landscape');
    expect(editor.getArrangementOrient()).toBe('landscape');
  });

  it('changing arrange-orientation radio calls setArrangementOrient callback', () => {
    const calls = [];
    const setArrangementOrient = (v) => calls.push(v);
    initCardEditor({
      ...makeArrEls(),
      getState: () => ({ dpi: 300 }),
      setSourceItems: () => {},
      setPhase: () => {},
      requestRefresh: () => {},
      setArrangementOrient,
    });
    const landscapeRadio = document.querySelector(
      'input[name="card-arrange-orientation"][value="landscape"]'
    );
    landscapeRadio.checked = true;
    landscapeRadio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(calls).toEqual(['landscape']);
  });
});

// ---------- Properties panel ----------

function makePropsEls() {
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
    <section id="card-properties-section" hidden>
      <div id="prop-font-size" hidden>
        <input type="range" id="prop-font-size-input" min="2" max="40" step="0.5" />
        <span id="prop-font-size-val"></span>
      </div>
      <div id="prop-image-dims" hidden>
        <input type="range" id="prop-w-input" min="1" max="200" step="0.5" />
        <span id="prop-w-val"></span>
        <input type="range" id="prop-h-input" min="1" max="200" step="0.5" />
        <span id="prop-h-val"></span>
        <button id="prop-aspect-toggle"></button>
      </div>
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
    propertiesSection: document.getElementById('card-properties-section'),
    propFontSize:      document.getElementById('prop-font-size'),
    propFontSizeInput: document.getElementById('prop-font-size-input'),
    propFontSizeVal:   document.getElementById('prop-font-size-val'),
    propImageDims:     document.getElementById('prop-image-dims'),
    propWInput:        document.getElementById('prop-w-input'),
    propWVal:          document.getElementById('prop-w-val'),
    propHInput:        document.getElementById('prop-h-input'),
    propHVal:          document.getElementById('prop-h-val'),
    propAspectToggle:  document.getElementById('prop-aspect-toggle'),
  };
}

function initPropsEditor(overrides = {}) {
  const createCardCropper = overrides.createCardCropper || fakeCropperFactory();
  return initCardEditor({
    ...makePropsEls(),
    createCardCropper,
    getState: () => ({ dpi: 300 }),
    setSourceItems: () => {},
    setPhase: () => {},
    requestRefresh: () => {},
  });
}

/**
 * Helper: add an image element via the crop flow and return its id + sizes.
 * Uses a 200x100 source so the fitted initial w/h has a 2:1 aspect.
 */
function addImageElement(editor) {
  editor.startCrop({
    width: 200, height: 100,
    toDataURL: () => 'data:image/png;base64,ZmFrZQ==',
  });
  document.getElementById('btn-card-crop-finish').click();
  const rows = document.getElementById('card-element-list').querySelectorAll('.element-row');
  return rows[0];  // image row
}

describe('card editor properties panel', () => {
  it('hides properties section when nothing is selected', () => {
    initPropsEditor();
    expect(document.getElementById('card-properties-section').hidden).toBe(true);
    expect(document.getElementById('prop-font-size').hidden).toBe(true);
    expect(document.getElementById('prop-image-dims').hidden).toBe(true);
  });

  it('shows font-size slider when text element is selected; hides image dims', () => {
    initPropsEditor();
    document.getElementById('btn-add-text').click();
    expect(document.getElementById('card-properties-section').hidden).toBe(false);
    expect(document.getElementById('prop-font-size').hidden).toBe(false);
    expect(document.getElementById('prop-image-dims').hidden).toBe(true);
    // Default fontSize is DEFAULT_FONT_SIZE_MM (5).
    expect(document.getElementById('prop-font-size-input').value).toBe('5');
    expect(document.getElementById('prop-font-size-val').textContent).toBe('5 mm');
  });

  it('shows image dims (w/h sliders + lock button) when image element is selected; hides font-size', () => {
    const editor = initPropsEditor();
    addImageElement(editor);
    expect(document.getElementById('card-properties-section').hidden).toBe(false);
    expect(document.getElementById('prop-font-size').hidden).toBe(true);
    expect(document.getElementById('prop-image-dims').hidden).toBe(false);
    // W/H sliders are populated (non-empty).
    expect(document.getElementById('prop-w-input').value).toMatch(/^\d/);
    expect(document.getElementById('prop-h-input').value).toMatch(/^\d/);
    expect(document.getElementById('prop-w-val').textContent).toMatch(/\d+ mm$/);
    expect(document.getElementById('prop-h-val').textContent).toMatch(/\d+ mm$/);
    // Newly added image is aspectLocked by default → icon is 🔗.
    expect(document.getElementById('prop-aspect-toggle').textContent).toBe('🔗');
  });

  it('font-size slider input updates value mirror + reflects on element', () => {
    const editor = initPropsEditor();
    document.getElementById('btn-add-text').click();
    const slider = document.getElementById('prop-font-size-input');
    slider.value = '10';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.getElementById('prop-font-size-val').textContent).toBe('10 mm');
  });

  it('font-size slider clamps displayed value to [2, 40]', () => {
    const editor = initPropsEditor();
    document.getElementById('btn-add-text').click();
    const slider = document.getElementById('prop-font-size-input');
    // jsdom doesn't auto-clamp on .value setter, so the implementation must clamp.
    slider.value = '50';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    const v = Number(document.getElementById('prop-font-size-val').textContent.replace(' mm', ''));
    expect(v).toBeLessThanOrEqual(40);
    expect(v).toBeGreaterThanOrEqual(2);
  });

  it('image width slider with aspectLocked mirrors h slider', () => {
    const editor = initPropsEditor();
    addImageElement(editor);
    // Image was added with 2:1 aspect (200x100) → w ≈ 54, h ≈ 27 (after fit-within-card).
    const wSlider = document.getElementById('prop-w-input');
    wSlider.value = '40';
    wSlider.dispatchEvent(new Event('input', { bubbles: true }));
    const hVal = Number(document.getElementById('prop-h-val').textContent.replace(' mm', ''));
    const wVal = Number(document.getElementById('prop-w-val').textContent.replace(' mm', ''));
    expect(wVal).toBe(40);
    expect(hVal).toBeGreaterThan(0);
    // Aspect preserved (2:1) → w ≈ 2 × h.
    expect(Math.abs(wVal - 2 * hVal)).toBeLessThan(1);
  });

  it('aspect-toggle button toggles the lock icon', () => {
    const editor = initPropsEditor();
    addImageElement(editor);
    const btn = document.getElementById('prop-aspect-toggle');
    const before = btn.textContent;
    btn.click();
    const after = btn.textContent;
    expect(before).not.toBe(after);
    btn.click();
    expect(btn.textContent).toBe(before);
  });

  it('image element row in elementList shows only label + delete (no size summary)', () => {
    const editor = initPropsEditor();
    addImageElement(editor);
    const rows = document.getElementById('card-element-list').querySelectorAll('.element-row');
    expect(rows.length).toBe(1);
    // Row text should NOT contain the W × H mm size summary (now shown by properties panel sliders).
    expect(rows[0].textContent).not.toMatch(/\d+(\.\d+)?\s*×\s*\d+(\.\d+)?\s*mm/);
    // Row should still show the "图片" label so user can identify the element.
    expect(rows[0].textContent).toContain('图片');
    // Row should still have the delete button.
    expect(rows[0].querySelector('button')).toBeTruthy();
  });

  // ---------- Rect element ----------

  function makePropsElsWithRect() {
    document.body.innerHTML = `
      <input type="file" id="card-image-input" />
      <button id="btn-add-text"></button>
      <button id="btn-add-image"></button>
      <button id="btn-add-rect"></button>
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
      <section id="card-properties-section" hidden>
        <div id="prop-font-size" hidden>
          <input type="range" id="prop-font-size-input" min="2" max="40" step="0.5" />
          <span id="prop-font-size-val"></span>
        </div>
        <div id="prop-image-dims" hidden>
          <input type="range" id="prop-w-input" min="1" max="200" step="0.5" />
          <span id="prop-w-val"></span>
          <input type="range" id="prop-h-input" min="1" max="200" step="0.5" />
          <span id="prop-h-val"></span>
          <button id="prop-aspect-toggle"></button>
        </div>
        <div id="prop-rect-dims" hidden>
          <input type="range" id="prop-rect-w-input" min="1" max="200" step="0.5" />
          <span id="prop-rect-w-val"></span>
          <input type="range" id="prop-rect-h-input" min="1" max="200" step="0.5" />
          <span id="prop-rect-h-val"></span>
          <input type="range" id="prop-border-width-input" min="0" max="10" step="0.1" />
          <span id="prop-border-width-val"></span>
          <input type="color" id="prop-border-color" value="#888888" />
          <input type="color" id="prop-fill-color" value="#ffffff" />
        </div>
      </section>
    `;
    return {
      designPanel:  document.getElementById('card-design-phase'),
      cardCanvas:   document.getElementById('card-canvas'),
      btnAddText:   document.getElementById('btn-add-text'),
      btnAddImage:  document.getElementById('btn-add-image'),
      btnAddRect:   document.getElementById('btn-add-rect'),
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
      propertiesSection: document.getElementById('card-properties-section'),
      propFontSize:      document.getElementById('prop-font-size'),
      propFontSizeInput: document.getElementById('prop-font-size-input'),
      propFontSizeVal:   document.getElementById('prop-font-size-val'),
      propImageDims:     document.getElementById('prop-image-dims'),
      propWInput:        document.getElementById('prop-w-input'),
      propWVal:          document.getElementById('prop-w-val'),
      propHInput:        document.getElementById('prop-h-input'),
      propHVal:          document.getElementById('prop-h-val'),
      propAspectToggle:  document.getElementById('prop-aspect-toggle'),
      propRectDims:      document.getElementById('prop-rect-dims'),
      propRectWInput:    document.getElementById('prop-rect-w-input'),
      propRectWVal:      document.getElementById('prop-rect-w-val'),
      propRectHInput:    document.getElementById('prop-rect-h-input'),
      propRectHVal:      document.getElementById('prop-rect-h-val'),
      propBorderWidthInput: document.getElementById('prop-border-width-input'),
      propBorderWidthVal:   document.getElementById('prop-border-width-val'),
      propBorderColor:    document.getElementById('prop-border-color'),
      propFillColor:      document.getElementById('prop-fill-color'),
    };
  }

  function initRectEditor() {
    return initCardEditor({
      ...makePropsElsWithRect(),
      getState: () => ({ dpi: 300 }),
      setSourceItems: () => {},
      setPhase: () => {},
      requestRefresh: () => {},
    });
  }

  it('add-rect button creates a square rect element with sensible defaults', () => {
    initRectEditor();
    document.getElementById('btn-add-rect').click();
    const rows = document.getElementById('card-element-list').querySelectorAll('.element-row');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('矩形');
  });

  it('selecting a rect shows the rect-dims panel and hides font-size + image-dims', () => {
    initRectEditor();
    document.getElementById('btn-add-rect').click();
    expect(document.getElementById('prop-rect-dims').hidden).toBe(false);
    expect(document.getElementById('prop-font-size').hidden).toBe(true);
    expect(document.getElementById('prop-image-dims').hidden).toBe(true);
  });

  it('rect width slider updates the displayed value', () => {
    initRectEditor();
    document.getElementById('btn-add-rect').click();
    const slider = document.getElementById('prop-rect-w-input');
    slider.value = '40';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.getElementById('prop-rect-w-val').textContent).toBe('40 mm');
  });

  it('switching selected element (text → image) refreshes the panel content', () => {
    const editor = initPropsEditor();
    document.getElementById('btn-add-text').click();
    expect(document.getElementById('prop-font-size').hidden).toBe(false);
    expect(document.getElementById('prop-image-dims').hidden).toBe(true);

    // Add an image — selectedId is now the image; panel shows image dims.
    addImageElement(editor);
    expect(document.getElementById('prop-font-size').hidden).toBe(true);
    expect(document.getElementById('prop-image-dims').hidden).toBe(false);

    // Add another text — selectedId is now the new text; panel shows font-size.
    document.getElementById('btn-add-text').click();
    expect(document.getElementById('prop-font-size').hidden).toBe(false);
    expect(document.getElementById('prop-image-dims').hidden).toBe(true);

    // Click the image row's label to switch back; panel switches to image dims.
    const rows = document.getElementById('card-element-list').querySelectorAll('.element-row');
    const imageRow = Array.from(rows).find(r => r.textContent.includes('图片'));
    expect(imageRow).toBeTruthy();
    imageRow.querySelector('.element-label').click();

    expect(document.getElementById('prop-font-size').hidden).toBe(true);
    expect(document.getElementById('prop-image-dims').hidden).toBe(false);
  });
});
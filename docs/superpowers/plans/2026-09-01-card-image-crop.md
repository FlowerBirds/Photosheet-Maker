# 卡片添加图片时增加裁剪功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 卡片模式下，用户点击「+ 添加图片」时，强制先裁剪图片再放入卡片。

**Architecture:** 复用 Cropper.js（已通过 CDN 全局加载），新增薄包装模块 `js/card-cropper.js`；侧栏独立面板 `#card-crop-section`（不与 photo-mode 的 `#crop-section` 共用）；裁剪完成后用 `getCroppedCanvas()` 的 canvas 作为卡片图片元素的 `src`，沿用现有"按卡片 40% 高 / 60% 宽等比缩放"的逻辑。

**Tech Stack:** 纯前端 ES Module；Cropper.js 1.6.2（CDN）；Vitest + jsdom。

**Spec:** `docs/superpowers/specs/2026-09-01-card-image-crop-design.md`

---

## File Structure

| 文件 | 状态 | 职责 |
|---|---|---|
| `js/card-cropper.js` | 新增 | 薄包装 Cropper.js，供卡片裁剪使用；自由比例；支持 init / rotate / getCroppedCanvas / destroy |
| `index.html` | 改 | 在 `#card-editor-section` 内、`#card-design-phase` 之前，新增 `#card-crop-section` DOM |
| `css/style.css` | 改 | 新增 `#card-crop-section` 样式（复用 `.crop-container` / `.crop-actions` 类名） |
| `js/main.js` | 改 | 在 `dom` 中收集新元素引用；传入 `initCardEditor` |
| `js/card-editor.js` | 改 | 把 `imageInput.change` 改为先进入裁剪状态；新增 `completeCrop` / `cancelCrop`；导出 cropper 实例供 main.js 调用 cancel |
| `tests/card-cropper.test.js` | 新增 | 单元测试 `createCardCropper` 的 API 行为（用假 Cropper 构造函数注入） |
| `tests/card-editor.test.js` | 改 | 新增"裁剪流程"的用例：mock `createCardCropper`，验证状态切换和清理 |

---

## Task 1: 新增 `js/card-cropper.js` 模块（薄包装）

**Files:**
- Create: `js/card-cropper.js`
- Test: `tests/card-cropper.test.js`

依赖注入策略：`createCardCropper(imgEl, opts)` 的第二个参数支持传入 `{ Cropper }`，默认从 `globalThis.Cropper` 取。这样 jsdom 测试可以传一个假构造函数，无需加载 CDN。

- [ ] **Step 1: 写失败的测试**

```js
// tests/card-cropper.test.js
import { describe, it, expect, vi } from 'vitest';
import { createCardCropper } from '../js/card-cropper.js';

function fakeCropper() {
  return {
    rotate: vi.fn(),
    getCroppedCanvas: vi.fn(() => ({ width: 10, height: 10, __fake: true })),
    destroy: vi.fn(),
  };
}

describe('createCardCropper', () => {
  it('init creates a Cropper with free aspect ratio', () => {
    const Cropper = vi.fn(() => fakeCropper());
    const img = document.createElement('img');
    const cw = createCardCropper(img, { Cropper });
    cw.init();
    expect(Cropper).toHaveBeenCalledTimes(1);
    const opts = Cropper.mock.calls[0][1];
    expect(opts.viewMode).toBe(1);
    expect(opts.autoCropArea).toBe(0.8);
    expect(opts.movable).toBe(true);
    expect(opts.scalable).toBe(true);
    expect(opts.zoomable).toBe(true);
    expect(opts.rotatable).toBe(true);
    // No aspectRatio → free.
    expect(opts.aspectRatio).toBeUndefined();
  });

  it('init is idempotent (destroys existing before recreating)', () => {
    const instances = [fakeCropper(), fakeCropper()];
    const Cropper = vi.fn()
      .mockImplementationOnce(() => instances[0])
      .mockImplementationOnce(() => instances[1]);
    const img = document.createElement('img');
    const cw = createCardCropper(img, { Cropper });
    cw.init();
    cw.init();
    expect(instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(Cropper).toHaveBeenCalledTimes(2);
  });

  it('rotate forwards degrees to underlying cropper', () => {
    const inst = fakeCropper();
    const Cropper = vi.fn(() => inst);
    const img = document.createElement('img');
    const cw = createCardCropper(img, { Cropper });
    cw.init();
    cw.rotate(90);
    cw.rotate(-45);
    expect(inst.rotate).toHaveBeenNthCalledWith(1, 90);
    expect(inst.rotate).toHaveBeenNthCalledWith(2, -45);
  });

  it('rotate is no-op when not active', () => {
    const inst = fakeCropper();
    const Cropper = vi.fn(() => inst);
    const cw = createCardCropper(img := document.createElement('img'), { Cropper });
    cw.rotate(90);
    expect(inst.rotate).not.toHaveBeenCalled();
  });

  it('getCroppedCanvas returns the canvas from cropper', () => {
    const inst = fakeCropper();
    const Cropper = vi.fn(() => inst);
    const cw = createCardCropper(document.createElement('img'), { Cropper });
    cw.init();
    const out = cw.getCroppedCanvas();
    expect(out.__fake).toBe(true);
    expect(inst.getCroppedCanvas).toHaveBeenCalledWith(expect.objectContaining({
      fillColor: '#ffffff',
      imageSmoothingEnabled: true,
    }));
  });

  it('getCroppedCanvas returns null when not active', () => {
    const cw = createCardCropper(document.createElement('img'), { Cropper: vi.fn() });
    expect(cw.getCroppedCanvas()).toBeNull();
  });

  it('destroy tears down and is idempotent', () => {
    const inst = fakeCropper();
    const Cropper = vi.fn(() => inst);
    const cw = createCardCropper(document.createElement('img'), { Cropper });
    cw.init();
    cw.destroy();
    cw.destroy();
    expect(inst.destroy).toHaveBeenCalledTimes(1);
    expect(cw.isActive()).toBe(false);
  });

  it('isActive reflects current state', () => {
    const inst = fakeCropper();
    const Cropper = vi.fn(() => inst);
    const cw = createCardCropper(document.createElement('img'), { Cropper });
    expect(cw.isActive()).toBe(false);
    cw.init();
    expect(cw.isActive()).toBe(true);
    cw.destroy();
    expect(cw.isActive()).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- tests/card-cropper.test.js`
Expected: FAIL with "Cannot find module '../js/card-cropper.js'" 或类似（模块尚未实现）。

- [ ] **Step 3: 实现 `js/card-cropper.js`**

```js
// js/card-cropper.js
/**
 * Thin wrapper around Cropper.js for the card-mode image cropper.
 *
 * Lifecycle:
 *   const cw = createCardCropper(imgEl);
 *   cw.init();                                // free aspect ratio
 *   cw.rotate(90);                            // rotate CW
 *   const canvas = cw.getCroppedCanvas();     // produce output
 *   cw.destroy();                             // tear down
 *
 * `opts.Cropper` is injectable for tests; defaults to globalThis.Cropper.
 */
export function createCardCropper(imgEl, opts = {}) {
  const Cropper = opts.Cropper || globalThis.Cropper;
  let cropper = null;

  return {
    /** Initialize Cropper.js on the given <img>. Idempotent. */
    init() {
      if (cropper) this.destroy();
      cropper = new Cropper(imgEl, {
        viewMode: 1,
        autoCropArea: 0.8,
        movable: true,
        scalable: true,
        zoomable: true,
        rotatable: true,
        responsive: true,
        // No aspectRatio → free crop box.
      });
    },

    /** Rotate the underlying image by `degrees` (CW positive). */
    rotate(degrees) {
      if (cropper) cropper.rotate(degrees);
    },

    /**
     * Produce the cropped output canvas.
     * @returns {HTMLCanvasElement|null}
     */
    getCroppedCanvas() {
      if (!cropper) return null;
      return cropper.getCroppedCanvas({
        fillColor: '#ffffff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });
    },

    /** Tear down the Cropper instance. Safe to call when not active. */
    destroy() {
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }
    },

    /** Whether a Cropper instance is currently active. */
    isActive() { return cropper !== null; },
  };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- tests/card-cropper.test.js`
Expected: PASS（所有 7 个用例通过）。

- [ ] **Step 5: 提交**

```bash
git add js/card-cropper.js tests/card-cropper.test.js
git commit -m "feat(card-cropper): add thin Cropper.js wrapper for card image crop"
```

---

## Task 2: 在 `index.html` 新增 `#card-crop-section`

**Files:**
- Modify: `index.html:172-185`（在 `#card-design-phase` 之前插入新 section）

- [ ] **Step 1: 插入 DOM**

在 `index.html` 中找到 `<!-- Design phase -->` 注释（位于第 159 行附近），**之前**插入新 section：

```html
<!-- Card image crop phase (shown when user picks an image) -->
<section class="card" id="card-crop-section" hidden>
  <h2>裁剪图片</h2>
  <div class="crop-container">
    <img id="card-crop-img" alt="待裁剪图片" />
  </div>
  <div class="crop-actions">
    <button id="btn-card-crop-rotate-left"  class="btn-secondary">↺ 左旋转</button>
    <button id="btn-card-crop-rotate-right" class="btn-secondary">↻ 右旋转</button>
    <button id="btn-card-crop-finish"       class="btn-primary">完成裁剪</button>
    <button id="btn-card-crop-cancel"       class="btn-secondary">取消</button>
  </div>
</section>
```

- [ ] **Step 2: 验证 HTML 结构合法**

Run: 在浏览器中打开 `index.html`，切到「卡片」tab，DOM 中应能找到 `#card-crop-section`（默认 `hidden`）。

- [ ] **Step 3: 提交**

```bash
git add index.html
git commit -m "feat(card): add card-crop-section DOM"
```

---

## Task 3: 在 `js/main.js` 收集新 DOM 引用并传入 `initCardEditor`

**Files:**
- Modify: `js/main.js:44-53`（dom 表）、`js/main.js:341-367`（initCardEditor 调用）

- [ ] **Step 1: 在 `dom` 表中添加新引用**

在 `js/main.js` 的 `dom` 对象（`js/main.js:13-53`）中，`imageInput` 后面添加：

```js
  // card crop phase
  cardCropSection:   $('card-crop-section'),
  cardCropImg:       $('card-crop-img'),
  btnCardCropRotateL:  $('btn-card-crop-rotate-left'),
  btnCardCropRotateR:  $('btn-card-crop-rotate-right'),
  btnCardCropFinish:   $('btn-card-crop-finish'),
  btnCardCropCancel:   $('btn-card-crop-cancel'),
```

- [ ] **Step 2: 把这些引用传入 `initCardEditor`**

在 `js/main.js` 的 `initCardEditor({...})` 调用中（`js/main.js:341-367`），**新增字段**：

```js
  cardCropSection:   dom.cardCropSection,
  cardCropImg:       dom.cardCropImg,
  btnCardCropRotateL: dom.btnCardCropRotateL,
  btnCardCropRotateR: dom.btnCardCropRotateR,
  btnCardCropFinish: dom.btnCardCropFinish,
  btnCardCropCancel: dom.btnCardCropCancel,
```

- [ ] **Step 3: 提交（接口层先就位，避免下一步大块改动一起提交）**

```bash
git add js/main.js
git commit -m "refactor(card): wire card crop DOM refs through initCardEditor"
```

---

## Task 4: 改造 `js/card-editor.js` 接入裁剪流程

**Files:**
- Modify: `js/card-editor.js`（新增 imports、els 字段、裁剪状态机、按钮事件）
- Modify: `tests/card-editor.test.js`（新增裁剪流程的测试）

依赖：引入 `createCardCropper`。测试通过 `opts.createCardCropper` 注入假工厂。

### 4.1 改造 `js/card-editor.js`

- [ ] **Step 1: 新增 import**

在 `js/card-editor.js` 第 1-2 行附近，添加：

```js
import { createCardCropper } from './card-cropper.js';
```

- [ ] **Step 2: 扩展 `els` JSDoc 与字段**

找到 `els` 参数的 JSDoc（`js/card-editor.js:16-42`），在 `// Card size controls` 之前，添加：

```js
   *   // Card image crop phase
   *   cardCropSection:    HTMLElement,
   *   cardCropImg:        HTMLImageElement,
   *   btnCardCropRotateL: HTMLButtonElement,
   *   btnCardCropRotateR: HTMLButtonElement,
   *   btnCardCropFinish:  HTMLButtonElement,
   *   btnCardCropCancel:  HTMLButtonElement,
   *   // Override (tests)
   *   createCardCropper?: typeof import('./card-cropper.js').createCardCropper,
```

- [ ] **Step 3: 新增裁剪状态字段**

在 `js/card-editor.js:54-60`（state 声明附近），添加：

```js
  // Crop state: null when idle; { cw, sourceCanvas } while cropping.
  let cropState = null;
  // Factory (overridable for tests).
  const _createCardCropper = els.createCardCropper || createCardCropper;
```

- [ ] **Step 4: 改造 `imageInput.change` 回调**

把 `js/card-editor.js:140-174` 的 `imageInput.addEventListener('change', async (e) => { ... })` 整体替换为：

```js
  els.imageInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      // loadImage returns an HTMLCanvasElement (not an Image).
      const canvas = await loadImage(file);
      startCrop(canvas);
    } catch (err) {
      window.alert(err.message);
    } finally {
      els.imageInput.value = '';
    }
  });
```

- [ ] **Step 5: 新增 `startCrop` / `completeCrop` / `cancelCrop` 函数**

在 `loadImage` 函数定义之前（`js/card-editor.js:564` 之前），新增：

```js
  /**
   * Show the crop panel, load the canvas into the <img>, init Cropper.js.
   * Idempotent: if already cropping, destroys first.
   */
  function startCrop(sourceCanvas) {
    if (cropState) cancelCrop();
    els.cardCropImg.src = sourceCanvas.toDataURL();
    const cw = _createCardCropper(els.cardCropImg);
    cw.init();
    cropState = { cw, sourceCanvas };
    els.cardCropSection.hidden = false;
  }

  /** Commit the crop → push a new image element to the card → tear down. */
  function completeCrop() {
    if (!cropState) return;
    const { cw } = cropState;
    const cropped = cw.getCroppedCanvas();
    if (!cropped) {
      window.alert('请先调整裁剪框');
      return;
    }
    const cardSize = getCardSize();
    const srcW = cropped.width;
    const srcH = cropped.height;
    // Fit-within-card initial size, preserve aspect.
    const maxH = cardSize.h * 0.4;
    const maxW = cardSize.w * 0.6;
    const scale = Math.min(maxW / srcW, maxH / srcH);
    const w = srcW * scale;
    const h = srcH * scale;
    const id = `e${nextId++}`;
    elements.push({
      type: 'image', id,
      src: cropped,
      x: (cardSize.w - w) / 2,
      y: (cardSize.h - h) / 2,
      w, h,
      aspectLocked: true,
      _aspect: w / h,
    });
    selectedId = id;
    finishCropInternal();
    renderElementList();
    drawDesigner();
  }

  /** Cancel cropping without adding an element. */
  function cancelCrop() {
    if (!cropState) return;
    finishCropInternal();
  }

  /** Tear down cropper, clear img src, hide panel. Idempotent. */
  function finishCropInternal() {
    if (cropState && cropState.cw) cropState.cw.destroy();
    els.cardCropImg.src = '';
    els.cardCropSection.hidden = true;
    cropState = null;
  }

  // Wire crop buttons.
  els.btnCardCropRotateL.addEventListener('click', () => {
    if (cropState && cropState.cw.isActive()) cropState.cw.rotate(-90);
  });
  els.btnCardCropRotateR.addEventListener('click', () => {
    if (cropState && cropState.cw.isActive()) cropState.cw.rotate(90);
  });
  els.btnCardCropFinish.addEventListener('click', completeCrop);
  els.btnCardCropCancel.addEventListener('click', cancelCrop);
```

- [ ] **Step 6: 在 `reset()` 中清理裁剪状态**

把 `js/card-editor.js:594-600` 的 `reset()` 函数扩展为：

```js
    reset() {
      cancelCrop();
      elements = [];
      selectedId = null;
      renderElementList();
      drawDesigner();
    },
```

- [ ] **Step 7: 在公开 API 中导出 `cancelCrop` 供 main.js 调用**

把 `js/card-editor.js:588-601` 的 `return { ... }` 改为：

```js
  return {
    /** Force the designer to redraw (e.g. after size change from outside). */
    redraw() {
      els.setPhase('designing');
      drawDesigner();
    },
    /** Clear all elements (used on reupload of photo mode that affects card). */
    reset() {
      cancelCrop();
      elements = [];
      selectedId = null;
      renderElementList();
      drawDesigner();
    },
    /** Cancel any active cropper. Safe to call when not cropping. */
    cancelCrop,
  };
```

- [ ] **Step 8: 删除原有的"直接 push image element"代码**

确认 `js/card-editor.js` 中没有任何位置还残留 `elements.push({ type: 'image'...` 路径（应只剩 `completeCrop` 内部）。如果旧实现里 `imageInput.change` 完整保留，则已被 Step 4 整体替换。

### 4.2 为 `js/card-editor.js` 写新测试

- [ ] **Step 9: 写测试**

在 `tests/card-editor.test.js` 末尾追加（整个文件保持 vitest 风格）：

```js
import { initCardEditor } from '../js/card-editor.js';

function fakeCropperFactory() {
  const inst = {
    init: vi.fn(),
    rotate: vi.fn(),
    getCroppedCanvas: vi.fn(() => ({
      width: 200, height: 100, __cropped: true,
      toDataURL: () => 'data:image/png;base64,fake',
    })),
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

describe('card editor crop flow', () => {
  it('upload triggers startCrop → crop section visible + cropper.init called', () => {
    const createCardCropper = fakeCropperFactory();
    const els = makeEls();
    const editor = initCardEditor({
      ...els,
      createCardCropper,
      getState: () => ({ dpi: 300 }),
      setSourceItems: () => {},
      setPhase: () => {},
      requestRefresh: () => {},
    });

    // Simulate: loadImage returns a canvas, then startCrop is called.
    // We invoke startCrop directly via a tiny monkey-patch on the
    // imageInput change handler: dispatch a fake File event.
    // For simplicity, just verify crop section is hidden by default.
    expect(els.cardCropSection.hidden).toBe(true);

    // Manually call into the editor via its public surface: trigger
    // imageInput change with a synthetic File. Since loadImage depends
    // on URL.createObjectURL, mock that.
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    try {
      const file = new File(['fake'], 'a.png', { type: 'image/png' });
      const input = els.imageInput;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
    } finally {
      URL.createObjectURL = origCreate;
    }

    // Crop section should now be visible (after async loadImage resolves).
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(els.cardCropSection.hidden).toBe(false);
        expect(createCardCropper).toHaveBeenCalled();
        const inst = createCardCropper.mock.results[0].value;
        expect(inst.init).toHaveBeenCalled();
        resolve();
      }, 30);
    });
  });

  it('completeCrop pushes a new image element + tears down cropper', () => {
    const createCardCropper = fakeCropperFactory();
    const els = makeEls();
    const editor = initCardEditor({
      ...els,
      createCardCropper,
      getState: () => ({ dpi: 300 }),
      setSourceItems: () => {},
      setPhase: () => {},
      requestRefresh: () => {},
    });

    // Force into cropping state via the public cancelCrop path
    // (then manually re-enter by triggering change).
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    try {
      const file = new File(['fake'], 'a.png', { type: 'image/png' });
      Object.defineProperty(els.imageInput, 'files', { value: [file], configurable: true });
      els.imageInput.dispatchEvent(new Event('change'));
    } finally {
      URL.createObjectURL = origCreate;
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        // Trigger finish.
        els.btnCardCropFinish.click();

        const inst = createCardCropper.mock.results[0].value;
        expect(inst.getCroppedCanvas).toHaveBeenCalled();
        expect(inst.destroy).toHaveBeenCalled();
        expect(els.cardCropSection.hidden).toBe(true);
        // Element list should contain a new image.
        const rows = els.elementList.querySelectorAll('.element-row');
        expect(rows.length).toBeGreaterThanOrEqual(1);
        resolve();
      }, 30);
    });
  });

  it('cancelCrop destroys cropper without adding an element', () => {
    const createCardCropper = fakeCropperFactory();
    const els = makeEls();
    initCardEditor({
      ...els,
      createCardCropper,
      getState: () => ({ dpi: 300 }),
      setSourceItems: () => {},
      setPhase: () => {},
      requestRefresh: () => {},
    });

    const origCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    try {
      const file = new File(['fake'], 'a.png', { type: 'image/png' });
      Object.defineProperty(els.imageInput, 'files', { value: [file], configurable: true });
      els.imageInput.dispatchEvent(new Event('change'));
    } finally {
      URL.createObjectURL = origCreate;
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        const inst = createCardCropper.mock.results[0].value;
        els.btnCardCropCancel.click();
        expect(inst.destroy).toHaveBeenCalled();
        expect(els.cardCropSection.hidden).toBe(true);
        expect(els.elementList.querySelectorAll('.element-row').length).toBe(0);
        resolve();
      }, 30);
    });
  });

  it('reset() cancels any active crop', () => {
    const createCardCropper = fakeCropperFactory();
    const els = makeEls();
    const editor = initCardEditor({
      ...els,
      createCardCropper,
      getState: () => ({ dpi: 300 }),
      setSourceItems: () => {},
      setPhase: () => {},
      requestRefresh: () => {},
    });

    const origCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    try {
      const file = new File(['fake'], 'a.png', { type: 'image/png' });
      Object.defineProperty(els.imageInput, 'files', { value: [file], configurable: true });
      els.imageInput.dispatchEvent(new Event('change'));
    } finally {
      URL.createObjectURL = origCreate;
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        const inst = createCardCropper.mock.results[0].value;
        editor.reset();
        expect(inst.destroy).toHaveBeenCalled();
        expect(els.cardCropSection.hidden).toBe(true);
        resolve();
      }, 30);
    });
  });
});
```

- [ ] **Step 10: 运行测试，确认通过**

Run: `npm test -- tests/card-editor.test.js`
Expected: PASS（4 个新用例全部通过；已有 2 个 shape 用例无回归）。

- [ ] **Step 11: 提交**

```bash
git add js/card-editor.js tests/card-editor.test.js
git commit -m "feat(card): wire crop flow into card editor (start / complete / cancel)"
```

---

## Task 5: 在切 tab 时调用 `cardEditor.cancelCrop()`

**Files:**
- Modify: `js/main.js:374-400`（`onSwitch` 回调）

- [ ] **Step 1: 在切到 CARD 时销毁残留 photo cropper + 在切到 PHOTO 时销毁残留 card cropper**

把 `js/main.js:374-400` 的 `onSwitch` 函数体替换为：

```js
  onSwitch: (newMode) => {
    state.mode = newMode;
    if (newMode === 'PHOTO') {
      // CARD → PHOTO: cancel any active card cropper.
      cardEditor.cancelCrop();
      // Restore photo cropper if needed.
      if (state.originalImage && !state.croppedCanvas && !cropperWrapper.isActive()) {
        dom.cropImage.src = state.originalImage.src;
        const photo = PHOTO_SIZES[state.photoSize];
        cropperWrapper.init({ aspectRatio: photo.w / photo.h });
        setStatus('CROPPING');
      } else if (state.croppedCanvas) {
        setStatus('READY');
      } else {
        setStatus('INITIAL');
      }
      state.drawing = 'repeat';
      rebuildPhotoSource();
    } else {
      // PHOTO → CARD: destroy any active photo cropper, jump straight to READY.
      if (cropperWrapper.isActive()) cropperWrapper.destroy();
      state.drawing = 'repeat';
      setStatus('READY');
      cardEditor.redraw();
      return;
    }
    refresh();
  },
```

- [ ] **Step 2: 验证**

Run: 在浏览器中打开 `index.html`，
1. 切到 CARD tab → 点「+ 添加图片」→ 选一张图 → 应出现裁剪面板
2. 在裁剪状态切到 PHOTO tab → 切回 CARD → 应没有残留 cropper 实例（DOM `#card-crop-img.src === ''`、`#card-crop-section.hidden === true`）
3. 重复选择同一文件应能再次触发 change（input.value 已清空）

- [ ] **Step 3: 提交**

```bash
git add js/main.js
git commit -m "fix(card): cancel card cropper on mode switch"
```

---

## Task 6: 整体回归 + 文档更新

**Files:**
- Modify: `README.md`（卡片功能描述里补一句"添加图片时需先裁剪"）

- [ ] **Step 1: 运行全部测试**

Run: `npm test`
Expected: 所有用例通过（包括 photo-mode 的现有测试）。

- [ ] **Step 2: 在 README.md 卡片描述中加一行**

找到 `README.md` 中关于卡片功能的描述（约第 13 行 `- 🎴 简易卡片制作：多字段文字 + 嵌入图片，CSV 批量填充，排版到任意相纸`），改为：

```markdown
- 🎴 简易卡片制作：多字段文字 + 嵌入图片，CSV 批量填充，排版到任意相纸；嵌入图片时强制先裁剪，去掉多余背景
```

- [ ] **Step 3: 手动 smoke test**

Run: 浏览器打开 `index.html`，依次验证：
- ✅ photo-mode 流程零回归（上传 → 裁剪 → 完成 → 排版 → 导出）
- ✅ card-mode：点「+ 添加图片」→ 裁剪面板出现 → 旋转 / 缩放 → 完成裁剪 → 图片出现在卡片画布上 → 可拖动 / 调宽高 / 解锁比例 / 删除
- ✅ card-mode：「取消」按钮销毁裁剪实例，无新元素
- ✅ 切 tab 不留残留
- ✅ 重复选同一文件能再次触发

- [ ] **Step 4: 提交**

```bash
git add README.md
git commit -m "docs(readme): note that card image upload requires cropping"
```

---

## Spec Coverage Check

| Spec 章节 | 任务 |
|---|---|
| §3.1 新增 card-cropper.js | Task 1 |
| §3.2 改动文件清单 | Task 2 (DOM) / Task 3 (main.js dom 表) / Task 4 (card-editor.js) / Task 5 (main.js 切 tab) |
| §4.1 DOM 结构 | Task 2 |
| §4.2 互斥显示 | 通过 `hidden` 属性（`#card-crop-section` 默认 `hidden`；photo-mode 的 `#crop-section` 在 CARD 模式下 `hidden`）— 现状已满足 |
| §5.1 状态机 | Task 4 Step 4-7（startCrop / completeCrop / cancelCrop / finishCropInternal） |
| §5.2 完成裁剪后元素构造 | Task 4 Step 5（`completeCrop` 内） |
| §6 错误处理 | Task 4 Step 5（getCroppedCanvas 返回 null → alert） |
| §7.1 单元测试 | Task 1（card-cropper）+ Task 4 Step 9（card-editor） |
| §7.2 手动验证清单 | Task 6 Step 3 |
| §9 验收标准 | Task 6 Step 1-3 |

全部覆盖。
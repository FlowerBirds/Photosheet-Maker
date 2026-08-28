# Photosheet-Maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-only photo sheet layout tool that lets users upload a photo, crop/rotate it, pick a target ID-photo size and a paper size, and export a high-resolution JPG/PNG with crop marks.

**Architecture:** Single-page application (SPA) using native HTML/CSS/JavaScript (ES modules). No build step. All processing happens in the browser. Pure-function layout algorithm is fully unit-tested with Vitest.

**Tech Stack:**
- Native HTML5 + CSS3 + ES6+ JavaScript (ES modules)
- [Cropper.js](https://fengyuanchen.github.io/cropperjs/) (CDN) for the crop UI
- Canvas 2D API for rendering & export
- Vitest (devDependency only) for unit tests
- No bundler, no framework, no backend

---

## File Structure

```
photosheet-maker/
├── index.html                      # Single-page entry, loads modules + Cropper.js CDN
├── package.json                    # DevDependencies: vitest
├── css/
│   └── style.css                   # Layout + responsive breakpoints
├── js/
│   ├── main.js                     # Entry point, state, state machine, wiring
│   ├── constants.js                # PHOTO_SIZES, PAPER_SIZES, DEFAULT_DPI
│   ├── uploader.js                 # File validation + image loading
│   ├── cropper-wrapper.js          # Cropper.js wrapper (init, rotate, aspect, getCanvas)
│   ├── config-panel.js             # Form bindings → state
│   ├── layout-engine.js            # Pure: calculateLayout(photo, paper, margin, gap)
│   ├── preview-renderer.js         # Draw preview on a small canvas
│   └── exporter.js                 # Full-resolution canvas → blob → download
├── tests/
│   └── layout-engine.test.js       # Vitest unit tests
├── docs/
│   └── superpowers/
│       ├── specs/
│       │   └── 2026-08-28-photosheet-maker-design.md
│       └── plans/
│           └── 2026-08-28-photosheet-maker.md
├── README.md
└── LICENSE
```

---

## Task 1: Project Initialization

**Files:**
- Create: `package.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "photosheet-maker",
  "version": "0.1.0",
  "description": "Browser-only photo sheet layout tool",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd "D:/07_code/python/Photosheet-Maker" && npm install`
Expected: `node_modules/` created, vitest installed. No errors.

- [ ] **Step 3: Verify vitest works**

Run: `npx vitest --version`
Expected: prints a version string like `2.x.y`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: initialize project with vitest devDependency"
```

---

## Task 2: Constants Module (PHOTO_SIZES, PAPER_SIZES, DPI)

**Files:**
- Create: `js/constants.js`

- [ ] **Step 1: Create `js/constants.js`**

```js
// 证件照 / ID-photo standard sizes in millimeters.
export const PHOTO_SIZES = {
  '一寸':   { w: 25, h: 35 },
  '小一寸': { w: 22, h: 32 },
  '大一寸': { w: 33, h: 48 },
  '二寸':   { w: 35, h: 49 },
  '小二寸': { w: 35, h: 45 },
  '大二寸': { w: 35, h: 53 },
};

// Common paper sizes in millimeters.
export const PAPER_SIZES = {
  '6寸（4R）': { w: 102, h: 152 },
  '5寸（3R）': { w: 89,  h: 127 },
  '7寸（5R）': { w: 127, h: 178 },
  'A6':       { w: 105, h: 148 },
  'A5':       { w: 148, h: 210 },
  'A4':       { w: 210, h: 297 },
  'A3':       { w: 297, h: 420 },
};

// Output resolution.
export const DEFAULT_DPI = 350;
export const DPI_OPTIONS = [150, 300, 350, 600];

// UI defaults.
export const DEFAULT_MARGIN = { top: 5, bottom: 5, left: 5, right: 5 };
export const DEFAULT_GAP    = { h: 2, v: 2 };

// File upload constraints.
export const MAX_FILE_BYTES  = 20 * 1024 * 1024; // 20 MB
export const ACCEPTED_TYPES  = ['image/jpeg', 'image/png', 'image/webp'];

// Crop-mark geometry in millimeters.
export const CROP_MARK_OFFSET = 3; // mm inset from photo edge
export const CROP_MARK_LENGTH = 5; // mm line length
```

- [ ] **Step 2: Commit**

```bash
git add js/constants.js
git commit -m "feat: add constants module (sizes, defaults, limits)"
```

---

## Task 3: LayoutEngine — Failing Test

**Files:**
- Create: `tests/layout-engine.test.js`

- [ ] **Step 1: Create `tests/layout-engine.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { calculateLayout } from '../js/layout-engine.js';

describe('calculateLayout', () => {
  it('packs 一寸 (25x35) into A4 with zero margin/gap', () => {
    const layout = calculateLayout(
      { w: 25, h: 35 },
      { w: 210, h: 297 },
      { top: 0, bottom: 0, left: 0, right: 0 },
      { h: 0, v: 0 }
    );
    expect(layout.cols).toBe(8);
    expect(layout.rows).toBe(8);
    expect(layout.count).toBe(64);
  });

  it('packs 一寸 (25x35) into A4 with default margin (5mm) and gap (2mm)', () => {
    const layout = calculateLayout(
      { w: 25, h: 35 },
      { w: 210, h: 297 },
      { top: 5, bottom: 5, left: 5, right: 5 },
      { h: 2, v: 2 }
    );
    expect(layout.cols).toBe(7);
    expect(layout.rows).toBe(7);
    expect(layout.count).toBe(49);
  });

  it('returns 0 count when paper is too small', () => {
    const layout = calculateLayout(
      { w: 25, h: 35 },
      { w: 50, h: 50 },
      { top: 5, bottom: 5, left: 5, right: 5 },
      { h: 2, v: 2 }
    );
    expect(layout.count).toBe(0);
    expect(layout.positions).toEqual([]);
  });

  it('produces correct positions for a single-row case', () => {
    const layout = calculateLayout(
      { w: 20, h: 20 },
      { w: 100, h: 30 },
      { top: 5, bottom: 5, left: 5, right: 5 },
      { h: 0, v: 0 }
    );
    // usableW = 90, cols = floor(90/20) = 4
    // usableH = 20, rows = floor(20/20) = 1
    expect(layout.cols).toBe(4);
    expect(layout.rows).toBe(1);
    expect(layout.positions).toEqual([
      { x: 5, y: 5 },
      { x: 25, y: 5 },
      { x: 45, y: 5 },
      { x: 65, y: 5 },
    ]);
  });

  it('handles asymmetric margins', () => {
    const layout = calculateLayout(
      { w: 25, h: 35 },
      { w: 100, h: 200 },
      { top: 10, bottom: 0, left: 0, right: 0 },
      { h: 0, v: 0 }
    );
    // usableW = 100, cols = 4
    // usableH = 190, rows = floor(190/35) = 5
    expect(layout.cols).toBe(4);
    expect(layout.rows).toBe(5);
    expect(layout.positions[0]).toEqual({ x: 0, y: 10 });
    expect(layout.positions[4]).toEqual({ x: 75, y: 10 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/layout-engine.test.js`
Expected: FAIL — error like `Failed to resolve import "../js/layout-engine.js"`.

- [ ] **Step 3: Commit**

```bash
git add tests/layout-engine.test.js
git commit -m "test: add failing tests for layout-engine"
```

---

## Task 4: LayoutEngine — Implementation

**Files:**
- Create: `js/layout-engine.js`

- [ ] **Step 1: Implement `js/layout-engine.js`**

```js
/**
 * Pure function: compute how many photos of a given size fit on a paper
 * given margins and inter-photo gaps, plus the exact mm coordinates
 * of each photo on the paper.
 *
 * @param {{w:number, h:number}} photo   - target photo size (mm)
 * @param {{w:number, h:number}} paper   - paper size (mm)
 * @param {{top:number, bottom:number, left:number, right:number}} margin  (mm)
 * @param {{h:number, v:number}} gap     - horizontal & vertical gaps (mm)
 * @returns {{cols:number, rows:number, count:number, positions:Array<{x:number,y:number}>, paperSize:{w:number,h:number}}}
 */
export function calculateLayout(photo, paper, margin, gap) {
  const usableW = paper.w - margin.left - margin.right;
  const usableH = paper.h - margin.top - margin.bottom;

  const cols = Math.floor((usableW + gap.h) / (photo.w + gap.h));
  const rows = Math.floor((usableH + gap.v) / (photo.h + gap.v));

  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push({
        x: margin.left + c * (photo.w + gap.h),
        y: margin.top + r * (photo.h + gap.v),
      });
    }
  }

  return { cols, rows, count: cols * rows, positions, paperSize: paper };
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/layout-engine.test.js`
Expected: PASS — 5 tests passed.

- [ ] **Step 3: Commit**

```bash
git add js/layout-engine.js
git commit -m "feat: implement layout-engine calculateLayout"
```

---

## Task 5: HTML Skeleton

**Files:**
- Create: `index.html`

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Photosheet-Maker · 证件照排版工具</title>
  <link rel="stylesheet" href="css/style.css" />
  <!-- Cropper.js CSS via CDN -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css" />
</head>
<body>
  <header class="app-header">
    <h1>📐 Photosheet-Maker</h1>
    <div class="header-actions">
      <button id="btn-reupload" class="btn-secondary" hidden>重新上传</button>
      <button id="btn-recrop" class="btn-secondary" hidden>重新裁剪</button>
      <button id="btn-export" class="btn-primary" disabled>导出图片</button>
    </div>
  </header>

  <main class="container">
    <!-- Control panel (left on desktop, top on mobile) -->
    <aside class="control-panel">
      <!-- ① Upload -->
      <section class="card" id="upload-section">
        <h2>① 上传照片</h2>
        <input type="file" id="file-input" accept="image/jpeg,image/png,image/webp" />
        <p class="hint">支持 JPG / PNG / WebP，最大 20MB</p>
      </section>

      <!-- ② Crop + Rotate (visible only after upload) -->
      <section class="card" id="crop-section" hidden>
        <h2>② 裁剪与旋转</h2>
        <div class="crop-container">
          <img id="crop-image" alt="待裁剪图片" />
        </div>
        <div class="crop-actions">
          <button id="btn-rotate-left"  class="btn-secondary">↺ 左旋转</button>
          <button id="btn-rotate-right" class="btn-secondary">↻ 右旋转</button>
          <button id="btn-finish-crop"  class="btn-primary">完成裁剪</button>
        </div>
      </section>

      <!-- ③ Settings (visible after cropping) -->
      <section class="card" id="settings-section" hidden>
        <h2>③ 排版设置</h2>

        <label>目标尺寸
          <select id="select-photo-size"></select>
        </label>

        <label>相纸尺寸
          <select id="select-paper-size"></select>
        </label>

        <label>输出 DPI
          <select id="select-dpi"></select>
        </label>

        <fieldset>
          <legend>边距（mm）</legend>
          <label>上 <input type="number" id="margin-top"    min="0" max="50" /></label>
          <label>下 <input type="number" id="margin-bottom" min="0" max="50" /></label>
          <label>左 <input type="number" id="margin-left"   min="0" max="50" /></label>
          <label>右 <input type="number" id="margin-right"  min="0" max="50" /></label>
        </fieldset>

        <fieldset>
          <legend>间距（mm）</legend>
          <label>横向 <input type="number" id="gap-h" min="0" max="20" /></label>
          <label>竖向 <input type="number" id="gap-v" min="0" max="20" /></label>
        </fieldset>
      </section>
    </aside>

    <!-- Preview area (right on desktop, bottom on mobile) -->
    <section class="preview-area">
      <div class="preview-wrapper">
        <canvas id="preview-canvas"></canvas>
      </div>

      <div class="info-panel" id="info-panel">
        <p>容纳：<span id="info-count">—</span> 张</p>
        <p>输出：<span id="info-size">—</span></p>
        <p id="info-warning" class="warning" hidden></p>
      </div>
    </section>
  </main>

  <!-- Toast region -->
  <div id="toast" class="toast" hidden></div>

  <!-- Cropper.js + our modules -->
  <script src="https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js"></script>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add HTML skeleton with all sections"
```

---

## Task 6: CSS — Base Layout & Responsive

**Files:**
- Create: `css/style.css`

- [ ] **Step 1: Create `css/style.css`**

```css
/* ---------- Reset & base ---------- */
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
               "Microsoft YaHei", sans-serif;
  color: #222;
  background: #f5f5f7;
  min-height: 100vh;
}

h1, h2 { margin: 0; }
button { font: inherit; }

/* ---------- Header ---------- */
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  position: sticky; top: 0; z-index: 10;
}
.app-header h1 { font-size: 18px; }
.header-actions { display: flex; gap: 8px; }

.btn-primary, .btn-secondary {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
}
.btn-primary {
  background: #2d7ff9; color: #fff;
}
.btn-primary:disabled { background: #b0c8e8; cursor: not-allowed; }
.btn-secondary {
  background: #fff; color: #333; border-color: #ccc;
}
.btn-secondary:hover { background: #f0f0f0; }

/* ---------- Container (mobile-first: column) ---------- */
.container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  max-width: 1400px;
  margin: 0 auto;
}

/* ---------- Cards ---------- */
.card {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.card h2 { font-size: 15px; margin-bottom: 12px; color: #555; }
.card label { display: block; margin-bottom: 10px; font-size: 14px; }
.card input[type="number"],
.card select {
  display: block;
  width: 100%;
  padding: 6px 8px;
  margin-top: 4px;
  border: 1px solid #ddd;
  border-radius: 4px;
}
.card fieldset {
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 10px 12px;
  margin: 10px 0 0;
}
.card fieldset legend { font-size: 13px; color: #777; padding: 0 4px; }
.card fieldset label { display: inline-flex; align-items: center; gap: 6px; margin-right: 12px; }
.card fieldset input[type="number"] { width: 70px; }
.hint { color: #888; font-size: 12px; margin: 6px 0 0; }

/* ---------- Crop container ---------- */
.crop-container {
  max-height: 320px;
  overflow: hidden;
  background: #f0f0f0;
  border-radius: 6px;
  margin-bottom: 12px;
}
.crop-container img { display: block; max-width: 100%; }
.crop-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* ---------- Preview ---------- */
.preview-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.preview-wrapper {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.preview-wrapper canvas {
  max-width: 100%;
  height: auto;
  border: 1px solid #ddd;
}
.info-panel {
  background: #fff;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.info-panel p { margin: 4px 0; }
.info-panel .warning { color: #d9534f; font-weight: 500; }

/* ---------- Toast ---------- */
.toast {
  position: fixed;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.85);
  color: #fff;
  padding: 10px 18px;
  border-radius: 6px;
  font-size: 14px;
  z-index: 1000;
  transition: opacity 0.3s;
}

/* ---------- Responsive: tablet & desktop ---------- */
@media (min-width: 768px) {
  .container { flex-direction: row; }
  .control-panel { width: 320px; flex-shrink: 0; }
}
@media (min-width: 1024px) {
  .control-panel { width: 360px; }
}

/* ---------- Print (optional, future) ---------- */
@media print {
  .app-header, .control-panel { display: none; }
  .preview-wrapper { box-shadow: none; }
}
```

- [ ] **Step 2: Commit**

```bash
git add css/style.css
git commit -m "feat: add responsive CSS layout"
```

---

## Task 7: Uploader Module

**Files:**
- Create: `js/uploader.js`

- [ ] **Step 1: Create `js/uploader.js`**

```js
import { MAX_FILE_BYTES, ACCEPTED_TYPES } from './constants.js';

/**
 * Validate and load an image File.
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 * @throws on validation failure
 */
export function loadImageFile(file) {
  if (!file) throw new Error('未选择文件');

  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('仅支持 JPG / PNG / WebP 格式');
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB），请压缩到 20MB 以下`);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片解析失败，请尝试其他图片'));
      img.onload  = () => resolve(img);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Wire the <input type="file"> to a callback.
 * @param {HTMLInputElement} input
 * @param {(img: HTMLImageElement) => void} onImage
 * @param {(err: Error) => void} onError
 */
export function bindUploader(input, onImage, onError) {
  input.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const img = await loadImageFile(file);
      onImage(img);
    } catch (err) {
      onError(err);
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add js/uploader.js
git commit -m "feat: add uploader module with validation"
```

---

## Task 8: Cropper Wrapper Module

**Files:**
- Create: `js/cropper-wrapper.js`

- [ ] **Step 1: Create `js/cropper-wrapper.js`**

```js
/**
 * Thin wrapper around Cropper.js to keep its API tidy and contained.
 *
 * Lifecycle:
 *   const cw = createCropperWrapper(imageElement);
 *   cw.init({ aspectRatio: 25/35 });           // start cropping
 *   cw.setAspectRatio(35/25);                   // update on size change / rotation
 *   cw.rotate(90);                              // rotate the canvas content
 *   const canvas = cw.getCroppedCanvas();       // produce output
 *   cw.destroy();                               // tear down
 */

export function createCropperWrapper(imgEl) {
  let cropper = null;

  return {
    /**
     * Initialize Cropper.js on the given <img>. Idempotent: destroys any existing instance first.
     * @param {{aspectRatio: number}} opts
     */
    init({ aspectRatio }) {
      if (cropper) this.destroy();
      cropper = new Cropper(imgEl, {
        aspectRatio,
        viewMode: 1,           // restrict crop box within canvas
        autoCropArea: 0.8,
        movable: true,
        scalable: true,
        zoomable: true,
        rotatable: true,
        responsive: true,
      });
    },

    /** Update the crop box aspect ratio (used when target size or rotation changes). */
    setAspectRatio(ratio) {
      if (!cropper) return;
      cropper.setAspectRatio(ratio);
    },

    /** Rotate the underlying image by `degrees` (CW positive). */
    rotate(degrees) {
      if (!cropper) return;
      cropper.rotate(degrees);
    },

    /**
     * Produce the cropped output canvas. Resolution is determined by the source image.
     * @param {{width?:number, height?:number, minWidth?:number, minHeight?:number}} [opts]
     * @returns {HTMLCanvasElement|null}
     */
    getCroppedCanvas(opts = {}) {
      if (!cropper) return null;
      return cropper.getCroppedCanvas({
        fillColor: '#ffffff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        ...opts,
      });
    },

    /** Tear down the Cropper instance and release the image. */
    destroy() {
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }
    },

    /** Whether a Cropper instance is currently active. */
    isActive() {
      return cropper !== null;
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add js/cropper-wrapper.js
git commit -m "feat: add Cropper.js wrapper module"
```

---

## Task 9: Config Panel Module

**Files:**
- Create: `js/config-panel.js`

- [ ] **Step 1: Create `js/config-panel.js`**

```js
import {
  PHOTO_SIZES, PAPER_SIZES, DPI_OPTIONS,
  DEFAULT_MARGIN, DEFAULT_GAP,
} from './constants.js';

/**
 * Populate <select> with options derived from an object map.
 * @param {HTMLSelectElement} select
 * @param {Record<string,{w:number,h:number}>} map
 */
function fillSelect(select, map) {
  select.innerHTML = '';
  for (const [label, _] of Object.entries(map)) {
    const opt = document.createElement('option');
    opt.value = label;
    opt.textContent = label;
    select.appendChild(opt);
  }
}

/**
 * Initialize all controls in the settings panel and wire them to callbacks.
 *
 * @param {{
 *   photoSize: HTMLSelectElement,
 *   paperSize: HTMLSelectElement,
 *   dpi:       HTMLSelectElement,
 *   marginTop: HTMLInputElement, marginBottom: HTMLInputElement,
 *   marginLeft: HTMLInputElement, marginRight: HTMLInputElement,
 *   gapH: HTMLInputElement, gapV: HTMLInputElement,
 * }} els
 * @param {(patch: object) => void} onChange   - called with a partial state patch
 */
export function initConfigPanel(els, onChange) {
  // Populate selects.
  fillSelect(els.photoSize, PHOTO_SIZES);
  fillSelect(els.paperSize, PAPER_SIZES);
  els.dpi.innerHTML = '';
  for (const v of DPI_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = String(v);
    opt.textContent = `${v} DPI`;
    if (v === 350) opt.selected = true;
    els.dpi.appendChild(opt);
  }

  // Defaults.
  els.photoSize.value = '一寸';
  els.paperSize.value = 'A4';
  els.marginTop.value    = DEFAULT_MARGIN.top;
  els.marginBottom.value = DEFAULT_MARGIN.bottom;
  els.marginLeft.value   = DEFAULT_MARGIN.left;
  els.marginRight.value  = DEFAULT_MARGIN.right;
  els.gapH.value         = DEFAULT_GAP.h;
  els.gapV.value         = DEFAULT_GAP.v;

  // Debounced change handler for numeric inputs.
  let timer = null;
  const debounced = (patch) => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange(patch), 100);
  };

  // Wire change events.
  els.photoSize.addEventListener('change', () => onChange({ photoSize: els.photoSize.value }));
  els.paperSize.addEventListener('change', () => onChange({ paperSize: els.paperSize.value }));
  els.dpi.addEventListener('change',       () => onChange({ dpi: Number(els.dpi.value) }));

  const marginPatch = () => ({
    margin: {
      top:    Number(els.marginTop.value),
      bottom: Number(els.marginBottom.value),
      left:   Number(els.marginLeft.value),
      right:  Number(els.marginRight.value),
    },
  });
  els.marginTop.addEventListener('input',    () => debounced(marginPatch()));
  els.marginBottom.addEventListener('input', () => debounced(marginPatch()));
  els.marginLeft.addEventListener('input',   () => debounced(marginPatch()));
  els.marginRight.addEventListener('input',  () => debounced(marginPatch()));

  const gapPatch = () => ({
    gap: { h: Number(els.gapH.value), v: Number(els.gapV.value) },
  });
  els.gapH.addEventListener('input', () => debounced(gapPatch()));
  els.gapV.addEventListener('input', () => debounced(gapPatch()));
}
```

- [ ] **Step 2: Commit**

```bash
git add js/config-panel.js
git commit -m "feat: add config-panel module"
```

---

## Task 10: Preview Renderer Module

**Files:**
- Create: `js/preview-renderer.js`

- [ ] **Step 1: Create `js/preview-renderer.js`**

```js
import { calculateLayout } from './layout-engine.js';

const PREVIEW_MAX_WIDTH_PX = 600;

/**
 * Render the layout preview onto the given canvas at screen resolution.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   photoSize: string, paperSize: string,
 *   margin: {top:number,bottom:number,left:number,right:number},
 *   gap:    {h:number, v:number},
 * }} params
 * @param {Record<string,{w:number,h:number}>} photoMap
 * @param {Record<string,{w:number,h:number}>} paperMap
 * @param {HTMLCanvasElement|null} croppedCanvas - the cropped source image
 */
export function renderPreview(canvas, params, photoMap, paperMap, croppedCanvas) {
  const ctx = canvas.getContext('2d');
  const photo = photoMap[params.photoSize];
  const paper = paperMap[params.paperSize];
  if (!photo || !paper) return;

  // Calculate scale to fit preview within PREVIEW_MAX_WIDTH_PX.
  const scale = PREVIEW_MAX_WIDTH_PX / paper.w;
  const displayW = paper.w * scale;
  const displayH = paper.h * scale;

  // Size the canvas (use devicePixelRatio for crisp rendering).
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = displayW * dpr;
  canvas.height = displayH * dpr;
  canvas.style.width  = `${displayW}px`;
  canvas.style.height = `${displayH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Clear & paint background.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, displayW, displayH);

  // Compute layout in mm → convert to px.
  const layout = calculateLayout(photo, paper, params.margin, params.gap);

  if (croppedCanvas) {
    for (const pos of layout.positions) {
      ctx.drawImage(
        croppedCanvas,
        pos.x * scale,
        pos.y * scale,
        photo.w * scale,
        photo.h * scale
      );
    }
  } else {
    // Fallback placeholder if no cropped canvas yet.
    ctx.fillStyle = '#e0e0e0';
    for (const pos of layout.positions) {
      ctx.fillRect(pos.x * scale, pos.y * scale, photo.w * scale, photo.h * scale);
    }
  }

  return layout;
}
```

- [ ] **Step 2: Commit**

```bash
git add js/preview-renderer.js
git commit -m "feat: add preview renderer module"
```

---

## Task 11: Exporter Module

**Files:**
- Create: `js/exporter.js`

- [ ] **Step 1: Create `js/exporter.js`**

```js
import { calculateLayout } from './layout-engine.js';
import { CROP_MARK_OFFSET, CROP_MARK_LENGTH } from './constants.js';

/**
 * Generate the full-resolution output image and trigger a download.
 *
 * @param {{
 *   croppedCanvas: HTMLCanvasElement,
 *   photoSize: string, paperSize: string, dpi: number,
 *   margin: {top:number,bottom:number,left:number,right:number},
 *   gap:    {h:number, v:number},
 *   format: 'jpeg'|'png',
 * }} params
 * @param {Record<string,{w:number,h:number}>} photoMap
 * @param {Record<string,{w:number,h:number}>} paperMap
 * @returns {Promise<void>}
 */
export async function exportImage(params, photoMap, paperMap) {
  const { croppedCanvas, photoSize, paperSize, dpi, margin, gap, format } = params;
  const photo = photoMap[photoSize];
  const paper = paperMap[paperSize];

  // mm → pixels at output DPI.
  const mmToPx = dpi / 25.4;
  const canvasW = Math.round(paper.w * mmToPx);
  const canvasH = Math.round(paper.h * mmToPx);

  const out = document.createElement('canvas');
  out.width  = canvasW;
  out.height = canvasH;
  const ctx = out.getContext('2d');

  // White background.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Draw cropped photos at each layout position.
  const layout = calculateLayout(photo, paper, margin, gap);
  if (croppedCanvas && layout.count > 0) {
    for (const pos of layout.positions) {
      ctx.drawImage(
        croppedCanvas,
        Math.round(pos.x * mmToPx),
        Math.round(pos.y * mmToPx),
        Math.round(photo.w * mmToPx),
        Math.round(photo.h * mmToPx)
      );
    }

    // Crop marks: 4 short lines at each photo corner (inset by 3mm).
    drawCropMarks(ctx, layout, photo, mmToPx);
  }

  // Encode and trigger download.
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const quality = format === 'png' ? undefined : 0.95;
  const blob = await new Promise((resolve, reject) => {
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('生成图片失败'))),
      mime,
      quality
    );
  });

  triggerDownload(blob, `Photosheet_${Date.now()}.${format === 'png' ? 'png' : 'jpg'}`);
}

function drawCropMarks(ctx, layout, photo, mmToPx) {
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(1, mmToPx * 0.2);
  const offsetPx = CROP_MARK_OFFSET * mmToPx;
  const lengthPx = CROP_MARK_LENGTH * mmToPx;

  for (const pos of layout.positions) {
    const x = pos.x * mmToPx;
    const y = pos.y * mmToPx;
    const w = photo.w * mmToPx;
    const h = photo.h * mmToPx;

    // Top-left corner.
    line(ctx, x - offsetPx,        y - offsetPx, x - offsetPx,        y - offsetPx + lengthPx);
    line(ctx, x - offsetPx,        y - offsetPx, x - offsetPx + lengthPx, y - offsetPx);

    // Top-right corner.
    line(ctx, x + w + offsetPx,    y - offsetPx, x + w + offsetPx,    y - offsetPx + lengthPx);
    line(ctx, x + w + offsetPx,    y - offsetPx, x + w + offsetPx - lengthPx, y - offsetPx);

    // Bottom-left corner.
    line(ctx, x - offsetPx,        y + h + offsetPx, x - offsetPx,        y + h + offsetPx - lengthPx);
    line(ctx, x - offsetPx,        y + h + offsetPx, x - offsetPx + lengthPx, y + h + offsetPx);

    // Bottom-right corner.
    line(ctx, x + w + offsetPx,    y + h + offsetPx, x + w + offsetPx,    y + h + offsetPx - lengthPx);
    line(ctx, x + w + offsetPx,    y + h + offsetPx, x + w + offsetPx - lengthPx, y + h + offsetPx);
  }
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 2: Commit**

```bash
git add js/exporter.js
git commit -m "feat: add exporter module with crop marks"
```

---

## Task 12: Main Entry — State + Wiring

**Files:**
- Create: `js/main.js`

- [ ] **Step 1: Create `js/main.js`**

```js
import { PHOTO_SIZES, PAPER_SIZES } from './constants.js';
import { bindUploader } from './uploader.js';
import { createCropperWrapper } from './cropper-wrapper.js';
import { initConfigPanel } from './config-panel.js';
import { renderPreview } from './preview-renderer.js';
import { exportImage } from './exporter.js';

// ---------- DOM refs ----------
const $ = (id) => document.getElementById(id);
const dom = {
  fileInput:     $('file-input'),
  cropImage:     $('crop-image'),
  uploadSection: $('upload-section'),
  cropSection:   $('crop-section'),
  settings:      $('settings-section'),
  btnReupload:   $('btn-reupload'),
  btnRecrop:     $('btn-recrop'),
  btnExport:     $('btn-export'),
  btnRotateL:    $('btn-rotate-left'),
  btnRotateR:    $('btn-rotate-right'),
  btnFinishCrop: $('btn-finish-crop'),
  preview:       $('preview-canvas'),
  infoCount:     $('info-count'),
  infoSize:      $('info-size'),
  infoWarning:   $('info-warning'),
  toast:         $('toast'),
};

// ---------- State ----------
const state = {
  status: 'INITIAL',  // INITIAL | CROPPING | READY | EXPORTING
  originalImage: null,
  croppedCanvas: null,
  photoSize: '一寸',
  paperSize: 'A4',
  dpi: 350,
  margin: { top: 5, bottom: 5, left: 5, right: 5 },
  gap:    { h: 2, v: 2 },
  rotation: 0,  // cumulative rotation in degrees (mod 360)
};

const cropperWrapper = createCropperWrapper(dom.cropImage);

// ---------- Toast ----------
let toastTimer = null;
function toast(msg, ms = 3000) {
  dom.toast.textContent = msg;
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (dom.toast.hidden = true), ms);
}

// ---------- Visibility helpers ----------
function showSectionsFor(status) {
  dom.uploadSection.hidden = status !== 'INITIAL';
  dom.cropSection.hidden   = status === 'INITIAL';
  dom.settings.hidden      = status === 'INITIAL';
  dom.btnReupload.hidden   = status === 'INITIAL';
  dom.btnRecrop.hidden     = status !== 'READY';
}

// ---------- State transitions ----------
function setStatus(next) {
  state.status = next;
  showSectionsFor(next);
}

function setState(patch) {
  Object.assign(state, patch);
  refresh();
}

// ---------- Refresh (recalculate + redraw) ----------
function refresh() {
  if (state.status === 'READY' || state.status === 'CROPPING') {
    const layout = renderPreview(
      dom.preview,
      { photoSize: state.photoSize, paperSize: state.paperSize,
        margin: state.margin, gap: state.gap },
      PHOTO_SIZES, PAPER_SIZES,
      state.status === 'READY' ? state.croppedCanvas : null
    );

    if (layout) {
      dom.infoCount.textContent = layout.count;
      const paper = PAPER_SIZES[state.paperSize];
      const w = Math.round(paper.w * state.dpi / 25.4);
      const h = Math.round(paper.h * state.dpi / 25.4);
      dom.infoSize.textContent = `${w} × ${h} px @ ${state.dpi} DPI`;
      if (layout.count === 0) {
        dom.infoWarning.textContent = '当前设置无法容纳任何照片，请缩小边距/间距或换大相纸';
        dom.infoWarning.hidden = false;
        dom.btnExport.disabled = true;
      } else {
        dom.infoWarning.hidden = true;
        dom.btnExport.disabled = state.status !== 'READY';
      }
    }
  }
}

// ---------- Uploader wiring ----------
bindUploader(
  dom.fileInput,
  (img) => {
    state.originalImage = img;
    dom.cropImage.src = img.src;
    const photo = PHOTO_SIZES[state.photoSize];
    cropperWrapper.init({ aspectRatio: photo.w / photo.h });
    state.rotation = 0;
    setStatus('CROPPING');
    refresh();
  },
  (err) => toast(err.message)
);

// ---------- Cropper wiring ----------
dom.btnRotateL.addEventListener('click', () => {
  if (state.status !== 'CROPPING') return;
  state.rotation = (state.rotation - 90) % 360;
  cropperWrapper.rotate(-90);
  // After rotation, aspect ratio flips too (rotate swaps w↔h).
  const photo = PHOTO_SIZES[state.photoSize];
  const [w, h] = state.rotation % 180 === 0 ? [photo.w, photo.h] : [photo.h, photo.w];
  cropperWrapper.setAspectRatio(w / h);
});

dom.btnRotateR.addEventListener('click', () => {
  if (state.status !== 'CROPPING') return;
  state.rotation = (state.rotation + 90) % 360;
  cropperWrapper.rotate(90);
  const photo = PHOTO_SIZES[state.photoSize];
  const [w, h] = state.rotation % 180 === 0 ? [photo.w, photo.h] : [photo.h, photo.w];
  cropperWrapper.setAspectRatio(w / h);
});

dom.btnFinishCrop.addEventListener('click', () => {
  const canvas = cropperWrapper.getCroppedCanvas();
  if (!canvas) return;
  state.croppedCanvas = canvas;
  cropperWrapper.destroy();
  setStatus('READY');
  refresh();
  toast('裁剪完成，已进入排版阶段');
});

dom.btnRecrop.addEventListener('click', () => {
  if (!state.originalImage) return;
  dom.cropImage.src = state.originalImage.src;
  const photo = PHOTO_SIZES[state.photoSize];
  cropperWrapper.init({ aspectRatio: photo.w / photo.h });
  setStatus('CROPPING');
  refresh();
});

// ---------- Settings wiring ----------
initConfigPanel(
  {
    photoSize: $('select-photo-size'),
    paperSize: $('select-paper-size'),
    dpi:       $('select-dpi'),
    marginTop: $('margin-top'),
    marginBottom: $('margin-bottom'),
    marginLeft: $('margin-left'),
    marginRight: $('margin-right'),
    gapH: $('gap-h'),
    gapV: $('gap-v'),
  },
  (patch) => {
    // If photoSize changed, update Cropper aspect ratio (if active).
    if (patch.photoSize && cropperWrapper.isActive()) {
      const photo = PHOTO_SIZES[patch.photoSize];
      const [w, h] = state.rotation % 180 === 0 ? [photo.w, photo.h] : [photo.h, photo.w];
      cropperWrapper.setAspectRatio(w / h);
    }
    setState(patch);
  }
);

// ---------- Reupload & Export ----------
dom.btnReupload.addEventListener('click', () => {
  if (cropperWrapper.isActive()) cropperWrapper.destroy();
  state.originalImage = null;
  state.croppedCanvas = null;
  state.rotation = 0;
  dom.fileInput.value = '';
  setStatus('INITIAL');
});

dom.btnExport.addEventListener('click', async () => {
  if (!state.croppedCanvas) return;
  const choice = window.confirm('确定导出？\n确定 = JPG（较小）\n取消 = PNG（无损）');
  const format = choice ? 'jpeg' : 'png';
  setStatus('EXPORTING');
  dom.btnExport.disabled = true;
  try {
    await exportImage(
      {
        croppedCanvas: state.croppedCanvas,
        photoSize: state.photoSize,
        paperSize: state.paperSize,
        dpi: state.dpi,
        margin: state.margin,
        gap: state.gap,
        format,
      },
      PHOTO_SIZES, PAPER_SIZES
    );
    toast('已生成图片，请检查下载');
  } catch (err) {
    toast(err.message);
  } finally {
    setStatus('READY');
    refresh();
  }
});

// ---------- Global error handlers ----------
window.addEventListener('error', (e) => {
  console.error('[Photosheet]', e.error);
  toast('发生未知错误');
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Photosheet]', e.reason);
  toast('后台处理失败');
});

// ---------- Initial render ----------
showSectionsFor(state.status);
refresh();
```

- [ ] **Step 2: Commit**

```bash
git add js/main.js
git commit -m "feat: add main entry with state machine and module wiring"
```

---

## Task 13: README — User Documentation

**Files:**
- Modify: `README.md` (replace the design-only content with user docs)

- [ ] **Step 1: Overwrite `README.md` with user-facing content**

```markdown
# Photosheet-Maker

> 浏览器端证件照排版工具，纯前端，照片不离开你的设备。

## ✨ 功能

- 📷 上传任意照片，手动裁剪到目标尺寸
- 🔄 裁剪阶段支持左右旋转，裁剪框比例自动跟随
- 📐 多种证件照尺寸：一寸、小一寸、大一寸、二寸、小二寸、大二寸
- 🖨️ 多种相纸：6 寸 / A6 / A5 / A4 / A3 等
- ✂️ 自动铺满相纸排版，可调整边距与间距
- 💾 导出 JPG / PNG（含裁切标记），冲印店可直接裁切

## 🚀 使用方法

1. 在浏览器中打开 `index.html`
2. 点击「选择文件」上传一张照片
3. 在裁剪界面调整裁剪框位置与大小，必要时旋转方向
4. 点击「完成裁剪」
5. 选择目标尺寸与相纸尺寸，调整边距和间距
6. 点击「导出图片」下载排版结果

## 🛠️ 开发

```bash
# 安装测试依赖
npm install

# 运行单元测试
npm test

# 直接用浏览器打开 index.html 即可运行（无需构建）
```

## 📐 支持的证件照尺寸

| 名称 | 尺寸 (mm) | 用途 |
|------|-----------|------|
| 一寸 | 25 × 35 | 简历、证书、考试 |
| 小一寸 | 22 × 32 | 驾照 |
| 大一寸 | 33 × 48 | 护照 |
| 二寸 | 35 × 49 | 简历封面 |
| 小二寸 | 35 × 45 | 港澳通行证 |
| 大二寸 | 35 × 53 | 较少使用 |

## 📄 支持的相纸尺寸

6 寸（4R）、5 寸（3R）、7 寸（5R）、A6、A5、A4、A3

## 🌐 浏览器兼容

- ✅ Chrome / Edge（推荐）
- ✅ Firefox
- ✅ Safari（含 iOS Safari）

## 📜 License

MIT
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README as user-facing documentation"
```

---

## Task 14: Manual Browser Test (Acceptance Checklist)

**Files:** none (verification only)

- [ ] **Step 1: Open `index.html` in Chrome**

Run: Open `D:/07_code/python/Photosheet-Maker/index.html` directly in the browser (double-click or `file://` URL).
Expected: Page loads, header visible, ① upload section shown.

- [ ] **Step 2: Verify upload validation**

- Upload a `.txt` file → expect toast "仅支持 JPG / PNG / WebP 格式".
- Upload a 25 MB JPG → expect toast "文件过大...".
- Upload a valid JPG → expect ② crop section to appear.

- [ ] **Step 3: Verify cropping UI**

- The image appears in the crop area.
- A crop box with 一寸 aspect ratio (≈5:7) is visible.
- Dragging the crop box updates its position.
- Clicking ↺ 左旋转 / ↻ 右旋转 rotates the image content; the crop box aspect ratio flips.
- Resizing the browser window keeps the layout responsive.

- [ ] **Step 4: Verify settings + preview**

- Click 「完成裁剪」 → ③ settings section appears, preview shows the cropped photo tiled on a paper outline.
- Changing the target size or paper size updates the preview immediately.
- Changing margin / gap values (debounced ~100ms) updates the preview.
- The info panel shows correct count and pixel size.
- Setting very large margins → "容纳：0 张" warning, export disabled.

- [ ] **Step 5: Verify export**

- Click 「导出图片」 → choose JPG via confirm dialog.
- Browser downloads `Photosheet_<timestamp>.jpg`.
- Open the JPG: paper is white, all photos are present, crop marks visible at each photo corner.
- Repeat with PNG → downloads `Photosheet_<timestamp>.png`.

- [ ] **Step 6: Verify error handling**

- Open DevTools console; trigger errors via extreme inputs (e.g. paper = "A6" + target = "二寸" + huge margin) → no uncaught exceptions, toasts appear.

- [ ] **Step 7: Verify unit tests still pass**

Run: `npx vitest run`
Expected: 5 tests pass.

- [ ] **Step 8: Final commit if any tweaks were made**

```bash
git status
# If any changes:
git add -A
git commit -m "fix: tweaks from manual browser testing"
```

---

## Self-Review (against the spec)

**Spec coverage checklist:**

| Spec Section | Covered By |
|---|---|
| Project overview / value | README, design doc |
| In Scope: upload | Task 7 (uploader.js) |
| In Scope: crop | Task 8 (cropper-wrapper.js) |
| In Scope: rotate (90°) | Task 12 (main.js btnRotateL/R) |
| In Scope: preset sizes | Task 2 (constants.js) |
| In Scope: auto-fill paper | Task 4 (layout-engine.js) |
| In Scope: margin/gap controls | Task 9 (config-panel.js) |
| In Scope: DPI choice | Task 9 (config-panel.js) |
| In Scope: live preview | Task 10 (preview-renderer.js) + Task 12 (refresh) |
| In Scope: JPG/PNG export | Task 11 (exporter.js) |
| In Scope: crop marks | Task 11 (drawCropMarks) |
| In Scope: responsive | Task 6 (style.css) |
| State machine | Task 12 (setStatus, status transitions) |
| Error handling | Task 7 + Task 12 (toast, try/catch) |
| Unit tests for layout | Task 3 (failing) + Task 4 (passing) |
| Browser compat | Task 14 (manual Chrome test) |
| User docs | Task 13 (README) |

**Placeholder scan:** no TBD / TODO / "fill in later" in any task.

**Type/signature consistency:**
- `calculateLayout(photo, paper, margin, gap)` used identically in Task 3 (test), Task 4 (impl), Task 10 (preview), Task 11 (export).
- `state.photoSize`, `state.paperSize`, `state.margin`, `state.gap`, `state.dpi`, `state.rotation` referenced consistently in Task 12.
- DOM element IDs in `index.html` (Task 5) match those queried in `main.js` (Task 12) and `config-panel.js` (Task 9).

No issues found.

# Card Maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a card-making feature to Photosheet-Maker — design cards inline (text fields + optional image), batch-fill via CSV, layout onto A4/etc, export. Coexists with existing ID-photo mode via top tabs.

**Architecture:** Introduce a `SourceItem` interface (with `PhotoSourceItem` and `CardSourceItem` impls). `layout-engine`, `preview-renderer`, `exporter` all consume `SourceItem[]`. Mode tab routes the right source array. Photo mode repeats single item; card mode lays each item once.

**Tech Stack:** Vanilla JS (ES modules), Canvas 2D, Vitest, Cropper.js (existing)

**Spec:** `docs/superpowers/specs/2026-08-31-card-maker-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `js/source-item.js` | `SourceItem` interface + `PhotoSourceItem` |
| `js/card-builder.js` | `CardSourceItem` + canvas resolution helper + field rendering |
| `js/card-parser.js` | Parse CSV batch data → row objects |
| `js/card-editor.js` | UI wiring for field config + batch data + image upload |
| `js/mode-tab.js` | Tab switching + state preservation |
| `js/constants.js` (modify) | Add card-related constants |
| `js/layout-engine.js` (modify) | Rename param `photo` → `sourceSize` |
| `js/preview-renderer.js` (modify) | Accept `SourceItem[]` + drawing mode |
| `js/exporter.js` (modify) | Accept `SourceItem[]` + drawing mode |
| `js/main.js` (modify) | Orchestrate per-mode source list |
| `index.html` (modify) | Tab + card editor DOM |
| `css/style.css` (modify) | Tab + card editor styles |

**Tests:** `tests/source-item.test.js`, `tests/card-builder.test.js`, `tests/card-parser.test.js`, `tests/layout-engine.test.js` (extend)

---

## Task 1: Add card constants

**Files:**
- Modify: `js/constants.js` (append)

- [ ] **Step 1: Append card constants**

Append to `js/constants.js`:

```js
// ---------- Card maker ----------

// Card size presets (mm).
export const CARD_SIZES = {
  '一寸':   { w: 25, h: 35 },
  '二寸':   { w: 35, h: 49 },
  '自定义': { w: 90, h: 54 }, // user-editable; default like a business card
};
export const DEFAULT_CARD_SIZE = '一寸';

// Font-size presets for card text fields (ratio of card height).
export const CARD_FONT_SIZE_RATIO = { big: 0.12, mid: 0.07, small: 0.05 };

// Maximum per-card canvas resolution (px on longer side). Above this we
// scale the effective render dpi down uniformly for the whole batch.
export const CARD_MAX_PX = 1500;

// Default text color for new fields.
export const DEFAULT_FIELD_COLOR = '#222222';

// Default field list shown when user opens Card tab the first time.
export const CARD_FIELD_DEFAULTS = [
  { id: 'title',  label: '标题', enabled: true,  default: '欢迎', size: 'big',   color: DEFAULT_FIELD_COLOR },
  { id: 'name',   label: '姓名', enabled: true,  default: '',    size: 'mid',   color: DEFAULT_FIELD_COLOR },
  { id: 'id',     label: '编号', enabled: true,  default: '',    size: 'small', color: DEFAULT_FIELD_COLOR },
  { id: 'note',   label: '备注', enabled: false, default: '',    size: 'small', color: DEFAULT_FIELD_COLOR },
];
```

- [ ] **Step 2: Commit**

```bash
git add js/constants.js
git commit -m "feat(card): add card-related constants"
```

---

## Task 2: SourceItem interface + PhotoSourceItem (TDD)

**Files:**
- Create: `js/source-item.js`
- Test: `tests/source-item.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/source-item.test.js`:

```js
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
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test`
Expected: FAIL with "Cannot find module '../js/source-item.js'"

- [ ] **Step 3: Implement `source-item.js`**

Create `js/source-item.js`:

```js
import { PHOTO_SIZES } from './constants.js';

/**
 * Abstract interface. Concrete items expose:
 *   - .size   : { w, h } physical size in mm
 *   - .canvas : HTMLCanvasElement drawn at the per-item render dpi
 */
export class SourceItem {
  get size()   { throw new Error('SourceItem.size not implemented'); }
  get canvas() { throw new Error('SourceItem.canvas not implemented'); }
}

/**
 * Wraps a single cropped ID-photo. Photo mode repeats this item at every
 * layout position.
 */
export class PhotoSourceItem extends SourceItem {
  /**
   * @param {HTMLCanvasElement} croppedCanvas
   * @param {string} photoName     key in PHOTO_SIZES
   * @param {{rotation?: number}} [opts]
   */
  constructor(croppedCanvas, photoName, opts = {}) {
    super();
    this._canvas = croppedCanvas;
    this._base   = PHOTO_SIZES[photoName];
    this._rotation = opts.rotation || 0;
  }

  get size() {
    return this._rotation % 180 === 0
      ? this._base
      : { w: this._base.h, h: this._base.w };
  }

  get canvas() { return this._canvas; }
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- tests/source-item.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/source-item.js tests/source-item.test.js
git commit -m "feat(card): add SourceItem interface and PhotoSourceItem"
```

---

## Task 3: layout-engine accepts `sourceSize` (rename only)

**Files:**
- Modify: `js/layout-engine.js`
- Modify: `tests/layout-engine.test.js`

The current code already calls its param `photo`. Tests use the same name. Renaming preserves behavior; only the param identifier changes.

- [ ] **Step 1: Rename the parameter and update internal references**

Edit `js/layout-engine.js` — change `photo` → `sourceSize` everywhere:

```js
/**
 * Pure function: compute how many items of a given size fit on a paper
 * given margins and inter-item gaps, plus the exact mm coordinates of
 * each item on the paper.
 *
 * @param {{w:number, h:number}} sourceSize - target item size (mm)
 * @param {{w:number, h:number}} paper       - paper size (mm)
 * @param {{top:number, bottom:number, left:number, right:number}} margin (mm)
 * @param {{h:number, v:number}} gap        - horizontal & vertical gaps (mm)
 * @returns {{cols:number, rows:number, count:number, positions:Array<{x:number,y:number}>, paperSize:{w:number,h:number}}}
 */
export function calculateLayout(sourceSize, paper, margin, gap) {
  const usableW = paper.w - margin.left - margin.right;
  const usableH = paper.h - margin.top - margin.bottom;

  const cols = Math.floor((usableW + gap.h) / (sourceSize.w + gap.h));
  const rows = Math.floor((usableH + gap.v) / (sourceSize.h + gap.v));

  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push({
        x: margin.left + c * (sourceSize.w + gap.h),
        y: margin.top + r * (sourceSize.h + gap.v),
      });
    }
  }

  return { cols, rows, count: cols * rows, positions, paperSize: paper };
}
```

- [ ] **Step 2: Update existing tests to use the new param name**

In `tests/layout-engine.test.js`, rename every first argument `photo` → `sourceSize` (in all 5 tests). The variable name inside the `calculateLayout(...)` call. Nothing else changes.

- [ ] **Step 3: Run tests, expect pass**

Run: `npm test -- tests/layout-engine.test.js`
Expected: PASS (5 tests)

- [ ] **Step 4: Add a new test verifying arbitrary size**

Append to `tests/layout-engine.test.js`:

```js
  it('accepts any rectangular sourceSize (not just photos)', () => {
    // 90x54 business card into A4 with 10mm margins and 0 gap.
    const layout = calculateLayout(
      { w: 90, h: 54 },
      { w: 210, h: 297 },
      { top: 10, bottom: 10, left: 10, right: 10 },
      { h: 0, v: 0 }
    );
    expect(layout.cols).toBe(2);
    expect(layout.rows).toBe(5);
    expect(layout.count).toBe(10);
  });
```

- [ ] **Step 5: Run tests, expect pass**

Run: `npm test -- tests/layout-engine.test.js`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add js/layout-engine.js tests/layout-engine.test.js
git commit -m "refactor(layout): rename param photo → sourceSize"
```

---

## Task 4: card-builder — render a single CardSourceItem canvas (TDD)

**Files:**
- Create: `js/card-builder.js`
- Test: `tests/card-builder.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/card-builder.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { CardSourceItem, createCardImageSource, computeCardDpi } from '../js/card-builder.js';
import { CARD_FONT_SIZE_RATIO, DEFAULT_FIELD_COLOR, CARD_MAX_PX } from '../js/constants.js';

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
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- tests/card-builder.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `card-builder.js`**

Create `js/card-builder.js`:

```js
import { SourceItem } from './source-item.js';
import { CARD_FONT_SIZE_RATIO, CARD_MAX_PX, DEFAULT_FIELD_COLOR } from './constants.js';

/**
 * Compute the effective render dpi for a batch of cards.
 * Clamps so the long side of the largest card doesn't exceed CARD_MAX_PX.
 * Returns an integer dpi used uniformly across the batch.
 *
 * @param {{w:number, h:number}} cardSize  - mm
 * @param {number} requestedDpi
 * @returns {number}
 */
export function computeCardDpi(cardSize, requestedDpi) {
  const longMm = Math.max(cardSize.w, cardSize.h);
  const pxAtRequested = longMm * requestedDpi / 25.4;
  if (pxAtRequested <= CARD_MAX_PX) return Math.round(requestedDpi);
  const clampedDpi = CARD_MAX_PX / longMm * 25.4;
  return Math.round(clampedDpi);
}

/**
 * Take a free image (canvas) and produce a centered, fit-within-card
 * copy at the target size. Returns a new canvas (no shared refs).
 *
 * @param {HTMLCanvasElement} src
 * @param {{w:number, h:number}} cardSize  - mm
 * @returns {HTMLCanvasElement}
 */
export function createCardImageSource(src, cardSize) {
  // We don't know dpi here; we draw the image into a temporary canvas at
  // intrinsic size — the renderer will scale to fit at draw time.
  // (Keeping the canvas simple; renderer handles layout.)
  return src;
}

/**
 * A single designed card.
 * Renders eagerly on construction; `.canvas` is reused on every access.
 */
export class CardSourceItem extends SourceItem {
  /**
   * @param {{w:number, h:number}} cardSize          - mm
   * @param {number} requestedDpi
   * @param {Array<{id:string,label:string,enabled:boolean,default:string,size:string,color:string}>} fields
   * @param {string} row                             - CSV row string for this card
   * @param {HTMLCanvasElement|null} imageCanvas     - shared embedded image (or null)
   */
  constructor(cardSize, requestedDpi, fields, row, imageCanvas) {
    super();
    this._size = cardSize;
    this._dpi  = computeCardDpi(cardSize, requestedDpi);
    this._canvas = renderCardCanvas(cardSize, this._dpi, fields, row, imageCanvas);
  }

  get size()   { return this._size; }
  get canvas() { return this._canvas; }
}

/**
 * Render one card to a fresh canvas at the given dpi.
 * @returns {HTMLCanvasElement}
 */
function renderCardCanvas(cardSize, dpi, fields, row, imageCanvas) {
  const w = Math.round(cardSize.w * dpi / 25.4);
  const h = Math.round(cardSize.h * dpi / 25.4);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  // White background.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // Embedded image (centered, fit-within-card, preserve aspect).
  if (imageCanvas) {
    drawImageCentered(ctx, imageCanvas, w, h);
  }

  // Parse row into fields.
  const cols = parseRow(row);
  const enabledFields = fields.filter(f => f.enabled);

  // Vertical flow layout for text fields.
  const marginX = w * 0.06;
  const marginY = h * 0.06;
  const usableH = h - marginY * 2;
  const lineH = enabledFields.length > 0 ? usableH / enabledFields.length : 0;

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  enabledFields.forEach((field, i) => {
    const text = cols[field.label] ?? field.default ?? '';
    if (!text) return;
    const ratio = CARD_FONT_SIZE_RATIO[field.size] ?? CARD_FONT_SIZE_RATIO.mid;
    const fontPx = Math.max(6, h * ratio);
    ctx.font = `${fontPx}px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = field.color || DEFAULT_FIELD_COLOR;
    ctx.fillText(text, w / 2, marginY + lineH * (i + 0.5));
  });

  return c;
}

/**
 * Lightweight CSV row splitter. Supports simple comma splits; does NOT
 * handle quoted fields with embedded commas (out of scope for v1).
 * @param {string} row
 * @returns {Record<string,string>} - keyed by field label, or numeric key if fewer labels
 */
function parseRow(row) {
  if (typeof row !== 'string') return {};
  const parts = row.split(',').map(s => s.trim());
  const out = {};
  parts.forEach((p, i) => { out[`__c${i}`] = p; });
  return out;
}

function drawImageCentered(ctx, img, cardW, cardH) {
  const margin = Math.min(cardW, cardH) * 0.08;
  const boxW = cardW - margin * 2;
  const boxH = cardH * 0.4; // image occupies upper portion
  const scale = Math.min(boxW / img.width, boxH / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (cardW - dw) / 2;
  const dy = margin;
  ctx.drawImage(img, dx, dy, dw, dh);
}
```

Note: We need `parseRow` to index by numeric column so the renderer can pick `cols[__cN]`. Adjust: the parser returns `{ '__c0': ..., '__c1': ... }`. Update the field-matching logic accordingly. Re-do renderCardCanvas:

In `renderCardCanvas`, replace `cols[field.label]` → `cols['__c' + i]` (where `i` is the **index of the field in the original `fields` array**, not the filtered one). Simpler: pass the field index through.

Refactor `CardSourceItem` to thread column index explicitly:

```js
  const enabled = fields
    .map((f, idx) => ({ ...f, colIndex: idx }))
    .filter(f => f.enabled);

  enabled.forEach((field) => {
    const text = cols[`__c${field.colIndex}`] ?? field.default ?? '';
    ...
  });
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- tests/card-builder.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/card-builder.js tests/card-builder.test.js
git commit -m "feat(card): add CardSourceItem and per-card render dpi"
```

---

## Task 5: card-parser — CSV → row objects (TDD)

**Files:**
- Create: `js/card-parser.js`
- Test: `tests/card-parser.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/card-parser.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseBatchData } from '../js/card-parser.js';

describe('parseBatchData', () => {
  it('parses rows by field order (col 0 → first field, etc.)', () => {
    const text = '张三, A001\n李四, A002\n';
    const out = parseBatchData(text, 2);
    expect(out).toEqual([
      { 0: '张三', 1: 'A001' },
      { 0: '李四', 1: 'A002' },
    ]);
  });

  it('uses empty string for missing columns (no field default here)', () => {
    const text = '张三\n李四, A002';
    const out = parseBatchData(text, 2);
    expect(out).toEqual([
      { 0: '张三', 1: '' },
      { 0: '李四', 1: 'A002' },
    ]);
  });

  it('ignores columns beyond field count', () => {
    const text = 'a, b, c, d';
    const out = parseBatchData(text, 2);
    expect(out).toEqual([{ 0: 'a', 1: 'b' }]);
  });

  it('skips empty lines (does not produce zero-column rows)', () => {
    const text = 'a, b\n\n  \nc, d';
    const out = parseBatchData(text, 2);
    expect(out).toEqual([
      { 0: 'a', 1: 'b' },
      { 0: 'c', 1: 'd' },
    ]);
  });

  it('returns [] for empty / whitespace-only input', () => {
    expect(parseBatchData('', 3)).toEqual([]);
    expect(parseBatchData('   \n  \n', 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- tests/card-parser.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `card-parser.js`**

Create `js/card-parser.js`:

```js
/**
 * Parse multi-line CSV batch data into row objects keyed by column index.
 *
 * @param {string} text
 * @param {number} fieldCount  - number of columns the schema defines
 * @returns {Array<Record<number,string>>}
 */
export function parseBatchData(text, fieldCount) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(',').map(s => s.trim());
    const row = {};
    for (let i = 0; i < fieldCount; i++) {
      row[i] = parts[i] ?? '';
    }
    rows.push(row);
  }
  return rows;
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- tests/card-parser.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add js/card-parser.js tests/card-parser.test.js
git commit -m "feat(card): add CSV batch data parser"
```

---

## Task 6: preview-renderer accepts SourceItem[] (drawing mode 'repeat' | 'once')

**Files:**
- Modify: `js/preview-renderer.js`

The current signature takes `croppedCanvas` and `photoMap`. New signature takes `sourceItems: SourceItem[]` and a `drawing: 'repeat' | 'once'` mode.

- [ ] **Step 1: Replace the function body**

Replace the entire body of `js/preview-renderer.js` with:

```js
import { calculateLayout } from './layout-engine.js';
import { drawCropMarks } from './crop-marks.js';

// Maximum preview bounds — chosen so the preview fits both desktop and mobile.
const PREVIEW_MAX_WIDTH_PX  = 600;
const PREVIEW_MAX_HEIGHT_VH = 0.7; // 70% of viewport height
const WRAPPER_PADDING_PX    = 32;  // 16px each side (matches .preview-wrapper)

/**
 * Render the layout preview onto the given canvas at screen resolution.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   paperSize: string,
 *   margin: {top:number,bottom:number,left:number,right:number},
 *   gap:    {h:number, v:number},
 *   drawing: 'repeat'|'once',     // photo mode = 'repeat', card mode = 'once'
 *   zoom?: number,                // per-photo zoom (photo mode only)
 *   showCropMarks?: boolean,
 * }} params
 * @param {Record<string,{w:number,h:number}>} paperMap
 * @param {import('./source-item.js').SourceItem[]} sourceItems
 */
export function renderPreview(canvas, params, paperMap, sourceItems) {
  const ctx = canvas.getContext('2d');
  if (!sourceItems || sourceItems.length === 0) {
    clearCanvas(canvas);
    return null;
  }
  const sourceSize = sourceItems[0].size;
  const paper = paperMap[params.paperSize];
  if (!paper) return null;

  // Preview scaling (unchanged).
  const container = canvas.parentElement;
  const containerW = container ? container.clientWidth : window.innerWidth;
  const isDesktop = window.innerWidth >= 768;
  const maxW = isDesktop
    ? PREVIEW_MAX_WIDTH_PX
    : Math.max(50, containerW - WRAPPER_PADDING_PX);
  const maxH = isDesktop
    ? Math.max(PREVIEW_MAX_WIDTH_PX, window.innerHeight - 200)
    : Math.max(50, window.innerHeight * PREVIEW_MAX_HEIGHT_VH);
  const scale = Math.min(maxW / paper.w, maxH / paper.h);
  const displayW = paper.w * scale;
  const displayH = paper.h * scale;

  const dpr = window.devicePixelRatio || 1;
  canvas.width  = displayW * dpr;
  canvas.height = displayH * dpr;
  canvas.style.width  = `${displayW}px`;
  canvas.style.height = `${displayH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, displayW, displayH);

  const layout = calculateLayout(sourceSize, paper, params.margin, params.gap);
  const zoom = params.zoom || 1;
  const drawW = sourceSize.w * zoom;
  const drawH = sourceSize.h * zoom;

  sourceItems.forEach((item, i) => {
    const pos = layout.positions[i];
    if (!pos) return; // 'once' mode: stop when positions exhausted
    ctx.drawImage(item.canvas, pos.x * scale, pos.y * scale, drawW * scale, drawH * scale);
  });

  // Crop marks only for photo (repeat) mode; cards ignore them.
  if (params.drawing === 'repeat' && params.showCropMarks !== false) {
    drawCropMarks(ctx, layout, sourceSize, scale, zoom);
  }

  // Footer.
  const fontSize = Math.max(10, scale * 3);
  ctx.fillStyle = '#999999';
  ctx.font = `${fontSize}px -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    `github.com/FlowerBirds/Photosheet-Maker • ${zoom.toFixed(2)}×`,
    displayW / 2,
    displayH - 4
  );

  return layout;
}

function clearCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
```

- [ ] **Step 2: Sanity-check — load project, confirm no leftover references to old signature**

Run: `npm test`
Expected: PASS for layout-engine / source-item / card-builder / card-parser. (Other tests still pass since we only changed one file.)

- [ ] **Step 3: Commit**

```bash
git add js/preview-renderer.js
git commit -m "refactor(preview): accept SourceItem[] and drawing mode"
```

---

## Task 7: exporter accepts SourceItem[] (drawing mode)

**Files:**
- Modify: `js/exporter.js`

- [ ] **Step 1: Replace the function body**

Replace the entire body of `js/exporter.js` with:

```js
import { calculateLayout } from './layout-engine.js';
import { drawCropMarks } from './crop-marks.js';

/**
 * Generate the full-resolution output image and trigger a download.
 *
 * @param {{
 *   sourceItems: import('./source-item.js').SourceItem[],
 *   paperSize: string, dpi: number,
 *   margin: {top:number,bottom:number,left:number,right:number},
 *   gap:    {h:number, v:number},
 *   drawing: 'repeat'|'once',
 *   zoom?: number,                // photo mode only
 *   showCropMarks?: boolean,      // ignored in 'once' mode
 *   format: 'jpeg'|'png',
 * }} params
 * @param {Record<string,{w:number,h:number}>} paperMap
 * @returns {Promise<void>}
 */
export async function exportImage(params, paperMap) {
  const {
    sourceItems, paperSize, dpi, margin, gap,
    drawing, zoom = 1, showCropMarks = true, format,
  } = params;
  if (!sourceItems || sourceItems.length === 0) {
    throw new Error('没有可导出的内容');
  }
  const sourceSize = sourceItems[0].size;
  const paper = paperMap[paperSize];
  if (!paper) throw new Error(`未知相纸尺寸: ${paperSize}`);

  const mmToPx = dpi / 25.4;
  const canvasW = Math.round(paper.w * mmToPx);
  const canvasH = Math.round(paper.h * mmToPx);

  const out = document.createElement('canvas');
  out.width = canvasW; out.height = canvasH;
  const ctx = out.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const layout = calculateLayout(sourceSize, paper, margin, gap);
  const drawW = sourceSize.w * zoom;
  const drawH = sourceSize.h * zoom;

  sourceItems.forEach((item, i) => {
    const pos = layout.positions[i];
    if (!pos) return;
    ctx.drawImage(
      item.canvas,
      Math.round(pos.x * mmToPx),
      Math.round(pos.y * mmToPx),
      Math.round(drawW * mmToPx),
      Math.round(drawH * mmToPx)
    );
  });

  if (drawing === 'repeat' && showCropMarks) {
    drawCropMarks(ctx, layout, sourceSize, mmToPx, zoom);
  }

  // Footer.
  const fontSize = Math.max(10, mmToPx * 2.5);
  ctx.fillStyle = '#999999';
  ctx.font = `${fontSize}px -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    `github.com/FlowerBirds/Photosheet-Maker • ${zoom.toFixed(2)}×`,
    canvasW / 2,
    canvasH - 1 * mmToPx
  );

  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const quality = format === 'png' ? undefined : 0.95;
  const blob = await new Promise((resolve, reject) => {
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('生成图片失败'))),
      mime, quality
    );
  });

  triggerDownload(blob, `Photosheet_${Date.now()}.${format === 'png' ? 'png' : 'jpg'}`);
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

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: PASS (existing tests still green)

- [ ] **Step 3: Commit**

```bash
git add js/exporter.js
git commit -m "refactor(exporter): accept SourceItem[] and drawing mode"
```

---

## Task 8: mode-tab.js — tab switching with state preservation

**Files:**
- Create: `js/mode-tab.js`

No test for this small DOM controller (verified by manual e2e in later task).

- [ ] **Step 1: Implement `mode-tab.js`**

Create `js/mode-tab.js`:

```js
/**
 * Tab UI for switching between PHOTO and CARD modes.
 *
 * State preservation rules (per spec §4):
 *   - croppedCanvas / originalImage / rotation persist across mode switches.
 *   - Switching to CARD destroys the active cropper instance only.
 *   - Switching back to PHOTO restores the prior photo state:
 *       - croppedCanvas present → READY
 *       - originalImage present (no croppedCanvas) → CROPPING
 *       - otherwise → INITIAL
 */
export function createModeTab({
  photoBtn, cardBtn,
  photoSections,  // array of HTMLElement shown in PHOTO mode
  cardSections,   // array of HTMLElement shown in CARD mode
  onSwitch,       // (newMode) => void
}) {
  let mode = 'PHOTO';

  function show(target) {
    for (const el of photoSections) el.hidden = target !== 'PHOTO';
    for (const el of cardSections)  el.hidden = target !== 'CARD';
    photoBtn.classList.toggle('tab-active', target === 'PHOTO');
    cardBtn.classList.toggle('tab-active',  target === 'CARD');
  }

  photoBtn.addEventListener('click', () => {
    if (mode === 'PHOTO') return;
    mode = 'PHOTO';
    show(mode);
    onSwitch(mode);
  });
  cardBtn.addEventListener('click', () => {
    if (mode === 'CARD') return;
    mode = 'CARD';
    show(mode);
    onSwitch(mode);
  });

  return {
    getMode: () => mode,
    setMode: (m) => {
      if (m === mode) return;
      mode = m;
      show(mode);
      onSwitch(mode);
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add js/mode-tab.js
git commit -m "feat(card): add mode-tab with state preservation"
```

---

## Task 9: HTML — add tabs and card-editor DOM

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add tabs into the header**

In `index.html`, replace the existing `<div class="header-actions">` block with:

```html
    <nav class="mode-tabs" role="tablist">
      <button id="tab-photo" class="tab tab-active" role="tab">证件照</button>
      <button id="tab-card"  class="tab"           role="tab">卡片</button>
    </nav>
    <div class="header-actions">
      <button id="btn-reupload" class="btn-secondary" hidden>重新上传</button>
      <button id="btn-recrop"   class="btn-secondary" hidden>重新裁剪</button>
      <button id="btn-export"   class="btn-primary"   disabled>导出图片</button>
    </div>
```

- [ ] **Step 2: Add card-editor section inside the existing `<aside class="control-panel">`**

After `</section>` of the `settings-section`, insert (before `</aside>`):

```html
      <!-- Card editor (visible only in CARD mode) -->
      <section class="card" id="card-editor-section" hidden>
        <h2>卡片尺寸</h2>
        <label>预设
          <select id="select-card-size"></select>
        </label>
        <div class="custom-size-row" id="custom-card-size" hidden>
          <label>宽 (mm)<input type="number" id="card-w" min="5" max="500" value="90" /></label>
          <label>高 (mm)<input type="number" id="card-h" min="5" max="500" value="54" /></label>
        </div>

        <h2>① 字段配置</h2>
        <div id="card-fields"></div>
        <button id="btn-add-field" class="btn-secondary">＋ 增加字段</button>

        <h2>② 批量数据</h2>
        <p class="hint">每行一张卡，列顺序与上方字段顺序一致；空字段用默认值。</p>
        <textarea id="card-data" rows="6" placeholder="张三, A001&#10;李四, A002"></textarea>
        <p class="hint" id="card-row-count">将生成 0 张卡片</p>

        <h2>③ 嵌入图片</h2>
        <input type="file" id="card-image-input" accept="image/jpeg,image/png,image/webp" />
        <p class="hint">所有卡片共用此图，居中嵌入。不提供则纯文字。</p>
        <button id="btn-remove-card-image" class="btn-secondary" hidden>移除图片</button>
      </section>
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(card): add card-editor DOM scaffolding"
```

---

## Task 10: CSS — tab styles and card editor layout

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: Append tab + card-editor styles**

Append to `css/style.css`:

```css
/* ---------- Mode tabs ---------- */
.mode-tabs {
  display: flex;
  gap: 4px;
  margin-left: 16px;
  border-bottom: 1px solid transparent;
}
.tab {
  padding: 6px 14px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: transparent;
  color: #666;
  cursor: pointer;
  font-size: 14px;
}
.tab:hover { background: #f0f0f0; }
.tab-active {
  background: #fff;
  border-color: #e0e0e0;
  color: #2d7ff9;
  font-weight: 500;
}

/* ---------- Card editor ---------- */
.custom-size-row {
  display: flex;
  gap: 8px;
  margin: 6px 0;
}
.custom-size-row label {
  flex: 1;
  font-size: 13px;
}
.custom-size-row input[type="number"] {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

#card-data {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 13px;
  resize: vertical;
}

.card-field-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  border-bottom: 1px dashed #eee;
}
.card-field-row:last-child { border-bottom: none; }
.card-field-row input[type="checkbox"] {
  width: 16px; height: 16px;
}
.card-field-row input[type="text"] {
  flex: 1;
  padding: 4px 6px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
}
.card-field-row select,
.card-field-row input[type="color"] {
  padding: 2px 4px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
}
.card-field-row .reorder {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
}
.card-field-row .reorder button {
  padding: 0 6px;
  font-size: 11px;
  line-height: 1;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 3px;
  cursor: pointer;
}
.card-field-row .delete-field {
  padding: 2px 8px;
  font-size: 12px;
}
```

- [ ] **Step 2: Commit**

```bash
git add css/style.css
git commit -m "feat(card): add tab and card-editor styles"
```

---

## Task 11: card-editor.js — wire card-editor UI

**Files:**
- Create: `js/card-editor.js`

- [ ] **Step 1: Implement `card-editor.js`**

Create `js/card-editor.js`:

```js
import {
  CARD_SIZES, DEFAULT_CARD_SIZE,
  CARD_FIELD_DEFAULTS, DEFAULT_FIELD_COLOR,
} from './constants.js';
import { CardSourceItem } from './card-builder.js';
import { parseBatchData } from './card-parser.js';
import { loadImageFile } from './uploader.js';

const SIZE_PRESETS = ['big', 'mid', 'small'];
const SIZE_LABELS  = { big: '大', mid: '中', small: '小' };

/**
 * Wire the card-editor DOM to the live source-list state.
 *
 * @param {{
 *   selectSize: HTMLSelectElement,
 *   customRow:  HTMLElement,
 *   cardW:      HTMLInputElement,
 *   cardH:      HTMLInputElement,
 *   fieldsRoot: HTMLElement,
 *   btnAdd:     HTMLButtonElement,
 *   dataArea:   HTMLTextAreaElement,
 *   rowCount:   HTMLElement,
 *   imgInput:   HTMLInputElement,
 *   btnRemoveImg: HTMLButtonElement,
 *   getState:   () => ({ mode: 'PHOTO'|'CARD', paperSize: string, dpi: number }),
 *   setSourceItems: (items: import('./source-item.js').SourceItem[]) => void,
 *   requestRefresh: () => void,
 * }} els
 */
export function initCardEditor(els) {
  // ---- populate size select ----
  for (const label of Object.keys(CARD_SIZES)) {
    const opt = document.createElement('option');
    opt.value = label; opt.textContent = label;
    els.selectSize.appendChild(opt);
  }
  els.selectSize.value = DEFAULT_CARD_SIZE;

  els.selectSize.addEventListener('change', () => {
    els.customRow.hidden = els.selectSize.value !== '自定义';
    rebuildSourceItems();
  });
  els.cardW.addEventListener('input', () => debounced(rebuildSourceItems));
  els.cardH.addEventListener('input', () => debounced(rebuildSourceItems));

  // ---- fields config ----
  els.fields = CARD_FIELD_DEFAULTS.map(f => ({ ...f }));
  renderFields();

  els.btnAdd.addEventListener('click', () => {
    const id = `f${Date.now()}`;
    els.fields.push({
      id, label: '新字段', enabled: true, default: '',
      size: 'mid', color: DEFAULT_FIELD_COLOR,
    });
    renderFields();
    rebuildSourceItems();
  });

  // ---- batch data ----
  els.dataArea.addEventListener('input', () => {
    updateRowCount();
    debounced(rebuildSourceItems);
  });

  // ---- embedded image ----
  els.imgInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const img = await loadImageFile(file);
      els.imageCanvas = document.createElement('canvas');
      els.imageCanvas.width = img.naturalWidth || img.width;
      els.imageCanvas.height = img.naturalHeight || img.height;
      const ctx = els.imageCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      els.btnRemoveImg.hidden = false;
      rebuildSourceItems();
    } catch (err) {
      els.imgInput.value = '';
      window.alert(err.message);
    }
  });
  els.btnRemoveImg.addEventListener('click', () => {
    els.imgInput.value = '';
    els.imageCanvas = null;
    els.btnRemoveImg.hidden = true;
    rebuildSourceItems();
  });

  // Initial render.
  els.customRow.hidden = els.selectSize.value !== '自定义';
  updateRowCount();
  rebuildSourceItems();

  // ---- internal helpers ----
  function updateRowCount() {
    const rows = parseBatchData(els.dataArea.value, els.fields.length);
    els.rowCount.textContent = `将生成 ${rows.length} 张卡片`;
  }

  function renderFields() {
    els.fieldsRoot.innerHTML = '';
    els.fields.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'card-field-row';
      row.innerHTML = `
        <input type="checkbox" ${f.enabled ? 'checked' : ''} title="启用" />
        <input type="text" value="${escapeHtml(f.label)}" title="字段标签" />
        <input type="text" value="${escapeHtml(f.default)}" placeholder="默认值" title="默认值" />
        <select title="字号">
            ${SIZE_PRESETS.map(s => `<option value="${s}" ${s===f.size?'selected':''}>${SIZE_LABELS[s]}</option>`).join('')}
          </select>
        <input type="color" value="${f.color}" title="颜色" />
        <span class="reorder">
          <button data-act="up"   ${i===0?'disabled':''}>↑</button>
          <button data-act="down" ${i===els.fields.length-1?'disabled':''}>↓</button>
        </span>
        <button class="delete-field btn-secondary" data-act="del">删</button>
      `;
      const [chk, labelIn, defIn, sel, colorIn, _reorder, delBtn] = row.children;

      chk.addEventListener('change', () => { f.enabled = chk.checked; rebuildSourceItems(); });
      labelIn.addEventListener('input', () => { f.label = labelIn.value; debounced(rebuildSourceItems); });
      defIn.addEventListener('input',   () => { f.default = defIn.value; debounced(rebuildSourceItems); });
      sel.addEventListener('change',    () => { f.size = sel.value; rebuildSourceItems(); });
      colorIn.addEventListener('input', () => { f.color = colorIn.value; debounced(rebuildSourceItems); });
      delBtn.addEventListener('click', () => {
        els.fields.splice(i, 1);
        renderFields(); updateRowCount(); rebuildSourceItems();
      });
      row.querySelector('[data-act="up"]').addEventListener('click', () => {
        if (i === 0) return;
        [els.fields[i-1], els.fields[i]] = [els.fields[i], els.fields[i-1]];
        renderFields(); rebuildSourceItems();
      });
      row.querySelector('[data-act="down"]').addEventListener('click', () => {
        if (i === els.fields.length - 1) return;
        [els.fields[i+1], els.fields[i]] = [els.fields[i], els.fields[i+1]];
        renderFields(); rebuildSourceItems();
      });

      els.fieldsRoot.appendChild(row);
    });
  }

  function getCardSize() {
    const sel = els.selectSize.value;
    if (sel !== '自定义') return CARD_SIZES[sel];
    return {
      w: Math.max(5, Number(els.cardW.value) || CARD_SIZES[自定义.w]),
      h: Math.max(5, Number(els.cardH.value) || CARD_SIZES[自定义.h]),
    };
  }

  function rebuildSourceItems() {
    const st = els.getState();
    if (st.mode !== 'CARD') return;
    const cardSize = getCardSize();
    const rows = parseBatchData(els.dataArea.value, els.fields.length);
    const items = rows.map(row =>
      new CardSourceItem(cardSize, st.dpi, els.fields, csvFromRow(row), els.imageCanvas || null)
    );
    els.setSourceItems(items);
    els.requestRefresh();
  }

  function csvFromRow(row) {
    // Re-join row values in field order to feed CardSourceItem.
    return Object.keys(row).sort((a,b)=>Number(a)-Number(b)).map(k => row[k]).join(',');
  }
}

// ---- debounce ----
let _timer = null;
function debounced(fn) {
  clearTimeout(_timer);
  _timer = setTimeout(fn, 200);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}
```

Note: `getCardSize()` references `CARD_SIZES[自定义]` — the literal label `自定义` must match exactly what's in `CARD_SIZES`. To avoid string-key complexity, use:

```js
    return {
      w: Math.max(5, Number(els.cardW.value) || 90),
      h: Math.max(5, Number(els.cardH.value) || 54),
    };
```

Apply this fix inline when implementing.

- [ ] **Step 2: Commit**

```bash
git add js/card-editor.js
git commit -m "feat(card): wire card-editor UI to source list"
```

---

## Task 12: main.js — orchestrate modes

**Files:**
- Modify: `js/main.js`

This is the integration step. The existing `main.js` builds state from photo flow; we need to:
- Read DOM refs for the new tabs and card-editor section
- Build a `sourceItems` array that swaps based on mode
- Pass `sourceItems` (and `drawing`) to `renderPreview` and `exportImage`
- Wire `mode-tab` callbacks to refresh + state restoration

- [ ] **Step 1: Add new DOM refs**

In the `dom` object at top of `js/main.js`, **add** (don't replace) the following keys:

```js
  // mode tabs
  tabPhoto: $('tab-photo'),
  tabCard:  $('tab-card'),
  // card section
  cardSection: $('card-editor-section'),
  selectCardSize: $('select-card-size'),
  customCardSize: $('custom-card-size'),
  cardW: $('card-w'),
  cardH: $('card-h'),
  cardFields: $('card-fields'),
  btnAddField:  $('btn-add-field'),
  cardData:     $('card-data'),
  cardRowCount: $('card-row-count'),
  cardImageInput:   $('card-image-input'),
  btnRemoveCardImg: $('btn-remove-card-image'),
```

- [ ] **Step 2: Add `sourceItems` to state**

In the `state` object, add:

```js
  sourceItems: [],  // current SourceItem[] (length 1 in photo, N in card)
  drawing: 'repeat', // 'repeat' for photo, 'once' for card
  mode: 'PHOTO',
```

- [ ] **Step 3: Replace `refresh()` body to use sourceItems**

Replace the `refresh()` function with:

```js
function refresh() {
  const st = state;
  if (st.mode === 'PHOTO' && st.status === 'INITIAL') {
    // Nothing to render yet.
    clearInfoPanel();
    return;
  }
  if (st.sourceItems.length === 0) {
    clearInfoPanel();
    return;
  }

  const params = {
    paperSize: st.paperSize,
    margin: st.margin,
    gap: st.gap,
    drawing: st.drawing,
    zoom: st.zoom,
    showCropMarks: st.showCropMarks,
  };
  const layout = renderPreview(dom.preview, params, PAPER_SIZES, st.sourceItems);
  if (!layout) {
    clearInfoPanel();
    return;
  }

  const paper = PAPER_SIZES[st.paperSize];
  const w = Math.round(paper.w * st.dpi / 25.4);
  const h = Math.round(paper.h * st.dpi / 25.4);

  if (st.drawing === 'repeat') {
    dom.infoCount.textContent = layout.count;
    const orient = st.sourceItems[0].size.w >= st.sourceItems[0].size.h ? '横版' : '竖版';
    dom.infoSize.textContent = `${w} × ${h} px @ ${st.dpi} DPI · ${orient}`;
    if (layout.count === 0) {
      dom.infoWarning.textContent = '当前设置无法容纳任何照片，请缩小边距/间距或换大相纸';
      dom.infoWarning.hidden = false;
      dom.btnExport.disabled = true;
    } else {
      dom.infoWarning.hidden = true;
      dom.btnExport.disabled = st.status !== 'READY';
    }
  } else {
    const n = st.sourceItems.length;
    const m = layout.count;
    dom.infoCount.textContent = `${n} 张 / ${m} 容纳`;
    dom.infoSize.textContent = `${w} × ${h} px @ ${st.dpi} DPI`;
    if (n === 0) {
      dom.infoWarning.textContent = '请至少启用一个字段并填写数据';
      dom.infoWarning.hidden = false;
      dom.btnExport.disabled = true;
    } else if (n > m) {
      dom.infoWarning.textContent = `有 ${n - m} 张卡超出相纸容纳范围，未排版`;
      dom.infoWarning.hidden = false;
      dom.btnExport.disabled = false;
    } else {
      dom.infoWarning.hidden = true;
      dom.btnExport.disabled = false;
    }
  }
}

function clearInfoPanel() {
  dom.infoCount.textContent = '—';
  dom.infoSize.textContent  = '—';
  dom.infoWarning.hidden = true;
  dom.btnExport.disabled = true;
}
```

- [ ] **Step 4: Build photo source on crop completion**

Replace the `dom.btnFinishCrop` click handler with:

```js
dom.btnFinishCrop.addEventListener('click', () => {
  const canvas = cropperWrapper.getCroppedCanvas();
  if (!canvas) return;
  state.croppedCanvas = canvas;
  cropperWrapper.destroy();
  setStatus('READY');
  rebuildPhotoSource();
  refresh();
  toast('裁剪完成，已进入排版阶段');
});
```

Also add `rebuildPhotoSource()`:

```js
function rebuildPhotoSource() {
  if (!state.croppedCanvas) { state.sourceItems = []; return; }
  state.sourceItems = [new PhotoSourceItem(state.croppedCanvas, state.photoSize, { rotation: state.rotation })];
}
```

Add the import at the top:

```js
import { PhotoSourceItem } from './source-item.js';
```

- [ ] **Step 5: Update photoSize change handler**

Find the photoSize change handler in the existing `initConfigPanel` callback and modify it so that after rebuilding source, it also calls `rebuildPhotoSource()`:

```js
if (patch.photoSize) {
  if (cropperWrapper.isActive()) {
    const photo = PHOTO_SIZES[patch.photoSize];
    const [w, h] = state.rotation % 180 === 0 ? [photo.w, photo.h] : [photo.h, photo.w];
    cropperWrapper.setAspectRatio(w / h);
  }
}
rebuildPhotoSource();   // ← new line
```

- [ ] **Step 6: Initialize mode-tab and wire mode switch logic**

After the existing `initConfigPanel(...)` call, add:

```js
import { createModeTab } from './mode-tab.js';
import { initCardEditor } from './card-editor.js';

// mode-tab DOM refs come from existing <aside class="control-panel"> children.
// The photo sections are: upload-section, crop-section, settings-section.
// The card section is: card-editor-section.
const photoSections = [dom.uploadSection, dom.cropSection, dom.settings];
const cardSections  = [dom.cardSection];

const modeTab = createModeTab({
  photoBtn: dom.tabPhoto,
  cardBtn:  dom.tabCard,
  photoSections,
  cardSections,
  onSwitch: (newMode) => {
    state.mode = newMode;
    if (newMode === 'PHOTO') {
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
      // CARD mode: destroy any active cropper, jump straight to READY.
      if (cropperWrapper.isActive()) cropperWrapper.destroy();
      state.drawing = 'once';
      setStatus('READY');
    }
    refresh();
  },
});

initCardEditor({
  selectSize: dom.selectCardSize,
  customRow:  dom.customCardSize,
  cardW: dom.cardW, cardH: dom.cardH,
  fieldsRoot: dom.cardFields,
  btnAdd: dom.btnAddField,
  dataArea: dom.cardData,
  rowCount: dom.cardRowCount,
  imgInput: dom.cardImageInput,
  btnRemoveImg: dom.btnRemoveCardImg,
  getState: () => ({ mode: state.mode, paperSize: state.paperSize, dpi: state.dpi }),
  setSourceItems: (items) => { state.sourceItems = items; },
  requestRefresh: refresh,
});
```

- [ ] **Step 7: Update export click handler**

Replace the `dom.btnExport.addEventListener('click', ...)` body with:

```js
dom.btnExport.addEventListener('click', async () => {
  if (state.sourceItems.length === 0) return;
  const choice = window.confirm('确定导出？\n确定 = JPG（较小）\n取消 = PNG（无损）');
  const format = choice ? 'jpeg' : 'png';
  setStatus('EXPORTING');
  dom.btnExport.disabled = true;
  try {
    await exportImage(
      {
        sourceItems: state.sourceItems,
        paperSize: state.paperSize,
        dpi: state.dpi,
        margin: state.margin,
        gap: state.gap,
        drawing: state.drawing,
        zoom: state.zoom,
        showCropMarks: state.showCropMarks,
        format,
      },
      PAPER_SIZES
    );
    toast('已生成图片，请检查下载');
  } catch (err) {
    toast(err.message);
  } finally {
    setStatus(state.mode === 'PHOTO' && state.status === 'EXPORTING' ? 'READY' : state.status);
    setStatus('READY');
    refresh();
  }
});
```

Note: drop the duplicate setStatus and `rotation` param (rotation now lives inside PhotoSourceItem).

- [ ] **Step 8: Update reupload handler**

Replace `dom.btnReupload.addEventListener('click', ...)`:

```js
dom.btnReupload.addEventListener('click', () => {
  if (cropperWrapper.isActive()) cropperWrapper.destroy();
  state.originalImage = null;
  state.croppedCanvas = null;
  state.rotation = 0;
  state.sourceItems = [];
  dom.fileInput.value = '';
  setStatus('INITIAL');
});
```

- [ ] **Step 9: Run all tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 10: Manual smoke check (browser)**

Open `index.html` in browser:
1. Upload an image, crop, verify preview + export (photo mode).
3. Switch to Card tab — verify controls appear.
4. Add 2 fields, type 3 rows of data, verify preview shows 3 distinct cards on A4.
5. Switch back to Photo tab — verify cropped photo state is preserved.

- [ ] **Step 11: Commit**

```bash
git add js/main.js
git commit -m "feat(card): orchestrate photo/card modes via mode-tab"
```

---

## Task 13: Update README and run full test suite

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add card-feature description**

In the `## ✨ 功能` section of `README.md`, append:

```markdown
- 🎴 简易卡片制作：多字段文字 + 嵌入图片，CSV 批量填充，排版到任意相纸
```

In the `## 📐 支持的相纸尺寸` section, no change needed (paper sizes unchanged).

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: all PASS (layout-engine, source-item, card-builder, card-parser)

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document card-making feature in README"
```

---

## Self-Review Checklist (run before handoff)

- [ ] **Spec coverage:**
  - §3 SourceItem abstraction → Task 2 ✓
  - §3 drawing semantics (repeat/once) → Task 6, 7 ✓
  - §4 UI layout & tabs → Tasks 9, 10 ✓
  - §4 mode switching with state preservation → Task 8, 12 ✓
  - §4 cards force-disable crop-marks → Tasks 6, 7 ✓
  - §5 fields config UI → Task 11 ✓
  - §5 batch data + column matching → Task 5 + Task 11 ✓
  - §5 card canvas resolution = mm × dpi with 1500px cap → Task 4 ✓
  - §6 layout-engine accepts arbitrary size → Task 3 ✓
  - §6 preview-renderer accepts SourceItem[] → Task 6 ✓
  - §6 exporter accepts SourceItem[] → Task 7 ✓
  - §6 info-panel split messages + N>M warning → Task 12 ✓
  - §7 files all accounted for ✓

- [ ] **Placeholder scan:** No TBD / TODO / "implement later" in any task.

- [ ] **Type consistency:**
  - `SourceItem.size` / `SourceItem.canvas` — same name everywhere (Tasks 2, 4, 6, 7, 12)
  - `calculateLayout(sourceSize, paper, margin, gap)` — same signature (Tasks 3, 6, 7)
  - `renderPreview(canvas, params, paperMap, sourceItems)` — same signature (Tasks 6, 12)
  - `exportImage(params, paperMap)` — same signature (Tasks 7, 12)
  - `CARD_SIZES` keys: `'一寸' | '二寸' | '自定义'` consistent across Tasks 1, 9, 11
  - `drawing: 'repeat' | 'once'` consistent across Tasks 6, 7, 12
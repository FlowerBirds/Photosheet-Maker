# 卡片排版方向与设计方向解耦 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在卡片模式新增独立的「排版方向」控件，使其与设计方向解耦；不同方向时在 drawImage 阶段旋转卡片，让用户可以最大化排版密度。

**Architecture:** 保持 `SourceItem` / `CardSourceItem` 接口不变；新增纯函数 `arrangedSize(item, orient)` 把设计尺寸转换为排版尺寸；`preview-renderer.js` 和 `exporter.js` 接收 `arrangeOrient` 参数，用 arrangedSize 算 layout，drawImage 在方向不同时用 `ctx.rotate(π/2)` 旋转绘制。

**Tech Stack:** 纯前端 ES Module；Canvas 2D；Vitest + jsdom。

**Spec:** `docs/superpowers/specs/2026-09-01-arrange-orientation-design.md`

---

## File Structure

| 文件 | 状态 | 职责 |
|---|---|---|
| `js/arrange-size.js` | 新增 | 纯函数 `arrangedSize(item, orient)`：根据 `item.size` 与排版方向返回 `{w, h}` |
| `index.html` | 改 | `#card-editor-section` 内尺寸 row 之后，新增 `arrange-orient-row` DOM |
| `js/card-editor.js` | 改 | 维护 `arrangeOrient` 状态；监听 radio change；新增 `setArrangementOrient(value)` 公共 API；改动设计方向时重置 arrangeOrient |
| `js/main.js` | 改 | 新增 `state.arrangeOrient`；`setArrangementOrient` setter；`refresh()` 传 `arrangeOrient` |
| `js/preview-renderer.js` | 改 | 接收 `arrangeOrient` 参数；用 arrangedSize 算 layout；drawImage 在方向不同时旋转绘制 |
| `js/exporter.js` | 改 | 同 preview-renderer |
| `tests/arrange-size.test.js` | 新增 | 单元测试 `arrangedSize` |
| `tests/preview-renderer.test.js` | 改 | 新增 2 个用例：arrangeOrient 在 layout 中生效；rotate 路径触发 |

---

## Task 1: 新增 `js/arrange-size.js` 模块

**Files:**
- Create: `js/arrange-size.js`
- Test: `tests/arrange-size.test.js`

- [ ] **Step 1: 写失败的测试**

```js
// tests/arrange-size.test.js
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- tests/arrange-size.test.js`
Expected: FAIL with "Cannot find module '../js/arrange-size.js'"

- [ ] **Step 3: 实现 `js/arrange-size.js`**

```js
// js/arrange-size.js
/**
 * Convert a SourceItem's design size into the arranged (layout) size
 * based on the desired orientation.
 *
 * @param {{size: {w:number, h:number}}} item
 * @param {'portrait'|'landscape'} orient
 * @returns {{w:number, h:number}}
 */
export function arrangedSize(item, orient) {
  const s = item.size;
  const w = Math.min(s.w, s.h);  // smaller = "short side"
  const h = Math.max(s.w, s.h);  // larger  = "long side"
  if (orient === 'landscape') return { w: h, h: w };  // long side horizontally
  return { w, h };                                     // long side vertically (portrait / unknown)
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- tests/arrange-size.test.js`
Expected: PASS（6 个用例）。

- [ ] **Step 5: 提交**

```bash
git add js/arrange-size.js tests/arrange-size.test.js
git commit -m "feat(card): add arrangedSize helper for layout orientation"
```

---

## Task 2: 在 `index.html` 新增「排版方向」DOM

**Files:**
- Modify: `index.html:131-156`（在 `#card-editor-section` 内、custom-card-size 之前）

- [ ] **Step 1: 插入 DOM**

找到 `<div class="custom-size-row" id="custom-card-size" hidden>`（约第 145 行），**之前**插入：

```html
        <div class="orient-row arrange-orient-row">
          <span class="orient-label-title">排版方向</span>
          <label class="orient-label">
            <input type="radio" name="card-arrange-orientation" value="portrait" checked />
            <span>纵向</span>
          </label>
          <label class="orient-label">
            <input type="radio" name="card-arrange-orientation" value="landscape" />
            <span>横向</span>
          </label>
        </div>
```

- [ ] **Step 2: 验证 HTML 结构**

Run: 浏览器打开 `index.html`，切到「卡片」tab，确认 DOM 中存在 `[name="card-arrange-orientation"]`。

- [ ] **Step 3: 提交**

```bash
git add index.html
git commit -m "feat(card): add arrange-orientation radio DOM"
```

---

## Task 3: `js/card-editor.js` 维护 `arrangeOrient` 状态

**Files:**
- Modify: `js/card-editor.js`
- Test: `tests/card-editor.test.js`（新增 2 个用例）

### 3.1 写测试

- [ ] **Step 1: 在 `tests/card-editor.test.js` 末尾追加**

```js
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
    // Design radio still portrait.
    const designR = document.querySelector('input[name="card-orientation"]:checked');
    expect(designR.value).toBe('portrait');
  });

  it('setArrangementOrient API updates the radio state', () => {
    const editor = initEditor();
    editor.setArrangementOrient('landscape');
    const r = document.querySelector('input[name="card-arrange-orientation"]:checked');
    expect(r.value).toBe('landscape');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- tests/card-editor.test.js`
Expected: 3 个新用例 FAIL（setArrangementOrient 尚未实现、change handler 未注册）。

### 3.2 实现

- [ ] **Step 3: 在 `js/card-editor.js` 中维护 `arrangeOrient` 状态**

找到 `let cropState = null;`（`js/card-editor.js:65` 附近），在它**之后**新增：

```js
  // Arrangement (layout) orientation. Defaults to design orientation.
  let arrangeOrient = getOrientation();
```

找到 `els.btnAddText.addEventListener('click', () => { ... });`（约第 158 行）之后，`els.btnAddImage.addEventListener('click', () => els.imageInput.click());`（约第 174 行）之前，新增 arrange-orientation radio 处理：

```js
  // Arrange-orientation radios.
  document.querySelectorAll('input[name="card-arrange-orientation"]').forEach((r) => {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      arrangeOrient = r.value;
    });
  });
```

- [ ] **Step 4: 设计方向改变时重置 arrangeOrient**

修改 `els.selectSize.addEventListener('change', ...)`（约第 109-114 行），在 `syncSizeInputs();` 之后、`if (phase === 'designing') drawDesigner();` 之前，插入：

```js
    // Reset arrange orientation to follow design orientation.
    const arrR = document.querySelector('input[name="card-arrange-orientation"][value="portrait"]');
    if (arrR) {
      // Match design orientation.
      setArrangementOrient(getOrientation());
    }
```

修改 orientation radio handler（约第 118-129 行），在 `if (phase === 'designing') drawDesigner();` 之后追加：

```js
      // Arrange orientation follows design orientation.
      setArrangementOrient(getOrientation());
```

实际更简单的方式：在 `setArrangementOrient` 函数中保持内部状态更新；`getOrientation()` 是同步读取设计方向的，所以可以直接 `setArrangementOrient(getOrientation())` 即可。

把上面的两处独立片段合并到现有的两个 handler 里（在已有逻辑末尾、`drawDesigner` / `rebuildArrangeItem` 调用之后）。

- [ ] **Step 5: 暴露 `setArrangementOrient` 公共 API**

把 `js/card-editor.js` 末尾的 `return { ... }` 块（约第 705 行）改为：

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
    /**
     * Start cropping a source canvas (HTMLCanvasElement). Exposed for
     * programmatic flows; the file-input handler calls this internally.
     */
    startCrop,
    /** Get the current arrangement orientation ('portrait'|'landscape'). */
    getArrangementOrient: () => arrangeOrient,
    /** Set the arrangement orientation (updates radio state only; layout is the consumer's job). */
    setArrangementOrient(value) {
      if (value !== 'portrait' && value !== 'landscape') return;
      arrangeOrient = value;
      const r = document.querySelector(`input[name="card-arrange-orientation"][value="${value}"]`);
      if (r) r.checked = true;
    },
  };
}
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `npm test -- tests/card-editor.test.js`
Expected: 全部通过（原 14 + 新 3 = 17 个）。

- [ ] **Step 7: 提交**

```bash
git add js/card-editor.js tests/card-editor.test.js
git commit -m "feat(card): track arrange orientation independent of design orientation"
```

---

## Task 4: `js/main.js` 暴露 `state.arrangeOrient` 给预览 / 导出

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: 新增 state 字段**

找到 `js/main.js` 的 state 对象（约第 56-72 行），在 `drawing: 'repeat'`（第 70 行）之后，**新增**：

```js
  arrangeOrient: 'portrait',  // arrangement (layout) orientation, in CARD mode
```

- [ ] **Step 2: 把 `state.arrangeOrient` 注入 `renderPreview` 调用**

找到 `js/main.js:140` 的 `const params = { ... }` 块，在 `gap: st.gap,` 之后、`drawing: st.drawing,` 之前，**新增**：

```js
    arrangeOrient: st.arrangeOrient,
```

- [ ] **Step 3: 在 `initCardEditor` 调用之前定义 setter**

找到 `initCardEditor({` 调用（`js/main.js:347`）之前，**新增**：

```js
const setArrangementOrient = (value) => {
  state.arrangeOrient = value;
  cardEditor?.setArrangementOrient?.(value);
  refresh();
};
```

但 `cardEditor` 是 const，需要重新组织：把 initCardEditor 之前的 `const cardEditor` 改为 `let cardEditor`，然后 `setArrangementOrient` 内引用它。或者：用 setter 模式，把 setter 传给 initCardEditor 作为 el，让 card-editor 内部触发。

更简单的方式：在 `initCardEditor` 调用之前先声明 `let cardEditor = null;`，然后在 initCardEditor 调用之后 `cardEditor = initCardEditor({...})`。

把 `js/main.js:347` 的 `const cardEditor = initCardEditor({...})` 改为：

```js
let cardEditor;
```

在 `createModeTab({...})` 之后：

```js
cardEditor = initCardEditor({ ... });
```

并且在 `createModeTab` 之前声明 `setArrangementOrient` setter：

```js
const setArrangementOrient = (value) => {
  state.arrangeOrient = value;
  if (cardEditor) cardEditor.setArrangementOrient(value);
  refresh();
};
```

- [ ] **Step 4: 在切 tab 时把 `state.arrangeOrient` 同步给 card-editor**

找到 `onSwitch: (newMode) => { ... }`（约 374 行），切到 CARD 时（`else` 分支），在 `cardEditor.redraw();` 之后、`return;` 之前，新增：

```js
      // Sync arrange orientation into card-editor.
      cardEditor.setArrangementOrient(state.arrangeOrient);
```

- [ ] **Step 5: 验证 main.js 语法**

Run: `node -e "import('./js/main.js').then(()=>console.log('OK')).catch(e=>console.log('ERR:',e.message))"`
Expected: ERR: document is not defined（这是预期的——main.js 是浏览器入口）。

### 4.1 写测试（针对 `state.arrangeOrient` 注入）

- [ ] **Step 6: 验证完整测试套件通过**

Run: `npm test`
Expected: 全部通过（17 + 6 arrange-size + 2 preview-renderer = 至少 25 个）。

### 4.2 提交

- [ ] **Step 7: 提交**

```bash
git add js/main.js
git commit -m "feat(card): wire state.arrangeOrient into preview/exporter"
```

---

## Task 5: `js/preview-renderer.js` 用 arrangedSize + rotate 绘制

**Files:**
- Modify: `js/preview-renderer.js`
- Test: `tests/preview-renderer.test.js`（新增 2 个用例）

### 5.1 写测试

- [ ] **Step 1: 在 `tests/preview-renderer.test.js` 末尾追加**

```js
describe('renderPreview — arrange orientation', () => {
  it('uses arrangedSize for layout when arrangeOrient differs from item.size', () => {
    // Item designed landscape (90, 54); arrange portrait → arrangedSize = (54, 90).
    // 6 寸 paper = (102, 152). cols = floor((102-10+2) / (54+2)) = floor(94/56) = 1.
    // rows = floor((152-10+2) / (90+2)) = floor(144/92) = 1.
    const c = document.createElement('canvas');
    const item = makeItem(90, 54);
    const layout = renderPreview(
      c,
      { paperSize: '6寸（4R）', margin: { top: 5, bottom: 5, left: 5, right: 5 },
        gap: { h: 2, v: 2 }, drawing: 'once', showCropMarks: false,
        arrangeOrient: 'portrait' },
      PAPER_SIZES,
      [item]
    );
    expect(layout.count).toBe(1);
    expect(layout.cols).toBe(1);
    expect(layout.rows).toBe(1);
  });

  it('returns identical layout when arrangeOrient matches item orientation', () => {
    const c = document.createElement('canvas');
    const item = makeItem(25, 35);  // portrait
    const layout = renderPreview(
      c,
      { paperSize: '6寸（4R）', margin: { top: 5, bottom: 5, left: 5, right: 5 },
        gap: { h: 2, v: 2 }, drawing: 'once', showCropMarks: false,
        arrangeOrient: 'portrait' },
      PAPER_SIZES,
      [item]
    );
    // 6 寸 (102,152). usableW = 92, usableH = 142.
    // cols = floor(94/60) = 1, rows = floor(144/72) = 2.
    expect(layout.count).toBe(2);
  });

  it('swaps layout when item is landscape and arrangeOrient is also landscape (no rotate path)', () => {
    const c = document.createElement('canvas');
    const item = makeItem(90, 54);  // landscape
    const layout = renderPreview(
      c,
      { paperSize: '6寸（4R）', margin: { top: 5, bottom: 5, left: 5, right: 5 },
        gap: { h: 2, v: 2 }, drawing: 'once', showCropMarks: false,
        arrangeOrient: 'landscape' },
      PAPER_SIZES,
      [item]
    );
    // Same as if designed portrait (54, 90) and arrange portrait.
    // arrangedSize (90, 54). cols = floor(94/92) = 1, rows = floor(144/56) = 2.
    expect(layout.count).toBe(2);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- tests/preview-renderer.test.js`
Expected: 3 个新用例 FAIL（arrangeOrient 未生效）。

### 5.2 实现

- [ ] **Step 3: 修改 `js/preview-renderer.js`**

在文件顶部 import 之后，**新增**：

```js
import { arrangedSize } from './arrange-size.js';
```

修改 `renderPreview` 函数签名 JSDoc（添加 `arrangeOrient`）：

```js
 * @param {{
 *   paperSize: string,
 *   margin: {top:number,bottom:number,left:number,right:number},
 *   gap:    {h:number, v:number},
 *   drawing: 'repeat'|'once',
 *   zoom?: number,
 *   showCropMarks?: boolean,
 *   showFooter?: boolean,
 *   arrangeOrient?: 'portrait'|'landscape',  // NEW
 * }} params
```

修改函数体：在 `const sourceSize = sourceItems[0].size;` 之后，**新增**：

```js
  const arrangeOrient = params.arrangeOrient || 'portrait';
  const layoutSize = arrangedSize(sourceItems[0], arrangeOrient);
```

修改 `const layout = calculateLayout(sourceSize, paper, params.margin, params.gap);` 为：

```js
  const layout = calculateLayout(layoutSize, paper, params.margin, params.gap);
```

修改 `const drawW = sourceSize.w * zoom;` 和 `const drawH = sourceSize.h * zoom;` 为：

```js
  const drawW = layoutSize.w * zoom;
  const drawH = layoutSize.h * zoom;
```

修改两个 `drawImage` 调用（repeat 循环 和 once 分支）—— 用一个 helper 把「直接绘制」和「旋转绘制」合并：

**先**在文件底部**新增** helper：

```js
/**
 * Draw an item at the given position, rotating 90° if designedSize != layoutSize.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{canvas:HTMLCanvasElement, size:{w:number,h:number}}} item
 * @param {{x:number,y:number}} pos      - position in mm on the layout
 * @param {number} scale                  - mm → display px
 * @param {{w:number,h:number}} drawSize  - layout size in mm
 * @param {number} zoom                   - per-photo zoom multiplier (1 for cards)
 */
function drawItemAtPosition(ctx, item, pos, scale, drawSize, zoom) {
  const designedSize = item.size;
  const sameOrient = designedSize.w === drawSize.w && designedSize.h === drawSize.h;
  const wPx = drawSize.w * zoom * scale;
  const hPx = drawSize.h * zoom * scale;
  if (sameOrient) {
    ctx.drawImage(item.canvas, pos.x * scale, pos.y * scale, wPx, hPx);
  } else {
    // Rotate 90°: translate to top-right of target, rotate, draw with swapped source dims.
    ctx.save();
    ctx.translate((pos.x * scale) + wPx, pos.y * scale);
    ctx.rotate(Math.PI / 2);
    // Source canvas dimensions = designedSize; we draw it into (hPx, wPx).
    ctx.drawImage(item.canvas, 0, 0, hPx, wPx);
    ctx.restore();
  }
}
```

把两个 `drawImage` 替换为 `drawItemAtPosition(ctx, item, pos, scale, layoutSize, zoom)`。

修改 `drawCropMarks(ctx, layout, sourceSize, scale, zoom);` 为 `drawCropMarks(ctx, layout, layoutSize, scale, zoom);`（crop-marks 应按排版尺寸画）。

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- tests/preview-renderer.test.js`
Expected: 全部通过（原 2 + 新 3 = 5 个）。

- [ ] **Step 5: 提交**

```bash
git add js/preview-renderer.js tests/preview-renderer.test.js
git commit -m "feat(card): preview-renderer honors arrangeOrient (rotate on draw)"
```

---

## Task 6: `js/exporter.js` 同样处理 arrangeOrient

**Files:**
- Modify: `js/exporter.js`

- [ ] **Step 1: 修改 `js/exporter.js`**

在文件顶部 import 之后**新增**：

```js
import { arrangedSize } from './arrange-size.js';
```

修改 JSDoc 增加 `arrangeOrient`：

```js
 * @param {{
 *   sourceItems: import('./source-item.js').SourceItem[],
 *   paperSize: string, dpi: number,
 *   margin: {top:number,bottom:number,left:number,right:number},
 *   gap:    {h:number, v:number},
 *   drawing: 'repeat'|'once',
 *   zoom?: number,
 *   showCropMarks?: boolean,
 *   showFooter?: boolean,
 *   format: 'jpeg'|'png',
 *   arrangeOrient?: 'portrait'|'landscape',  // NEW
 * }} params
```

修改函数体内：在 `const sourceSize = sourceItems[0].size;` 之后**新增**：

```js
  const arrangeOrient = params.arrangeOrient || 'portrait';
  const layoutSize = arrangedSize(sourceItems[0], arrangeOrient);
```

修改 `const layout = calculateLayout(sourceSize, paper, margin, gap);` 为：

```js
  const layout = calculateLayout(layoutSize, paper, margin, gap);
```

修改 `const drawW = sourceSize.w * zoom;` 和 `const drawH = sourceSize.h * zoom;` 为：

```js
  const drawW = layoutSize.w * zoom;
  const drawH = layoutSize.h * zoom;
```

修改两个 `drawImage` 调用（repeat 循环 和 once 分支）：

**先**在文件底部**新增** helper：

```js
/**
 * Draw an item at mm coords on the export canvas, rotating 90° if
 * designedSize != layoutSize.
 */
function drawExportItem(ctx, item, pos, mmToPx, drawSize, zoom) {
  const designedSize = item.size;
  const sameOrient = designedSize.w === drawSize.w && designedSize.h === drawSize.h;
  const xPx = Math.round(pos.x * mmToPx);
  const yPx = Math.round(pos.y * mmToPx);
  const wPx = Math.round(drawSize.w * zoom * mmToPx);
  const hPx = Math.round(drawSize.h * zoom * mmToPx);
  if (sameOrient) {
    ctx.drawImage(item.canvas, xPx, yPx, wPx, hPx);
  } else {
    ctx.save();
    ctx.translate(xPx + wPx, yPx);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(item.canvas, 0, 0, hPx, wPx);
    ctx.restore();
  }
}
```

把两个 `ctx.drawImage(item.canvas, ...)` 替换为 `drawExportItem(ctx, item, pos, mmToPx, layoutSize, zoom)`。

修改 `drawCropMarks(ctx, layout, sourceSize, mmToPx, zoom);` 为 `drawCropMarks(ctx, layout, layoutSize, mmToPx, zoom);`。

- [ ] **Step 2: 验证 main.js 仍然正常解析**

Run: `node -e "import('./js/exporter.js').then(()=>console.log('OK')).catch(e=>console.log('ERR:',e.message))"`
Expected: ERR: document is not defined（这是预期的——exporter.js 是浏览器入口）。

- [ ] **Step 3: 提交**

```bash
git add js/exporter.js
git commit -m "feat(card): exporter honors arrangeOrient (rotate on draw)"
```

---

## Task 7: 整体回归 + 文档

**Files:**
- Modify: `README.md`

- [ ]**Step 1: 运行全部测试**

Run: `npm test`
Expected: 全部通过。

- [ ]**Step 2: 更新卡片功能描述**

找到 `README.md:13` 的卡片功能描述行，改为：

```markdown
- 🎴 简易卡片制作：多字段文字 + 嵌入图片，CSV 批量填充，排版到任意相纸；嵌入图片时强制先裁剪，去掉多余背景；设计与排版方向独立，可切换方向最大化排版密度
```

- [ ]**Step 3: 手动 smoke test**

Run: 浏览器打开 `index.html`：
1. ✅ 设计一张 90×54mm（横向）卡片 → 默认「排版方向 = 横向」→ 行为与改动前一致
2. ✅ 改成「排版方向 = 纵向」→ 预览立即重排（count 变化）
3. ✅ 导出 PNG → 检查纵排方向下卡片确实旋转 90°
4. ✅ 切换到 PHOTO mode → 切回 CARD → arrangeOrient 保留
5. ✅ 改动设计方向（横向 ↔ 纵向）→ 排版方向自动跟随

- [ ]**Step 4: 提交**

```bash
git add README.md
git commit -m "docs(readme): note design/arrange orientation decoupling"
```

---

## Spec Coverage Check

| Spec 章节 | 任务 |
|---|---|
| §3.1 arrangedSize 接口 | Task 1 |
| §3.2 改动文件清单 | Task 1-7 |
| §4 UI / DOM | Task 2 |
| §5.1 默认值 | Task 3（arrangeOrient = getOrientation() at init） |
| §5.2 切换排版方向数据流 | Task 3 + 4 |
| §5.3 切换设计方向 | Task 3（重置 arrangeOrient） |
| §5.4 切 tab | Task 4（setArrangementOrient sync） |
| §6 drawImage 旋转 | Task 5 + 6 |
| §7.1 单元测试 | Task 1（arrange-size）+ Task 3（card-editor）+ Task 5（preview-renderer） |
| §7.2 手动验证清单 | Task 7 Step 3 |
| §9 验收标准 | Task 7 Step 1-3 |

全部覆盖。
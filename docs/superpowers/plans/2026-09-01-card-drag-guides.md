# 卡片拖动辅助线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 卡片设计模式下，拖动元素时显示十字虚线（水平 + 垂直中线）作为视觉参考。

**Architecture:** 复用 `drawDesigner()` 现有绘制流水线，在 `drawSelectionOverlay` 之后追加辅助线绘制；仅当 `dragOffset !== null`（现有状态变量）时绘制。无新模块、无新 DOM、无新 CSS。

**Tech Stack:** 纯前端 ES Module；Canvas 2D；Vitest + jsdom。

**Spec:** `docs/superpowers/specs/2026-09-01-card-drag-guides-design.md`

---

## File Structure

| 文件 | 状态 | 职责 |
|---|---|---|
| `js/card-editor.js` | 改 | 新增 `drawDragGuides(ctx, dw, dh)`；在 `drawDesigner()` 末尾追加条件调用 |
| `tests/card-editor.test.js` | 改 | 新增 1 个用例：拖动时 ctx API 被触发；非拖动时不被触发 |

---

## Task 1: 新增 `drawDragGuides` 并接入 `drawDesigner`

**Files:**
- Modify: `js/card-editor.js:356`（在 `drawSelectionOverlay(ctx, scale);` 之后追加一行）
- Modify: `js/card-editor.js:359`（在 `drawSelectionOverlay` 函数之后新增 `drawDragGuides`）
- Test: `tests/card-editor.test.js`

### 1.1 写测试

- [ ] **Step 1: 写失败的测试**

在 `tests/card-editor.test.js` 末尾追加：

```js
describe('card editor drag guides', () => {
  function makeEditorForDrag() {
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
    return initCardEditor({
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
      getState: () => ({ dpi: 300 }),
      setSourceItems: () => {},
      setPhase: () => {},
      requestRefresh: () => {},
    });
  }

  it('non-drag: setLineDash is not called (no guides drawn)', () => {
    const editor = makeEditorForDrag();
    const ctx = document.getElementById('card-canvas').getContext('2d');
    const setLineDashSpy = vi.spyOn(ctx, 'setLineDash');
    // Add a text element to trigger a redraw.
    document.getElementById('btn-add-text').click();
    expect(setLineDashSpy).not.toHaveBeenCalled();
  });

  it('during drag: setLineDash is called with [4, 4]', () => {
    const editor = makeEditorForDrag();
    document.getElementById('btn-add-text').click();
    const canvas = document.getElementById('card-canvas');
    const ctx = canvas.getContext('2d');
    const setLineDashSpy = vi.spyOn(ctx, 'setLineDash');

    // Simulate pointerdown on the canvas (any coords will do — hitTest
    // uses mm coords derived from getBoundingClientRect; the new text
    // element sits at the center so a pointer inside the canvas works).
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      pointerId: 1,
    }));
    // A pointermove while dragOffset is set triggers drawDesigner().
    canvas.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      clientX: rect.left + rect.width / 2 + 10,
      clientY: rect.top + rect.height / 2 + 10,
      pointerId: 1,
    }));

    expect(setLineDashSpy).toHaveBeenCalled();
    expect(setLineDashSpy).toHaveBeenCalledWith([4, 4]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- tests/card-editor.test.js`
Expected: 新增的 2 个测试 fail（drawDragGuides 尚未实现）。

- [ ] **Step 3: 实现 `drawDragGuides` 函数**

在 `js/card-editor.js:357` 的 `}` 后（`drawSelectionOverlay` 函数定义之后；实际上 `drawSelectionOverlay` 一直延伸到约第 384 行），新增：

```js
  /**
   * Draw two dashed center guides across the card canvas (in display px).
   * Called only while dragOffset !== null.
   */
  function drawDragGuides(ctx, dw, dh) {
    const cx = dw / 2;
    const cy = dh / 2;
    ctx.save();
    ctx.strokeStyle = '#2d7ff9';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(dw, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, dh);
    ctx.stroke();
    ctx.restore();
  }
```

然后修改 `drawDesigner()` 末尾（`js/card-editor.js:356`），把：

```js
    drawSelectionOverlay(ctx, scale);
  }
```

改为：

```js
    drawSelectionOverlay(ctx, scale);
    if (dragOffset) drawDragGuides(ctx, dw, dh);
  }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- tests/card-editor.test.js`
Expected: 全部通过（12 个原测试 + 2 个新测试 = 14 个）。

- [ ] **Step 5: 提交**

```bash
git add js/card-editor.js tests/card-editor.test.js
git commit -m "feat(card): draw cross guides during element drag"
```

---

## Task 2: 整体回归

**Files:**
- (none)

- [ ] **Step 1: 运行全部测试**

Run: `npm test`
Expected: 所有测试通过。

- [ ] **Step 2: 手动 smoke test**

Run: 浏览器打开 `index.html`，切到「卡片」tab，验证：
- ✅ 添加文字元素 → 拖动 → 看到蓝色十字虚线
- ✅ pointerup 后虚线消失
- ✅ 不拖动时不显示
- ✅ 完成设计 → 导出图片，无虚线残留

- [ ] **Step 3: 提交（如果发现 bug 修了的话）**

如有 bug 修复需要提交：
```bash
git add -A
git commit -m "fix(card): <description>"
```

否则跳过。

---

## Spec Coverage Check

| Spec 章节 | 任务 |
|---|---|
| §3.1 单一文件改动 | Task 1 |
| §3.2 复用现有绘制流水线 | Task 1（dragOffset 已有；drawDesigner 末尾追加） |
| §3.3 改动文件清单 | Task 1 |
| §4 视觉规格 | Task 1（drawDragGuides 颜色/线型/dash 数组） |
| §5 数据流 | Task 1（dragOffset 触发条件） |
| §6 代码示例 | Task 1 Step 3（与 spec 一致） |
| §7 测试 | Task 1 Step 1 + Task 2 |
| §8 风险 | Task 1 Step 3（绘制顺序在 drawSelectionOverlay 之后） |
| §9 验收标准 | Task 1 Step 4 + Task 2 |

全部覆盖。
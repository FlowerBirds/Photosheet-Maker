# 矩形元素边框类型 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给卡片设计器的矩形（rect）元素增加「边框类型」属性，支持 4 种预设：实线 / 虚线 / 点线 / 点划线，通过属性面板的 `<select>` 切换。

**Architecture:** 在 `js/constants.js` 新增枚举与 mm 单位虚线模式表；`js/card-builder.js` rect 渲染分支根据 `borderType` 字段调用 `setLineDash` / `lineCap` / `lineJoin`；`index.html` 在 `#prop-rect-dims` 加 `<select>`；`js/card-editor.js` 接线默认字段、input handler、`renderProperties()`。Card-level border 保持纯实线。

**Tech Stack:** 纯前端 ES Module（无新依赖）；Canvas 2D `setLineDash` 原生 API；vitest + jsdom（已有）。

**Spec:** `docs/superpowers/specs/2026-09-03-rect-border-type-design.md`

---

## 文件结构

| 文件 | 改动 |
|---|---|
| `js/constants.js` | **+11 行**：新增 `BORDER_TYPES` 与 `BORDER_DASH_PATTERNS_MM` |
| `js/card-builder.js` | rect 渲染分支（约 89-99 行）：`+12 行 / -4 行`，根据 `borderType` 调 `setLineDash`/`lineCap`/`lineJoin`，实线分支主动重置 |
| `index.html` | `#prop-rect-dims` 内插一段 `<select>`：**+9 行** |
| `js/card-editor.js` | JSDoc +1 行；`btnAddRect` 默认字段 +1 行；input handler +6 行；`renderProperties()` rect 分支 +3 行 |
| `tests/card-builder.test.js` | 新增 5 个用例（4 种 borderType + 向后兼容）：**+85 行** |

---

## Task 1: 添加边框类型常量

**Files:**
- Modify: `js/constants.js`（末尾追加）

- [ ] **Step 1: 在 `js/constants.js` 末尾添加常量**

打开 `js/constants.js`，在最后的 `CARD_FIELD_DEFAULTS` 数组之后，追加：

```js
// Rect 元素边框类型枚举（key 与 BORDER_DASH_PATTERNS_MM 对应）。
export const BORDER_TYPES = ['solid', 'dashed', 'dotted', 'dashDot'];

// 各类型的虚线模式（mm 单位，渲染时按 mmToPx 缩放）。
// null = 实线（不调 setLineDash）。
// 取值针对 borderWidth ≈ 0.2mm 调过：dotted 用 [0.3, 0.5] + lineCap='round'
// 才能在小笔画下渲染为圆点。
export const BORDER_DASH_PATTERNS_MM = {
  solid:   null,
  dashed:  [1.5, 0.8],
  dotted:  [0.3, 0.5],
  dashDot: [1.5, 0.8, 0.3, 0.8],
};
```

- [ ] **Step 2: 跑一遍测试确认没破坏现有 import**

```bash
npm test
```

Expected: 64 个测试全部 PASS（这一步只加常量、没改逻辑，零回归）。

- [ ] **Step 3: 提交**

```bash
git add js/constants.js
git commit -m "feat(card): add BORDER_TYPES and BORDER_DASH_PATTERNS_MM constants"
```

---

## Task 2: TDD — rect borderType 渲染

**Files:**
- Modify: `tests/card-builder.test.js`（在 `describe('CardSourceItem', ...)` 末尾、`describe('createCardImageSource', ...)` 之前追加 5 个用例）
- Modify: `js/card-builder.js`（rect 渲染分支，约 89-99 行）

- [ ] **Step 1: 写 5 个失败测试**

打开 `tests/card-builder.test.js`，在 `describe('CardSourceItem', ...)` 的最后一个 `it`（`skips border when width is 0 or border omitted`，约 102-115 行）之后、`});`（关闭 `describe`）之前，插入：

```js
  // ---------- Rect border type ----------

  /**
   * Count colored (non-white) pixels along the top border strip of a rect
   * element rendered at (5, 5) with size 20×20 mm and 0.2 mm border.
   * Used to discriminate solid / dashed / dotted / dashDot borders.
   */
  function countBorderTopStrip(rectEl, dpi = 350) {
    const item = new CardSourceItem({ w: 50, h: 50 }, dpi, [rectEl]);
    const ctx = item.canvas.getContext('2d');
    const mmToPx = dpi / 25.4;
    const rectX = Math.round(5 * mmToPx);
    const rectY = Math.round(5 * mmToPx);
    const rectW = Math.round(20 * mmToPx);
    const borderPx = Math.max(0.5, 0.2 * mmToPx);
    const stripY = Math.round(rectY + borderPx / 2);
    const stripH = Math.max(1, Math.ceil(borderPx));
    const data = ctx.getImageData(rectX, stripY, rectW, stripH).data;
    let colored = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 250 || data[i+1] < 250 || data[i+2] < 250) colored++;
    }
    return colored;
  }

  const baseRect = {
    type: 'rect', id: 'r1',
    x: 5, y: 5, width: 20, height: 20,
    borderWidth: 0.2, borderColor: '#000000', fillColor: '#ffffff',
  };

  it('rect with borderType=solid renders continuous top border (baseline)', () => {
    const count = countBorderTopStrip({ ...baseRect, borderType: 'solid' });
    // Solid stroke spans the full rect width — expect a high pixel count.
    expect(count).toBeGreaterThan(200);
  });

  it('rect with borderType=dashed has fewer colored pixels than solid', () => {
    const solid  = countBorderTopStrip({ ...baseRect, borderType: 'solid' });
    const dashed = countBorderTopStrip({ ...baseRect, borderType: 'dashed' });
    // Dashed pattern introduces gaps → strictly fewer colored pixels.
    expect(dashed).toBeLessThan(solid);
    expect(dashed).toBeGreaterThan(0);
  });

  it('rect with borderType=dotted has far fewer colored pixels than solid', () => {
    const solid  = countBorderTopStrip({ ...baseRect, borderType: 'solid' });
    const dotted = countBorderTopStrip({ ...baseRect, borderType: 'dotted' });
    // Dots are tiny (each ≈ lineWidth diameter) → much fewer pixels than solid.
    expect(dotted).toBeLessThan(solid * 0.6);
    expect(dotted).toBeGreaterThan(0);
  });

  it('rect with borderType=dashDot produces a pattern distinct from dashed', () => {
    const dashed  = countBorderTopStrip({ ...baseRect, borderType: 'dashed' });
    const dashDot = countBorderTopStrip({ ...baseRect, borderType: 'dashDot' });
    // dashDot has more "off" pixels per period → fewer colored pixels than dashed.
    expect(dashDot).toBeLessThan(dashed);
    expect(dashDot).toBeGreaterThan(0);
  });

  it('rect without borderType field falls back to solid (backward compat)', () => {
    // Omit borderType entirely — old saved cards lack the field.
    const { borderType, ...legacy } = baseRect;
    const legacyCount = countBorderTopStrip(legacy);
    const solidCount  = countBorderTopStrip({ ...baseRect, borderType: 'solid' });
    expect(legacyCount).toBe(solidCount);
  });
```

- [ ] **Step 2: 跑测试，确认 5 个新用例都 FAIL**

```bash
npx vitest run tests/card-builder.test.js
```

Expected: 4 个新增 borderType 用例 FAIL（实现尚未生效），1 个 backward-compat 用例 PASS（现状就是 solid）。

- [ ] **Step 3: 在 `js/card-builder.js` 实现 rect borderType 渲染**

打开 `js/card-builder.js`，在文件顶部 import 区域加一行：

```js
import { CARD_MAX_PX, DEFAULT_FIELD_COLOR, BORDER_DASH_PATTERNS_MM } from './constants.js';
```

定位到 `renderCardCanvas` 内 rect 分支（约 81-100 行），把这段：

```js
    } else if (el.type === 'rect') {
      const wPx = el.width * mmToPx;
      const hPx = el.height * mmToPx;
      const xPx = el.x * mmToPx;
      const yPx = el.y * mmToPx;
      // Fill first so border sits on top.
      ctx.fillStyle = el.fillColor || '#ffffff';
      ctx.fillRect(xPx, yPx, wPx, hPx);
      if (el.borderWidth > 0) {
        ctx.strokeStyle = el.borderColor || '#888888';
        ctx.lineWidth = Math.max(0.5, el.borderWidth * mmToPx);
        // Inset by half the line width so the stroke stays inside the rect.
        ctx.strokeRect(
          xPx + ctx.lineWidth / 2,
          yPx + ctx.lineWidth / 2,
          Math.max(0, wPx - ctx.lineWidth),
          Math.max(0, hPx - ctx.lineWidth)
        );
      }
    }
```

替换为：

```js
    } else if (el.type === 'rect') {
      const wPx = el.width * mmToPx;
      const hPx = el.height * mmToPx;
      const xPx = el.x * mmToPx;
      const yPx = el.y * mmToPx;
      // Fill first so border sits on top.
      ctx.fillStyle = el.fillColor || '#ffffff';
      ctx.fillRect(xPx, yPx, wPx, hPx);
      if (el.borderWidth > 0) {
        ctx.strokeStyle = el.borderColor || '#888888';
        ctx.lineWidth = Math.max(0.5, el.borderWidth * mmToPx);

        // Border type → line dash pattern. solid = no dash; others get a
        // scaled-on-render mm pattern. dotted uses round caps so short
        // segments render as circles.
        const borderType = el.borderType || 'solid';
        const patternMm = BORDER_DASH_PATTERNS_MM[borderType];
        if (patternMm) {
          ctx.setLineDash(patternMm.map(mm => mm * mmToPx));
          ctx.lineCap  = borderType === 'dotted' ? 'round' : 'butt';
          ctx.lineJoin = borderType === 'dotted' ? 'round' : 'miter';
        } else {
          // Reset so a previous rect's dash doesn't leak into the card-level
          // border (which always renders solid) or the next element.
          ctx.setLineDash([]);
          ctx.lineCap  = 'butt';
          ctx.lineJoin = 'miter';
        }

        // Inset by half the line width so the stroke stays inside the rect.
        ctx.strokeRect(
          xPx + ctx.lineWidth / 2,
          yPx + ctx.lineWidth / 2,
          Math.max(0, wPx - ctx.lineWidth),
          Math.max(0, hPx - ctx.lineWidth)
        );
      }
    }
```

- [ ] **Step 4: 跑测试，确认全部 PASS**

```bash
npx vitest run tests/card-builder.test.js
```

Expected: 所有用例 PASS（5 个新增 + 11 个原有 = 16 个 card-builder 用例）。

- [ ] **Step 5: 跑全量测试，确认无回归**

```bash
npm test
```

Expected: 64 + 5 = 69 个测试全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add js/card-builder.js tests/card-builder.test.js
git commit -m "feat(card): render rect with configurable border type (solid/dashed/dotted/dashDot)"
```

---

## Task 3: 添加 UI 控件（HTML select）

**Files:**
- Modify: `index.html`（`#prop-rect-dims` 内，约 250-254 行边框宽度 slider 之后）

- [ ] **Step 1: 在边框宽度 slider 之后插入 select**

打开 `index.html`，定位到 `#prop-rect-dims` 内的这段：

```html
              <div class="slider-row">
                <label for="prop-border-width-input">边框</label>
                <input type="range" id="prop-border-width-input" min="0" max="10" step="0.1" />
                <span class="slider-value" id="prop-border-width-val">0.2 mm</span>
              </div>
```

在它**之后**插入：

```html
              <div class="slider-row">
                <label for="prop-border-type">边框类型</label>
                <select id="prop-border-type">
                  <option value="solid">实线</option>
                  <option value="dashed">虚线</option>
                  <option value="dotted">点线</option>
                  <option value="dashDot">点划线</option>
                </select>
              </div>
```

放在边框宽度之后——宽度决定粗细、类型决定样式，符合「从粗到细」的认知顺序（spec §6）。

- [ ] **Step 2: 提交**

```bash
git add index.html
git commit -m "feat(card): add border-type select to rect properties panel"
```

---

## Task 4: 接线 card-editor.js

**Files:**
- Modify: `js/card-editor.js`（4 处小改）

- [ ] **Step 1: 更新 els 列表的 JSDoc**

打开 `js/card-editor.js`，定位到 `propFillColor` 后面（约 86 行）：

```js
   *   propFillColor:        HTMLInputElement,
   *   propRectAspectToggle: HTMLButtonElement,
```

在 `propFillColor` 之后追加一行：

```js
   *   propBorderType:       HTMLSelectElement,
```

- [ ] **Step 2: 新建 rect 元素时带默认 `borderType: 'solid'`**

定位到 `btnAddRect` 的 click handler（约 212-223 行），把：

```js
    elements.push({
      type: 'rect', id,
      x: cardSize.w / 2 - w / 2,
      y: cardSize.h / 2 - h / 2,
      width: w,
      height: h,
      borderWidth: 0.2,
      borderColor: '#888888',
      fillColor: '#ffffff',
      aspectLocked: true,
      _aspect: w / h,
    });
```

改为：

```js
    elements.push({
      type: 'rect', id,
      x: cardSize.w / 2 - w / 2,
      y: cardSize.h / 2 - h / 2,
      width: w,
      height: h,
      borderWidth: 0.2,
      borderColor: '#888888',
      fillColor: '#ffffff',
      borderType: 'solid',
      aspectLocked: true,
      _aspect: w / h,
    });
```

- [ ] **Step 3: 添加 input handler（在 `propFillColor` handler 之后）**

定位到 `propFillColor` 的 handler（约 470-475 行）：

```js
    els.propFillColor.addEventListener('input', () => {
      const cur = elements.find(e => e.id === selectedId);
      if (!cur || cur.type !== 'rect') return;
      cur.fillColor = els.propFillColor.value || '#ffffff';
      drawDesigner();
    });
```

在它**之后**、`}` 关闭 `if (els.propRectWInput)` 之前，添加：

```js
    els.propBorderType.addEventListener('input', () => {
      const cur = elements.find(e => e.id === selectedId);
      if (!cur || cur.type !== 'rect') return;
      cur.borderType = els.propBorderType.value || 'solid';
      drawDesigner();
    });
```

注意：这段必须留在 `if (els.propRectWInput) { ... }` 块内（line 417 起的 guard），否则旧测试里没有 `propBorderType` 元素时会崩溃。

- [ ] **Step 4: 在 `renderProperties()` 的 rect 分支设置 select 值**

定位到 `renderProperties()` 的 rect 分支（约 518-537 行），找到 `propFillColor` 赋值那行：

```js
      els.propFillColor.value = el.fillColor || '#ffffff';
```

在它**之后**添加：

```js
      if (els.propBorderType) {
        els.propBorderType.value = el.borderType || 'solid';
      }
```

注意 `propBorderType` 的 `if` 守卫——旧测试 `makePropsElsWithRect()` 的 DOM 里没有这个 select，必须 guard。

- [ ] **Step 5: 跑全量测试，确认无回归**

```bash
npm test
```

Expected: 69 个测试全部 PASS。card-editor 旧测试的 fake factory 没注入 `propBorderType`，被 `if (els.propBorderType)` guard 跳过，不影响。

- [ ] **Step 6: 提交**

```bash
git add js/card-editor.js
git commit -m "feat(card): wire rect border-type select (default + handler + renderProperties)"
```

---

## Task 5: 全量验证 + 手动 smoke

**Files:** 无（只验证）

- [ ] **Step 1: 跑全量测试**

```bash
npm test
```

Expected: 69 个测试全部 PASS（64 原有 + 5 新增）。

- [ ] **Step 2: 启动本地 HTTP 服务器做 smoke**

```bash
python -m http.server 8000
```

然后浏览器打开 `http://127.0.0.1:8000/`，按以下清单验证（每步预期结果）：

| 操作 | 预期 |
|---|---|
| 切到「卡片」tab → 选一张预设尺寸 | 卡片画布显示 |
| 点击「＋ 添加矩形」 | 卡片中央出现一个 15×15mm 实线方框，elementList 出现「矩形」一行 |
| 选中该矩形 → 属性面板出现「边框类型」下拉框，默认「实线」 | 下拉显示「实线」 |
| 下拉切到「虚线」 | 边框立即变成长划虚线 |
| 下拉切到「点线」 | 边框变成小圆点 |
| 下拉切到「点划线」 | 边框变成 dash-dot 模式 |
| 切回「实线」 | 边框恢复正常（验证 setLineDash 已重置，未泄漏） |
| 调整边框宽度 slider → 虚线/点线模式相应变粗 | OK |
| 点「完成设计 →」→ 预览相纸 | 卡片按预期重复铺满，导出的 JPG 边框类型保留 |

任何一步不符预期，回到 Task 2-4 排查。

- [ ] **Step 3: 关闭 HTTP 服务器**

```bash
# 在另一个终端
# 找到占用 8000 的 python 进程并 Ctrl-C
```

---

## Spec Coverage Check

逐条核对 `docs/superpowers/specs/2026-09-03-rect-border-type-design.md` 的需求：

| Spec 章节 | 实施位置 |
|---|---|
| §2 用户决策摘要（scope / types / UI / 默认值 / 向后兼容） | Task 1（types）、Task 3（UI）、Task 4（默认值 + backward compat 通过 `\|\| 'solid'`） |
| §3.1 改动文件清单 | Task 1-4 覆盖全部 5 个文件 |
| §4 数据模型 + 常量定义 | Task 1（常量）+ Task 4（默认值字段） |
| §5 渲染逻辑（setLineDash / lineCap / lineJoin + 重置） | Task 2 Step 3 |
| §6 UI DOM 位置（在边框宽度 slider 之后） | Task 3 |
| §7.1 els 列表 JSDoc | Task 4 Step 1 |
| §7.2 新建 rect 默认值 | Task 4 Step 2 |
| §7.3 input handler（含 guard） | Task 4 Step 3 |
| §7.4 renderProperties 设置 select 值（含 guard） | Task 4 Step 4 |
| §8.1 4 个单元测试 + backward compat | Task 2 Step 1 |
| §8.2 手动验证清单 | Task 5 Step 2 |
| §10 验收标准 1-6 | Task 5 Step 1（自动）+ Step 2（手动）覆盖全部 6 条 |

全部覆盖，无遗漏。

---

## 风险与回退

- **风险**：Step 3 / Step 4 的 `if (els.propBorderType)` guard 漏写 → 旧 `makePropsElsWithRect()` 测试崩溃
  - **回退**：guard 是 `if (els.propBorderType) { ... }` 单行包裹，必须确认。否则 npm test 立即红
- **风险**：Task 2 Step 1 中 `borderType: undefined` 解构后 `countBorderTopStrip` 仍然传入了 `{ borderType, ...legacy }` 的对象
  - **回退**：测试已用 `{ borderType, ...legacy }` 模式剔除字段，逻辑正确
- **回退方案**：任何 commit 失败，`git revert HEAD~N` 回退；测试红就重跑 `npm test` 看具体 diff 定位

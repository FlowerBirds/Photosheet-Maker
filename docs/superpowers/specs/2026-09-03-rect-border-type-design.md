# 矩形元素边框类型 — 设计

**日期：** 2026-09-03
**目标版本：** Photosheet-Maker v2（卡片功能增强）
**作者：** Brainstorming 协作产出

---

## 1. 目标与背景

Photosheet-Maker 卡片设计模式中，矩形（rect）元素目前**只能用实线**绘制边框（`js/card-builder.js:89-99` 中 `ctx.strokeRect()`）。当卡片需要做分割、强调、分组时，设计师常常希望用虚线、点线、点划线来区分。

**目标：** 给 rect 元素增加「边框类型」属性，支持 4 种预设（实线 / 虚线 / 点线 / 点划线），通过 `<select>` 切换。

**非目标（YAGNI）：**
- 卡片级边框（card-level border）**保持实线不变**（用户明确只针对 rect）
- 不支持自定义 dash 间距 / dot 大小（4 种预设够用）
- 不暴露给外部 API（仅 rect 内部字段）

---

## 2. 用户决策摘要

| 决策点 | 选择 |
|---|---|
| 作用域 | 只作用于 rect 元素 |
| 类型枚举 | 4 种：solid / dashed / dotted / dashDot |
| UI 控件 | `<select>` 下拉框（文字标签） |
| 默认值 | `'solid'`（与现状一致） |
| 向后兼容 | 已有 rect 元素无 `borderType` 字段 → 渲染时按 `'solid'` 处理 |

---

## 3. 架构与模块边界

### 3.1 改动文件

| 文件 | 改动 |
|---|---|
| `js/constants.js` | 新增 `BORDER_TYPES` 数组 + `BORDER_DASH_PATTERNS_MM` 映射表 |
| `js/card-builder.js` | rect 渲染分支根据 `borderType` 设置 `setLineDash` / `lineCap` / `lineJoin` |
| `index.html` | `#prop-rect-dims` 内新增 `<select id="prop-border-type">` |
| `js/card-editor.js` | els 列表新增 `propBorderType`；新建 rect 默认 `borderType:'solid'`；handler + `renderProperties()` 接线 |
| `tests/card-builder.test.js` | 新增 4 个用例：每种 `borderType` 渲染出可区分的像素模式 |

### 3.2 不变文件

- `js/source-item.js`、`js/layout-engine.js`、`js/preview-renderer.js`、`js/exporter.js` 不变（不依赖 rect 字段）
- `js/main.js` 不变（无新全局状态）
- Card-level border 渲染分支**不动**

---

## 4. 数据模型

### 4.1 Rect 元素字段

新增字段：

```js
{
  type: 'rect',
  id: 'e1',
  x, y, width, height,
  borderWidth: 0.2,
  borderColor: '#888888',
  fillColor: '#ffffff',
  borderType: 'solid',  // ← 新增；默认 'solid'
  aspectLocked, _aspect,
}
```

### 4.2 常量定义（`js/constants.js` 末尾新增）

```js
// 矩形边框类型枚举（与 BORDER_DASH_PATTERNS_MM 的 key 对应）
export const BORDER_TYPES = ['solid', 'dashed', 'dotted', 'dashDot'];

// 各类型的虚线模式（mm 单位）。null = 实线，不调 setLineDash。
// 取值针对 borderWidth ≈ 0.2mm 调过：dotted 用 [0.3,0.5] + lineCap='round'
// 才能在小笔画下看起来是圆点而不是短划。
export const BORDER_DASH_PATTERNS_MM = {
  solid:   null,
  dashed:  [1.5, 0.8],
  dotted:  [0.3, 0.5],
  dashDot: [1.5, 0.8, 0.3, 0.8],
};
```

---

## 5. 渲染逻辑

### 5.1 改造位置

`js/card-builder.js:89-99`（rect 分支内的 stroke 段）。

### 5.2 新逻辑

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
    const type = el.borderType || 'solid';
    const patternMm = BORDER_DASH_PATTERNS_MM[type];

    ctx.strokeStyle = el.borderColor || '#888888';
    ctx.lineWidth = Math.max(0.5, el.borderWidth * mmToPx);

    if (patternMm) {
      ctx.setLineDash(patternMm.map(mm => mm * mmToPx));
      ctx.lineCap = type === 'dotted' ? 'round' : 'butt';
      ctx.lineJoin = type === 'dotted' ? 'round' : 'miter';
    } else {
      ctx.setLineDash([]);    // 实线：清掉上一元素的 dash 设置
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
    }

    ctx.strokeRect(
      xPx + ctx.lineWidth / 2,
      yPx + ctx.lineWidth / 2,
      Math.max(0, wPx - ctx.lineWidth),
      Math.max(0, hPx - ctx.lineWidth)
    );
  }
}
```

### 5.3 关键点

- **setLineDash 重置**：每个 rect 处理完都设回 `[]`（实线分支），避免泄漏到 card-level border（始终实线）或下一个元素。
- **lineCap/lineJoin**：只对 `dotted` 用 `round`，让短划看起来像圆点；其他类型保持 butt/miter 以避免线条加粗。
- **向后兼容**：`el.borderType || 'solid'` —— 已有 rect 元素没这个字段也能渲染。

---

## 6. UI / DOM

在 `index.html` 的 `#prop-rect-dims` 内、**边框宽度 slider 之后**插入：

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

放在边框宽度之后，理由：边框宽度决定"画多粗"，边框类型决定"画成什么样"——宽度在前类型在后，符合从粗到细的认知顺序。

---

## 7. 接线（`js/card-editor.js`）

### 7.1 els 列表新增

```js
propBorderType: HTMLSelectElement,
```

### 7.2 新建 rect 元素默认 `borderType: 'solid'`

`js/card-editor.js:213-223`（`btnAddRect` 的 click handler）：

```js
elements.push({
  type: 'rect', id,
  x, y, width: w, height: h,
  borderWidth: 0.2,
  borderColor: '#888888',
  fillColor: '#ffffff',
  borderType: 'solid',  // ← 新增
  aspectLocked: true,
  _aspect: w / h,
});
```

### 7.3 input handler

在 `propBorderColor` handler 之后（约 line 469）添加：

```js
els.propBorderType.addEventListener('input', () => {
  const cur = elements.find(e => e.id === selectedId);
  if (!cur || cur.type !== 'rect') return;
  cur.borderType = els.propBorderType.value || 'solid';
  drawDesigner();
});
```

### 7.4 `renderProperties()` 的 rect 分支

`js/card-editor.js:518-537` 的 rect 分支末尾，添加：

```js
if (els.propBorderType) {
  els.propBorderType.value = el.borderType || 'solid';
}
```

---

## 8. 测试

### 8.1 单元测试（`tests/card-builder.test.js` 新增 4 个用例）

每个 `borderType` 一个用例。**断言策略**：用 `getImageData` 在边框路径上采样多个像素，比较"非白色像素数量"——

| 用例 | 期望 |
|---|---|
| `'solid'` | 与现状一致：4 条边像素连续非白 |
| `'dashed'` | 边框像素**少于** solid（虚线有间隙） |
| `'dotted'` | 边框像素**远少于** solid，且至少 2 个间隙 |
| `'dashDot'` | 边框像素少于 solid、模式与 dashed 不同 |

具体做法：在 rect 上边缘中心 1px 高的水平带上扫描，统计"非白像素"数量。dotted 因 dot 直径 ≈ lineWidth，dot 数最多但每段像素最少。给出量级断言（e.g., `dashed` 的非白像素数 < solid 的 50%）。

### 8.2 手动验证清单

- ✅ 添加 rect → 默认实线 → 切换 select 到虚线 → 边框变虚线
- ✅ 切换到点线 → 边框变小圆点
- ✅ 切换到点划线 → 边框变 dash-dot
- ✅ 切回实线 → 边框恢复正常（验证 setLineDash 重置生效）
- ✅ 已存在的卡片（无 borderType 字段）打开后渲染为实线（向后兼容）
- ✅ 边框宽度 = 0 时不画任何边框（与现状一致）
- ✅ 导出 JPG/PNG：边框类型保留

### 8.3 不动测试

- `tests/card-editor.test.js`：fake factory 不依赖完整 DOM，无需改
- `tests/layout-engine.test.js`、`tests/preview-renderer.test.js` 等：无 rect 字段依赖，不变

---

## 9. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `setLineDash` 泄漏到 card-level border | 实线分支主动 `setLineDash([])`；点测验证 card-level border 仍为实线 |
| dotted 在低 DPI 下 dots 变模糊 | pattern 按 mm 定义、按 dpi 缩放；dpi=150 时 dot 直径 ≈ 1.2px 仍可见 |
| 极小 rect（< 5mm）dash 模式错位 | 接受——dash 模式本身就是装饰，极小矩形用细实线更合适，用户可手动选 solid |
| 旧卡片无 `borderType` 字段 | `el.borderType || 'solid'` 兜底 |
| `<select>` 在手机端易误触 | 现有 UI 已大量使用 select（如 select-photo-size），一致体验 |

---

## 10. 验收标准

1. ✅ Rect 元素属性面板新增「边框类型」下拉框，含 4 个选项
2. ✅ 切换类型后设计画布实时反映新的边框样式
3. ✅ 导出图片保留边框类型
4. ✅ 已有 rect 元素（无 `borderType`）渲染为实线，零回归
5. ✅ Card-level border 始终实线，不受 rect 边框类型影响
6. ✅ 4 个单元测试通过，整套测试（64+4=68）全绿

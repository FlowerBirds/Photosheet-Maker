# 卡片排版方向与设计方向解耦 — 设计

**日期：** 2026-09-01
**目标版本：** Photosheet-Maker v2（卡片功能扩展）
**作者：** Brainstorming 协作产出

---

## 1. 目标与背景

Photosheet-Maker 卡片模式的当前实现：`card-orientation` radio 同时控制**设计方向**和**排版方向**——`getCardSize()` 直接 swap preset 的 w/h，所有下游（CardSourceItem 构造、layout-engine、preview-renderer、exporter）都使用这个 size。

**问题**：用户设计了一张 90×54mm（横向）的卡片，完成设计进入排版时，相纸可能放不下多张横向卡片（因为排版尺寸被设计方向锁死了）。用户希望：即使设计方向是横向，排版时可以切到纵向，让 layout 按纵向尺寸计算 cols/rows，最大化排版密度。

**目标：** 把现有的「设计方向」与「排版方向」解耦。新增独立的排版方向控件；默认 = 设计方向（向后兼容）；不同方向时在 drawImage 阶段旋转。

**非目标（YAGNI）：**
- 不改 SourceItem / CardSourceItem 接口（向后兼容）
- 不自动"取最大排版数"——用户主动选择方向
- 不影响 design canvas 内部布局（设计画布始终按设计方向画）

---

## 2. 用户决策摘要

| 决策点 | 选择 |
|---|---|
| 默认值 | 排版方向默认 = 设计方向 |
| 控件位置 | 卡片尺寸下方 |
| 旋转实现 | drawImage 时转换 canvas（不重新渲染 source） |
| 作用范围 | layout + 预览 + 导出 |

---

## 3. 架构与模块边界

### 3.1 接口契约

`SourceItem.size` 保持不变（**设计尺寸**）。新增一个纯函数 `arrangedSize(item, orient)` 返回**排版尺寸**：

```js
// 排版尺寸 = 设计的 w/h 是否被交换
function arrangedSize(item, orient) {
  const s = item.size;
  if (orient === 'portrait')  return { w: Math.min(s.w, s.h), h: Math.max(s.w, s.h) };
  if (orient === 'landscape') return { w: Math.max(s.w, s.h), h: Math.min(s.w, s.h) };
  return s;  // 默认 portrait
}
```

### 3.2 改动文件

| 文件 | 改动 |
|---|---|
| `index.html` | `#card-editor-section` 内尺寸 row 之后，新增 `arrange-orient-row`（横向/纵向 radio） |
| `js/card-editor.js` | 新增 `arrangeOrient` 内部状态；监听 radio change；新增 `setArrangementOrient(value)` 公共 API |
| `js/main.js` | 新增 `state.arrangeOrient = 'portrait'`；`setArrangementOrient` 调用 `cardEditor.setArrangementOrient` + `refresh`；切 tab 时 reset 到 portrait（或保留——见 §5） |
| `js/preview-renderer.js` | 新增 `arrangedSize(item, orient)`；`renderPreview` 接收 `arrangeOrient` 参数；layout 用 arranged size；drawImage 在方向不同时用 `ctx.rotate(π/2)` |
| `js/exporter.js` | 同 preview-renderer |
| `tests/preview-renderer.test.js` | 新增「排版旋转」用例 |

### 3.3 不变文件

- `js/source-item.js`、`js/card-builder.js`、`js/constants.js`、`js/layout-engine.js`、`js/crop-marks.js` 全部不变
- `js/card-editor.js` 不修改 `CardSourceItem` 构造路径（仍用 `getCardSize()`）

---

## 4. UI / DOM

新增 DOM（在 index.html 中，尺寸 row 之后）：

```html
<div class="arrange-orient-row">
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

视觉与现有的 `orient-row` 一致（共用 `.orient-row` 类名即可）。

---

## 5. 数据流

### 5.1 默认值

`card-editor.js` 初始化时读取 `getOrientation()` 作为 `arrangeOrient` 初始值。`main.js` 把 `state.arrangeOrient` 初始化为 portrait（兜底）。

### 5.2 切换排版方向

```
[user clicks "排版方向：纵向/横向" radio]
   ↓
card-editor.js: arrangeOrient = value
  ↓
setArrangementOrient(value) (公共 API)
  ↓
main.js: state.arrangeOrient = value
   ↓
refresh() → renderPreview(canvas, {..., arrangeOrient}, paperMap, sourceItems)
   ↓
preview-renderer.js:
  arrangedSize = arrangedSize(item, arrangeOrient)
  layout = calculateLayout(arrangedSize, paper, margin, gap)
  for each position:
    if designedSize === arrangedSize:
      ctx.drawImage(item.canvas, ..., arrangedSize.w, arrangedSize.h)
    else:
      ctx.save()
      ctx.translate(pos.x + arrangedSize.w, pos.y)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(item.canvas, 0, 0, designedSize.w, designedSize.h)
      ctx.restore()
```

### 5.3 切换设计方向（已有 radio）

`card-orientation` 改变时：
- `getCardSize()` 重新计算（已实现）
- `arrangeOrient` 自动跟随（reset = 新设计方向）—— 保证「默认 = 设计方向」不变量

### 5.4 切 tab

切到 PHOTO mode：`arrangeOrient` 保持（不重置）；切回 CARD mode：保持。理由：用户可能跨 tab 多次调整，不希望意外丢失设置。

---

## 6. drawImage 旋转的关键代码

```js
const designedSize = item.size;
const arrangedSize = arrangedSizeFn(item, params.arrangeOrient);
const drawW = arrangedSize.w * zoom;
const drawH = arrangedSize.h * zoom;

if (designedSize.w === arrangedSize.w && designedSize.h === arrangedSize.h) {
  // 方向一致：直接绘制
  ctx.drawImage(item.canvas, pos.x * scale, pos.y * scale, drawW * scale, drawH * scale);
} else {
  // 方向不一致：旋转 90° 绘制
  // 排版尺寸 (W, H) = 设计尺寸 (H, W)（交换）。源 canvas 是 (H, W)。
  // 我们要把源画到 (W, H) 的目标矩形里——旋转 90° 后正好。
  ctx.save();
  ctx.translate((pos.x + drawW) * scale, pos.y * scale);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(item.canvas, 0, 0, drawH * scale, drawW * scale);
  ctx.restore();
}
```

> 关键 insight：当排版尺寸 = 设计尺寸交换时，`drawImage(canvas, 0, 0, drawH, drawW)` 把源（h, w 像素）画到一个 `drawH × drawW`（即 w × h）的矩形里。源数据本身是横向的（w > h），但被拉伸后像素本身不变；经过 90° 旋转后视觉上变成纵向。

---

## 7. 测试

### 7.1 单元测试（`tests/preview-renderer.test.js`）

新增 3 个用例：

1. **`arrangedSize(item, 'portrait')` 把横向 item.size 转为纵向**
   - 设计 (90, 54) → 排版 (54, 90)
2. **`arrangedSize(item, 'landscape')` 把纵向 item.size 转为横向**
   - 设计 (54, 90) → 排版 (90, 54)
3. **`renderPreview` 在 arrangeOrient 与设计不同时使用 arrangedSize 算 layout**
   - 设计 (90, 54) source、 6 寸相纸 (102, 152) 排版方向 portrait
   - arrangedSize (54, 90) → 计算 layout 应为 cols=1, rows=1（因为 152/90=1.x）

### 7.2 手动验证清单

- ✅ 设计一张 90×54mm（横向）卡片 → 默认排版方向 = 横向 → 排版到 6 寸时 layout 与改动前一致
- ✅ 改成"排版方向 = 纵向" → 预览立即重排，count 变化
- ✅ 导出图片检查：纵排方向下卡片确实旋转 90°
- ✅ 切换到 PHOTO mode → 切回 CARD → arrangeOrient 保留
- ✅ 改动设计方向（portrait ↔ landscape）→ arrangeOrient 自动跟随

---

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| drawImage 旋转时的字体渲染 / 元素边缘可能模糊 | 用 `imageSmoothingEnabled = true` + `imageSmoothingQuality = 'high'`（已有） |
| 旋转后裁剪线位置不对 | `drawCropMarks` 接收 arrangedSize，按排版尺寸计算角标位置 |
| info-panel 显示与排版不一致 | 排版方向影响 layout.positions，进而影响 layout.count → info-panel 反映真实数量 |
| 设计方向频繁切换时 arrangeOrient 跟着切换造成混乱 | 文档化「跟随」行为；这是设计决策，不视为 bug |
| CardSourceItem 已有 rotation state（来自 photo-mode） | arrangeOrient 是 card-mode 专用，与 photo-mode 的 rotation 字段无冲突 |

---

## 9. 验收标准

1. ✅ 卡片模式新增"排版方向"控件（横/纵 radio）
2. ✅ 默认 = 设计方向；改设计方向时排版方向自动跟随
3. ✅ 排版方向 = 设计方向：行为与改动前一致（回归测试覆盖）
4. ✅ 排版方向 ≠ 设计方向：layout 用排版尺寸计算 cols/rows；drawImage 旋转绘制
5. ✅ 导出图片正确反映排版方向（旋转后的卡片）
6. ✅ 现有 photo-mode 流程零回归
7. ✅ 已有卡片功能零回归（裁剪、拖动、十字辅助线等）
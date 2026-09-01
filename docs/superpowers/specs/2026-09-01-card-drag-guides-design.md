# 卡片设计拖动辅助线 — 设计

**日期：** 2026-09-01
**目标版本：** Photosheet-Maker v2（卡片功能增强）
**作者：** Brainstorming 协作产出

---

## 1. 目标与背景

Photosheet-Maker 的卡片设计模式允许用户在卡片上拖动文字 / 图片元素（见 `2026-08-31-card-maker-design.md`）。**问题**：拖动时用户缺乏视觉参考，难以判断元素是否居中、是否对齐到卡片中线。

**目标：** 在拖动过程中显示两条虚线（水平中线 + 垂直中线），将卡片四等分，作为视觉参考。

**非目标（YAGNI）：**
- 不做磁吸（snap-to-center）—— 只作为参考
- 不做多条辅助线（如三等分、黄金分割）
- 不在 hover / 选中时显示
- 不影响导出（辅助线仅在设计画布显示，不进入最终卡片）

---

## 2. 用户决策摘要

| 决策点 | 选择 |
|---|---|
| 触发时机 | 仅拖动时显示 |
| 磁吸行为 | 不磁吸（仅视觉参考） |
| 视觉样式 | 细虚线 + 蓝色（#2d7ff9） |
| 应用范围 | 全部可拖动元素（文字 + 图片） |

---

## 3. 架构与改动边界

### 3.1 单一文件改动

`js/card-editor.js` —— 改动量最小（< 15 行）。

**不新增模块，不新增 DOM 元素，不新增 CSS**。

### 3.2 复用现有绘制流水线

`drawDesigner()` 在每次 `pointermove` 期间都会被调用（见 `js/card-editor.js:onCanvasPointerMove`），它已经重绘整张卡片。把辅助线绘制追加到流水线后部即可。

**触发条件：** `dragOffset !== null`（`card-editor.js:58` 已有的状态变量）。

### 3.3 改动文件

| 文件 | 改动 |
|---|---|
| `js/card-editor.js` | 新增 `drawDragGuides(ctx, scale)` 函数（约 8 行）；在 `drawDesigner()` 末尾追加一次条件调用 |
| `tests/card-editor.test.js` | 新增 1 个用例：拖动过程中辅助线绘制 API 被调用；非拖动时不被调用 |

---

## 4. 视觉规格

```
┌──────────────────────────┐
│            │             │
│            │             │
│────────────┼─────────────│   ← 水平虚线（穿过卡片中线）
│            │             │
│            │             │
└──────────────────────────┘
             ↑
        垂直虚线（穿过卡片中线）
```

| 属性 | 值 |
|---|---|
| 颜色 | `#2d7ff9`（与选中框同色） |
| 线宽 | `1`（px） |
| 线型 | 虚线 `[4, 4]` |
| 起点 | `(0, h/2)` ↔ `(w, h/2)` （水平）<br>`(w/2, 0)` ↔ `(w/2, h)` （垂直） |
| 绘制顺序 | 在 `drawSelectionOverlay` **之后**（虚线在选中框之上） |

---

## 5. 数据流

拖动期间的事件链（已有）：

```
pointerdown
  → dragOffset = { dx, dy }
  → renderElementList() + drawDesigner()        ← 触发辅助线绘制（dragOffset !== null）

pointermove (during drag)
  → 更新 el.x, el.y
  → drawDesigner()                              ← 辅助线持续重绘

pointerup
  → dragOffset = null
  → 下一次 drawDesigner() 不再画辅助线          （dragOffset === null）
```

辅助线绘制**仅依赖 `dragOffset`**，无新状态、无新事件。

---

## 6. 代码示例（新增部分）

```js
/**
 * Draw two dashed center guides across the card canvas.
 * Called only while dragOffset !== null (i.e. during a drag).
 */
function drawDragGuides(ctx, scale, dw, dh) {
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

在 `drawDesigner()` 末尾、`drawSelectionOverlay(ctx, scale)` **之后**追加：

```js
// Drag guides (center cross) — only while a drag is active.
if (dragOffset) drawDragGuides(ctx, scale, dw, dh);
```

---

## 7. 测试

### 7.1 单元测试（`tests/card-editor.test.js` 新增 1 个用例）

jsdom 不验证像素，只检查 ctx API 是否被调用：

1. **拖动时辅助线绘制被调用**
   - mock cardCanvas 的 ctx.setLineDash
   - 触发一次「添加文字 + 模拟 pointerdown」
   - 触发 pointermove（拖动过程）
   - 断言 `ctx.setLineDash` 被以 `[4, 4]` 调用过

2. **非拖动时不绘制辅助线**（回归）
   - 仅添加元素（不拖动）
   - 断言 `ctx.setLineDash` 不被调用

### 7.2 手动验证清单

- ✅ 添加文字元素 → 拖动 → 看到蓝色十字虚线
- ✅ 添加图片元素 → 拖动 → 看到蓝色十字虚线
- ✅ pointerup 后虚线消失
- ✅ 元素移动到中线附近时不磁吸（自由拖动）
- ✅ 虚线不影响最终卡片导出（按完成设计 → 导出图片，无虚线）

---

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 辅助线被元素遮挡看不见 | 绘制顺序在 `drawSelectionOverlay` 之后（最上层） |
| 拖动时重绘整张卡片的性能开销 | 卡片像素 < 1000px²，开销可接受；无需优化 |
| 误把虚线导出 | 辅助线只在 cardCanvas 显示，不进入 CardSourceItem（`card-builder.js` 渲染时不画）—— 已有隔离 |

---

## 9. 验收标准

1. ✅ 拖动文字 / 图片元素时，cardCanvas 上显示十字虚线
2. ✅ 虚线颜色 #2d7ff9，线型虚线
3. ✅ 拖动结束（pointerup）后虚线消失
4. ✅ 元素不磁吸（自由拖动）
5. ✅ 辅助线不出现在最终导出图片中
6. ✅ 现有卡片编辑器功能零回归
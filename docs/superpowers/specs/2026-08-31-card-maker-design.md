# 卡片制作功能设计

**日期：** 2026-08-31
**目标版本：** Photosheet-Maker v2
**作者：** Brainstorming 协作产出

---

## 1. 目标与背景

Photosheet-Maker 当前是浏览器端**单张证件照**排版到相纸的工具。本次新增**卡片制作功能**：

- 用户在工具内**简易设计**一张卡片（多字段文字 + 一张图片）
- **批量填充**多组数据，生成多张不同内容的卡片
- 和现有证件照流程一样**排版到 6 寸 / A4 等相纸**
- 导出为 JPG / PNG

**非目标（YAGNI）：**
- 不做二维码、纯色背景、模板库
- 不做精细排版（每个字段仅"字号档 + 颜色"两个属性）
- 不做图层/自由绘制

---

## 2. 用户决策摘要

| 决策点 | 选择 |
|---|---|
| 设计范围 | 简易编辑器（上传图片 + 文字字段） |
| 卡片元素 | 文字 + 图片（无二维码、无背景色） |
| UI 集成 | 顶部 tab 切换（"证件照" / "卡片"） |
| 字段模型 | 多个结构化字段，每字段可独立启用 |
| 架构方案 | 抽象 `SourceItem` 接口 |

---

## 3. 核心抽象：SourceItem

**新增 `js/source-item.js`：**

```js
export class SourceItem {
  /** @returns {{w:number, h:number}} 单个项目的目标物理尺寸（mm） */
  get size() { throw new Error('not implemented'); }

  /** @returns {HTMLCanvasElement} 渲染好的源画布（导出分辨率） */
  get canvas() { throw new Error('not implemented'); }
}
```

两种实现：

| 类 | 用途 | 构造 |
|---|---|---|
| `PhotoSourceItem` | 单张证件照 | 包装现有 `croppedCanvas`；`size` 来自 `PHOTO_SIZES[name]` |
| `CardSourceItem` | 一张设计卡 | 根据"字段配置 + 一行数据 + 图片"渲染 |

### 数据流

```
┌─ 证件照模式 ─┐         ┌─ 卡片模式 ─┐
│ 上传→裁剪    │         │ 字段配置    │
│              │         │ +批量数据行 │
└──────┬───────┘         └──────┬─────┘
       │                        │
       ▼                        ▼
  PhotoSourceItem          CardSourceItem[]
       │                        │
       └────[SourceItem[]]──────┘
                  │
                  ▼
       ┌──── layout-engine ────┐
       │ calculateLayout(size) │
       └───────────────────────┘
                  │
                  ▼
  ┌──── preview-renderer / exporter ────┐
  │ 按模式遍历绘制 SourceItem           │
  └─────────────────────────────────────┘
```

layout-engine 只看 `size`（mm）和 `canvas`，不感知内容来源。

### 绘制语义：重复 vs 单次（关键区分）

**证件照模式（单个 item）：** 同一个 `PhotoSourceItem` 填满相纸的所有 layout 位置——**每个位置重复绘制同一张源图**。

**卡片模式（多个 item）：** 每个 `CardSourceItem` **只出现一次**，按 layout 位置顺序依次摆放，不循环。

- `layout.positions[i]` 对应 `sourceItems[i]`（i < sourceItems.length）
- 若 `sourceItems.length < positions.length`：剩余位置**留空**（不绘制、不循环补位）
- 若 `sourceItems.length > positions.length`：超出的卡片**不被排版**，导出不包含

两个模式共用同一套 `SourceItem[]` 数据结构，由 `mode` 决定采用"重复"还是"单次"语义。

---

## 4. UI 布局与模式切换

### 顶部 tab

```
┌──────────────────────────────────────────────────┐
│ 📐 Photosheet-Maker │ [证件照] [卡片] │ 导出图片 │
└──────────────────────────────────────────────────┘
```

### 控制面板（两模式互斥显示，通过 `hidden` 切换）

**证件照 tab：** 完全不变
- ① 上传照片
- ② 裁剪与旋转
- ③ 排版设置（**共用**）

**卡片 tab：**
- 卡片尺寸（下拉：1寸 25×35 / 2寸 35×49 / 自定义 w×h mm）
- ① 字段配置（多组：标题/姓名/编号/备注/电话…；每组：启用勾选 + 标签 + 默认值 + 字号 + 颜色）
- ② 批量数据（多行 CSV，每行一张卡；空字段用默认值；实时显示"将生成 N 张卡"）
- ③ 图片（可选；**所有卡片共用同一张嵌入图**，居中、自动按卡片尺寸等比缩放；不提供每卡一图）
- ④ 排版设置（**共用同一组**）

预览 canvas 与导出按钮两种模式共用。

**裁剪线（crop-marks）：** 卡片是设计好的成品，**卡片模式强制关闭裁剪线**（忽略 `showCropMarks` 设置），避免在成品卡四周画出矩形角标。证件照模式保持现有行为。

### 模式切换实现

新增 `js/mode-tab.js`：
- 维护 `mode: 'PHOTO' | 'CARD'`
- 切到卡片模式：**销毁 cropper 实例**（保留 `croppedCanvas` 与 `originalImage`）
- 切到证件照模式：**恢复已有状态**——若 `croppedCanvas` 存在则直接回到 READY；若仅上传未裁剪，则重新初始化 cropper 回 CROPPING；否则回 INITIAL
- **切换不丢失裁剪结果**：`croppedCanvas`、`originalImage`、`rotation` 跨模式保留，避免来回切换需反复重新裁剪
- 状态机 `INITIAL / CROPPING / READY / EXPORTING` 保持不变；卡片模式跳过 CROPPING 直接进入 READY

---

## 5. 字段编辑器与批量数据

### 字段配置 UI

```
┌──────────────────────────────────────────────┐
│ 字段配置                       [＋]          │
├──────────────────────────────────────────────┤
│ [✓] 标题  默认值: ________ 字号:[大▼] [↑][↓]│
│ [✓] 姓名  默认值: ________              [↑][↓]│
│ [✓] 编号  默认值: ________              [↑][↓]│
│ [✓] 备注  默认值: ________              [↑][↓]│
│ [ ] 电话  默认值: ________              [↑][↓]│
│                                        [删]  │
└──────────────────────────────────────────────┘
```

- 每行右侧 `[↑][↓]`：调整字段顺序 = 调整 CSV 列顺序（本版本用上下箭头按钮，不做拖拽手柄）
- `[＋]` 追加字段，`[删]` 删除当前字段行

### 批量数据输入

```
┌──────────────────────────────────────────────────┐
│ 批量数据   提示：每行一张卡，空字段用默认值      │
├──────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────┐   │
│ │ 张三, A001, 2024-01-01                     │   │
│ │ 李四, A002, 2024-01-02                     │   │
│ │ 王五, A003, 2024-01-03                     │   │
│ └────────────────────────────────────────────┘   │
│ 共 3 行 → 将生成 3 张卡片                       │
└──────────────────────────────────────────────────┘
```

**列数匹配规则：** 字段顺序 = CSV 列顺序。解析每一行时：
- 某字段在行内无对应列（行内列数不足）→ 该字段用默认值
- 行内列数超出字段数 → 多余列忽略
- 空行跳过，不计入生成卡片数

编辑器任何变更 → 重新解析数据行 → 重新渲染所有 `CardSourceItem.canvas` → 触发 preview-renderer 重绘。**debounce 200ms**。

### CardSourceItem 渲染（伪代码）

```js
render(ctx, fields, rowValues, imageCanvas) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  if (imageCanvas) drawImageCentered(imageCanvas);
  let y = marginTop;
  for (const field of fields.filter(f => f.enabled)) {
    const text = rowValues[field.label] ?? field.default;
    ctx.font = SIZE_PRESET[field.size];   // 大/中/小 三档
    ctx.fillStyle = field.color;
    ctx.fillText(text, marginLeft, y);
    y += lineHeight;
  }
}
```

字号三档：大（卡片高 × 0.12）/ 中（×0.07）/ 小（×0.05），常量定义在 `constants.js` 的 `CARD_FONT_SIZE_RATIO`。

**卡片 canvas 分辨率（关键）：** 每张卡片的 `canvas` 按"**卡片 mm × 目标 dpi**"生成，与相纸导出 dpi 一致。

```
canvasW = round(card.w * dpi / 25.4)
canvasH = round(card.h * dpi / 25.4)
```

- `dpi` 取当前设置的输出 DPI（350 / 300 / 150 / 600）
- 导出时该卡片以 **1:1 原尺寸** `drawImage` 到对应位置，无需缩放，避免缩采样失真
- 内存保护：单卡分辨率上限 **1500×1500 px**。若某张卡按目标 dpi 计算超出上限，则整批卡统一降为 `1500 / max(card.w, card.h) × 25.4` dpi（取整），保证所有卡分辨率一致、按同一 dpi 放置时比例正确。所有卡使用**同一 dpi 常量**，不可每卡不同。

> 注：卡片尺寸 25×35mm 在 600dpi 下约 591×827px，正常范围内不会触顶；上限主要防御超大自定义尺寸。

---

## 6. layout-engine / preview-renderer / exporter 改造

### `calculateLayout(sourceSize, paper, margin, gap)`

`sourceSize = { w, h }`——任意 SourceItem 的 size。**算法不变**。

### `renderPreview(canvas, params, paperMap, sourceItems)`

- 不再需要 `photoMap`（size 取自 `sourceItems[0].size`）
- 内部按**绘制语义**遍历（见 §3）：
  - 证件照模式：对每个 position 重复绘制 `sourceItems[0]`
  - 卡片模式：`sourceItems[i]` 只放一次，`i >= sourceItems.length` 的位置留空

### `exportImage` 同上

接受 `sourceItems`，按同样语义遍历绘制。

### info-panel 文案

- 证件照：`容纳 N 张 · 输出 W×H px @ DPI`
- 卡片：`共 N 张卡 · 容纳 M 张/相纸 · 输出 W×H px @ DPI`
- `M = layout.count`（相纸能容纳的位置数）；`N = sourceItems.length`（卡片数）

### 错误处理与边界

1. 字段全部禁用 / 数据为空 → 禁用导出按钮 + 提示"请至少启用一个字段并填写数据"
2. **卡片数 N > 相纸容纳数 M**：导出按钮不阻塞（用户可能本就只想排前 M 张），但 info-panel 追加警告"有 N−M 张卡超出相纸容纳范围，未排版"。同时提供快捷跳转到"卡片尺寸/相纸尺寸"设置的提示。
3. **卡片数 N < 相纸容纳数 M**：剩余位置留空，无警告。

---

## 7. 文件清单

### 新增

| 文件 | 估计行数 | 职责 |
|---|---|---|
| `js/source-item.js` | ~30 | SourceItem 接口 + PhotoSourceItem |
| `js/card-builder.js` | ~150 | CardSourceItem + 字段渲染 |
| `js/card-editor.js` | ~250 | 字段配置 + 批量数据 + 图片上传 UI |
| `js/mode-tab.js` | ~60 | tab 切换 + 模式状态 |

### 修改

| 文件 | 改动 |
|---|---|
| `js/constants.js` | 新增 `CARD_FIELD_DEFAULTS`、`DEFAULT_CARD_SIZE`、字号三档常量 |
| `js/layout-engine.js` | 函数签名：`photo` → `sourceSize` |
| `js/preview-renderer.js` | 接受 `sourceItems`；参数减少 `photoMap` |
| `js/exporter.js` | 同上 |
| `js/main.js` | 根据 mode 装载 `SourceItem[]` |
| `index.html` | 加 tab + 卡片编辑器 DOM |
| `css/style.css` | tab 样式 + 卡片编辑器布局 |
| `js/config-panel.js` | 排版设置字段提取为共用（基本不动） |

### 测试

| 文件 | 用途 |
|---|---|
| `tests/source-item.test.js` | PhotoSourceItem.size 正确 |
| `tests/card-builder.test.js` | 字段 + 数据行渲染输出尺寸正确、文字存在；canvas 分辨率 = 卡片 mm × dpi |
| `tests/card-parser.test.js` | 批量数据解析：列数不足用默认值、列数超出忽略、空行跳过 |
| `tests/layout-engine.test.js` | 增加"接收任意 size"用例 |

---

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| layout-engine 算法改动 | 现有测试覆盖；算法不变，只是参数名变化 |
| preview-renderer / exporter 是数据关键点 | 端到端手动验证两模式 |
| 模式切换让状态机复杂 | 两模式独立状态路径，不共享中间态 |
| Canvas 性能（多张高 DPI 卡） | 单卡分辨率上限 1500×1500 px；超限按比例统一降 dpi（见 §5） |

---

## 9. 验收标准

1. ✅ 顶部 tab 切换流畅，控制面板按 tab 切换显示
2. ✅ 卡片模式下，启用 3 个字段、输入 5 行数据 → 生成 5 张不同卡片 → 铺到 A4 上
3. ✅ 卡片导出 JPG / PNG 后能在冲印店正常打印
4. ✅ 卡片模式可上传嵌入图片，导出图片清晰
5. ✅ 现有证件照流程零回归（手工 + 自动测试）
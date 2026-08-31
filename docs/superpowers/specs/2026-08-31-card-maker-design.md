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
  │ 遍历 positions，drawImage(items[i%n])│
  └─────────────────────────────────────┘
```

layout-engine 只看 `size`（mm）和 `canvas`，不感知内容来源。

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
- ③ 图片（可选；居中嵌入；自动按卡片尺寸等比缩放）
- ④ 排版设置（**共用同一组**）

预览 canvas 与导出按钮两种模式共用。

### 模式切换实现

新增 `js/mode-tab.js`：
- 维护 `mode: 'PHOTO' | 'CARD'`
- 切到卡片模式：销毁 cropper，重置 croppedCanvas
- 切到证件照模式：还原照片状态
- 状态机 `INITIAL / CROPPING / READY / EXPORTING` 保持不变；卡片模式跳过 CROPPING 直接进入 READY

---

## 5. 字段编辑器与批量数据

### 字段配置 UI

```
┌──────────────────────────────────────────┐
│ 字段配置                       [＋]      │
├──────────────────────────────────────────┤
│ [✓] 标题  默认值: __________ 字号:[大▼] │
│ [✓] 姓名  默认值: __________              │
│ [✓] 编号  默认值: __________              │
│ [✓] 备注  默认值: __________              │
│ [ ] 电话  默认值: __________              │
│                              [删]         │
└──────────────────────────────────────────┘
```

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

### 渲染时序

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

字号三档：大 (卡片高 × 0.12) / 中 (×0.07) / 小 (×0.05)，具体在实现时定常量。

---

## 6. layout-engine / preview-renderer / exporter 改造

### `calculateLayout(sourceSize, paper, margin, gap)`

`sourceSize = { w, h }`——任意 SourceItem 的 size。**算法不变**。

### `renderPreview(canvas, params, paperMap, sourceItems)`

- 不再需要 `photoMap`（size 取自 `sourceItems[0].size`）
- 内部循环改为 `sourceItems[i % sourceItems.length]`

### `exportImage` 同上

接受 `sourceItems`，遍历绘制。

### info-panel 文案

- 证件照：`容纳 N 张 · 输出 W×H px @ DPI`
- 卡片：`共 N 张卡 · 容纳 M 张/相纸 · 输出 W×H px @ DPI`
- `M = layout.count`；`N = sourceItems.length`

### 错误处理

字段全部禁用 / 数据为空 → 禁用导出按钮 + 提示"请至少启用一个字段并填写数据"。

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
| `tests/card-builder.test.js` | 字段 + 数据行渲染输出尺寸正确、文字存在 |
| `tests/layout-engine.test.js` | 增加"接收任意 size"用例 |

---

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| layout-engine 算法改动 | 现有测试覆盖；算法不变，只是参数名变化 |
| preview-renderer / exporter 是数据关键点 | 端到端手动验证两模式 |
| 模式切换让状态机复杂 | 两模式独立状态路径，不共享中间态 |
| Canvas 性能（多张高 DPI 卡） | 单卡渲染分辨率限制在 600dpi 上限 |

---

## 9. 验收标准

1. ✅ 顶部 tab 切换流畅，控制面板按 tab 切换显示
2. ✅ 卡片模式下，启用 3 个字段、输入 5 行数据 → 生成 5 张不同卡片 → 铺到 A4 上
3. ✅ 卡片导出 JPG / PNG 后能在冲印店正常打印
4. ✅ 卡片模式可上传嵌入图片，导出图片清晰
5. ✅ 现有证件照流程零回归（手工 + 自动测试）
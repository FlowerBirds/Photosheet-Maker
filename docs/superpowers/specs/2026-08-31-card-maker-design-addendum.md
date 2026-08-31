# 卡片制作功能 — 设计补充（方向调整）

**日期：** 2026-08-31
**性质：** 增量规范，**取代**原规范中关于"字段配置 + 批量 CSV"的部分

---

## 1. 方向调整

原规范 §5（字段编辑器 + 批量数据）由 **WYSIWYG 拖拽设计器 + 重复排列** 取代。

**调整后流程：**
1. 用户进入卡片 tab → 默认 **设计模式**
2. 在卡片画布上**自由添加**文本和图片元素，**拖动**调整位置
3. 点 **「完成设计」** → 进入 **排版模式**，同一张卡片被**重复填满**相纸（与证件照模式同 semantics）
4. 排版模式下点 **「重新设计」** → 回到设计模式（保留所有元素）

**砍掉：**
- 字段配置 UI
- 批量数据 / CSV 解析
- `card-parser.js`（删除）
- CardSourceItem 内部基于"字段 + 行"的渲染逻辑

**保留：**
- `SourceItem` / `PhotoSourceItem` 接口
- `CardSourceItem` 类（改用 elements 列表驱动）
- layout-engine / crop-marks / preview-renderer / exporter
- 顶部 tab 切换 + 状态保留
- 相纸 / DPI / 边距 / 间距 / 缩放 / 裁剪线设置
- `computeCardDpi`（单卡 dpi 上限保护）
- 重复填充语义（drawing = 'repeat'）

---

## 2. 元素数据模型

```js
/** 单个文本元素 */
ElementText = {
  type: 'text',
  id: string,
  text: string,
  fontSize: number,    // mm
  x: number, y: number, // mm，相对于卡片左上角
  color: string,        // #RRGGBB
}

/** 单个图片元素 */
ElementImage = {
  type: 'image',
  id: string,
  src: HTMLCanvasElement, // 已加载的源图
  x: number, y: number,   // mm
  w: number, h: number,   // mm（图片默认按原比例；超出卡片边界自动夹紧）
}

/** 卡片设计 = 一组元素 */
CardDesign = {
  size: { w: number, h: number },  // mm
  elements: Array<ElementText | ElementImage>,
}
```

**约束：**
- 元素坐标 (x, y) 单位是 **mm**，相对卡片左上角
- 图片元素初始 `w/h` 按"卡片高度×0.4"等比缩放，保持原比例
- 元素可被拖到卡片外（保留坐标），但裁剪/导出时只渲染卡片内的部分

---

## 3. 两模式状态机

```
INITIAL ──(进入卡片 tab)──▶ DESIGNING ──(点"完成设计")──▶ ARRANGING
                              ▲                              │
                              └────(点"重新设计")────────────┘
```

- `DESIGNING` → 卡片画布上交互；侧栏显示元素列表
- `ARRANGING` → 相纸预览；侧栏显示排版设置
- `ARRANGING` → sourceItems = `[CardSourceItem]`（1 项，重复铺）

---

## 4. 设计模式 UI

```
┌─────────────────┬────────────────────────────┐
│ 设计（侧栏）    │  卡片画布                  │
│                 │                           │
│ + 添加文本      │   ┌─────────────┐          │
│ + 添加图片      │   │             │          │
│                 │   │   [文本]    │  ← 可拖  │
│ 元素列表：      │   │             │          │
│ ▢ 标题 [编辑]×  │   │  [图片]     │          │
│ ▢ 头像 [编辑]×  │   └─────────────┘          │
│                 │                           │
│ [完成设计]      │                           │
└─────────────────┴────────────────────────────┘
```

- 添加文本：按钮 → 居中创建 text 元素，进入编辑态
- 添加图片：按钮 → file picker → 加载后居中创建 image 元素
- 元素列表项：勾选切换显示、点击选中、删除按钮
- 选中元素：画布上画蓝色虚线框，可拖动
- 点空白处取消选中

---

## 5. 排版模式 UI

```
┌─────────────────┬────────────────────────────┐
│ 排版设置        │   相纸预览                 │
│ (与证件照共用)  │                           │
│                 │   ┌──────────────────┐    │
│ 相纸尺寸 [6寸▼] │   │ [卡][卡][卡]    │    │
│ 输出 DPI [350▼] │   │ [卡][卡][卡]    │    │
│ 边距 ...        │   │ [卡][卡][卡]    │    │
│ 间距 ...        │   │                  │    │
│ 缩放 ...        │   └──────────────────┘    │
│ [裁剪线]        │                            │
│ [重新设计]      │                            │
└─────────────────┴────────────────────────────┘
```

---

## 6. CardSourceItem 新渲染逻辑

```js
renderCardCanvas(cardSize, dpi, elements, imageCanvas) {
  // 白底
  // 按 z-order（数组顺序）依次绘制每个元素：
  //   text  → ctx.fillText at (x, y) in mm, font = fontSize*mmToPx
  //   image → ctx.drawImage scaled to (w, h) mm at (x, y)
  // 元素坐标超出卡片边界部分自然裁剪
}
```

元素不带 z-index 字段——数组顺序即 z-order。新加的在最上层。

---

## 7. 拖动实现

卡片画布绑定：

- `pointerdown` on element → 记录 offset，进入 dragging
- `pointermove` → 更新 element.x/y（mm 坐标系）
- `pointerup` → 结束 dragging

坐标系转换：
```js
const rect = canvas.getBoundingClientRect();
const mmToPx = dpi / 25.4;
const pxPerMm = rect.width / cardSize.w;
// mouse px relative to canvas top-left
const mmX = (mousePx - rect.left) / pxPerMm;
```

设计模式下 canvas 大小按卡片 mm × 预览缩放比例显示（不是 1:1 mm）。拖动时通过上述转换保证最终落点是 mm。

---

## 8. 删除旧文件

- `js/card-parser.js` — 删除
- `tests/card-parser.test.js` — 删除

---

## 9. 测试覆盖

- `card-builder.test.js`：
  - elements 列表渲染输出尺寸正确
  - text 元素绘制后图像有非白像素
  - image 元素按 mm 尺寸绘制
- `card-editor.test.js`（新增）：
  - 添加文本/图片 → 元素数组长度 + 1
  - 删除元素 → 数组移除
  - 拖动 → x/y 更新

---

## 10. 验收标准

1. ✅ 进入卡片 tab → 默认进入设计模式，画布空白
2. ✅ 添加文本 / 图片元素 → 出现在画布上
3. ✅ 拖动元素 → 位置实时跟随
4. ✅ 删除元素 → 从画布和列表移除
5. ✅ 点「完成设计」→ 切到排版模式，相纸上重复显示该卡片
6. ✅ 导出 JPG/PNG → 相纸上多张相同卡片
7. ✅ 点「重新设计」→ 回到设计模式，元素全部保留
8. ✅ 切换到证件照 tab → 不影响卡片元素
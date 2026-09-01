# 卡片选中元素属性区域 — 设计

**日期：** 2026-09-01
**目标版本：** Photosheet-Maker v2（卡片功能增强）
**作者：** Brainstorming 协作产出

---

## 1. 目标与背景

Photosheet-Maker 卡片设计模式中，元素的大小调整通过 elementList 行内的 `<input type="number">` 实现（文字字号、图片宽高）。**问题**：在手机模式下，数字输入需要点击小箭头或弹键盘，操作不便；用户希望用滑块（slider）调整。

**目标：** 新增独立的「属性区域」面板，使用 range slider 调整当前选中元素的大小属性；完全移除 elementList 里的 number input。

**非目标（YAGNI）：**
- 不显示坐标 (x, y)
- 不显示颜色
- 不改滑块范围与步长（复用现有 number input 的取值）
- 不引入拖拽调整（手机端靠滑块足够）

---

## 2. 用户决策摘要

| 决策点 | 选择 |
|---|---|
| 与 elementList 关系 | 完全替换（移除 number input） |
| 属性范围 | 仅尺寸（字号 / 宽高 + 比例锁） |
| 滑块参数 | 复用现有（字号 2-40 step 0.5；宽高 1-200 step 0.5） |
| 显示条件 | 选中才显示 |

---

## 3. 架构与模块边界

### 3.1 改动文件

| 文件 | 改动 |
|---|---|
| `index.html` | 在 `#card-design-phase` 内、`elementList` 之后，新增 `<section id="card-properties-section" hidden>` |
| `js/card-editor.js` | 新增 `renderProperties()` 函数 + 属性 slider input handlers；移除 elementList 里的 number input / size-wrap / dim-wrap / lockBtn 控件 |
| `css/style.css` | 新增 `#card-properties-section` 样式（复用 `.slider-row` 类） |

### 3.2 不变文件

- `js/source-item.js`、`js/card-builder.js`、`js/constants.js`、`js/layout-engine.js` 不变
- `js/main.js` 不变（属性面板不需要新的全局状态）

---

## 4. UI / DOM

新增 DOM：

```html
<section class="card" id="card-properties-section" hidden>
  <h2>属性</h2>

  <!-- 文字元素：仅字号 -->
  <div class="slider-row" id="prop-font-size" hidden>
    <label for="prop-font-size-input">字号</label>
    <input type="range" id="prop-font-size-input" min="2" max="40" step="0.5" />
    <span class="slider-value" id="prop-font-size-val"></span>
  </div>

  <!-- 图片元素：宽 / 高 / 锁 -->
  <div id="prop-image-dims" hidden>
    <div class="slider-row">
      <label for="prop-w-input">宽</label>
      <input type="range" id="prop-w-input" min="1" max="200" step="0.5" />
      <span class="slider-value" id="prop-w-val"></span>
    </div>
    <div class="slider-row">
      <label for="prop-h-input">高</label>
      <input type="range" id="prop-h-input" min="1" max="200" step="0.5" />
      <span class="slider-value" id="prop-h-val"></span>
    </div>
    <div class="aspect-row">
      <button id="prop-aspect-toggle" class="btn-secondary aspect-toggle">🔗</button>
      <span class="hint">锁定比例</span>
    </div>
  </div>
</section>
```

`#card-properties-section` 放在 `#card-element-list` 之后，保证选中元素时面板出现在列表下方。

---

## 5. 数据流

### 5.1 选中变化

```
[selectedId 变化 / drawDesigner]
   ↓
renderProperties()
   ↓
section.hidden = (selectedId === null)
   ↓
if (el.type === 'text'):
  prop-font-size.hidden = false; prop-image-dims.hidden = true
  slider.value = el.fontSize
  val.text = el.fontSize + ' mm'
elif (el.type === 'image'):
  prop-font-size.hidden = true; prop-image-dims.hidden = false
  w-slider.value = el.w; h-slider.value = el.h
  lockBtn.textContent = el.aspectLocked ? '🔗' : '🔓'
```

### 5.2 用户调字号

```
[字号 slider input]
   ↓
el.fontSize = clamp(v, 2, 40)
   ↓
val.text = el.fontSize + ' mm'
   ↓
drawDesigner()
```

### 5.3 用户调宽 / 高

```
[宽 slider input]
   ↓
el.w = clamp(v, 1, 200)
if (el.aspectLocked):
  el.h = el.w / el._aspect
  h-slider.value = round1(el.h); h-val.text = round1(el.h)
   ↓
drawDesigner()
```

高 slider 同理（镜像更新 w）。

### 5.4 比例锁切换

```
[🔗 click]
   ↓
el.aspectLocked = !el.aspectLocked
if (el.aspectLocked):
  el._aspect = el.w / el.h || 1
   ↓
renderProperties()  // 更新锁图标
```

---

## 6. elementList 改动（移除）

`renderElementList()` 中删除以下代码（`js/card-editor.js`）：

- 文字元素：`sizeWrap` 创建（`<input type="number">` for fontSize）
- 图片元素：`lockBtn`、`wInput`、`hInput`、`dimWrap`

保留：
- 每行的「选中标签」「删除按钮」

新的 elementRow 结构：

```
[标签：文本/图片]    [×]
```

---

## 7. 测试

### 7.1 单元测试（`tests/card-editor.test.js` 新增 4 个用例）

1. **未选中时属性面板隐藏**
2. **选中文字元素：字号 slider 显示并反映 fontSize**
3. **选中图片元素：宽 / 高 slider 显示并反映 w / h；锁按钮反映 aspectLocked**
4. **拖动字号 slider：fontSize 更新 + drawDesigner 被调**
5. **拖动图片宽 slider（aspectLocked=true）：w 更新 + h 镜像更新 + drawDesigner 被调**
6. **切换锁按钮：aspectLocked 取反 + _aspect 被更新**
7. **切换选中元素（text → image）：面板内容切换**

### 7.2 手动验证清单

- ✅ 添加文字 → 选中 → 属性面板出现「字号」slider → 拖动 slider，文字实时变化
- ✅ 添加图片 → 选中 → 属性面板出现「宽/高」slider + 锁按钮 → 拖动宽 slider，元素按锁定比例变化
- ✅ 切到不同元素 → 面板内容刷新
- ✅ 取消选中（点空白处）→ 面板隐藏
- ✅ 手机模式：滑块易用

---

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| slider 拖动频率高导致 drawDesigner 频繁调用 | 卡片尺寸小（< 1000px²），drawDesigner 开销可接受；不加 debounce |
| 比例锁 `_aspect` 未初始化 | 选中时检查 `el._aspect = el.w / el.h || 1` |
| 移除 number input 破坏现有拖动逻辑 | 拖动逻辑只依赖 `el.x, el.y, el.w, el.h, el.fontSize` 这些字段，与控件无关 |

---

## 9. 验收标准

1. ✅ 选中文字元素时，属性面板显示字号 slider
2. ✅ 选中图片元素时，属性面板显示宽/高 slider + 锁按钮
3. ✅ 拖动 slider 实时调整元素大小
4. ✅ 比例锁切换有效，镜像更新另一维度
5. ✅ elementList 不再含 number input
6. ✅ 现有卡片功能零回归（拖动、十字辅助线、裁剪、排版方向等）
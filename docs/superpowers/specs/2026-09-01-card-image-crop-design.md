# 卡片添加图片时增加裁剪功能 — 设计

**日期：** 2026-09-01
**目标版本：** Photosheet-Maker v2（卡片功能扩展）
**作者：** Brainstorming 协作产出

---

## 1. 目标与背景

Photosheet-Maker 的卡片设计模式目前允许用户上传一张图片嵌入卡片（详见 `2026-08-31-card-maker-design.md`）。**问题**：原始上传的图片常常包含过多背景、尺寸过大或主体居中不正，直接放进卡片会浪费版面、影响任务展示。

**目标：** 在卡片模式下添加图片时，强制让用户先对图片进行裁剪，再作为元素放入卡片。

**非目标（YAGNI）：**
- 不支持已添加图片的"再次裁剪"（要改只能删除后重新上传）
- 不做固定比例（裁剪框为自由比例）
- 不修改 photo-mode 的裁剪面板

---

## 2. 用户决策摘要

| 决策点 | 选择 |
|---|---|
| 触发时机 | 每次添加图片都裁剪 |
| 裁剪比例 | 自由（不锁定） |
| 界面形式 | 侧栏内联（不弹窗、不覆盖预览区） |
| 再次裁剪 | 不需要 |
| 旋转支持 | 需要（左右旋转按钮） |
| 复用 photo-mode 的 `#crop-section` | 否（避免模式状态污染） |

---

## 3. 架构与模块边界

### 3.1 新增模块 `js/card-cropper.js`

薄包装，封装 Cropper.js 在卡片场景下的最小用法。**不复用** `js/cropper-wrapper.js`，原因：

- `cropper-wrapper.js` 的 API 假设有"目标比例"（`init({ aspectRatio })`），与卡片裁剪的"自由比例"语义不匹配
- 两者的生命周期不同：photo-mode 是「裁剪 → 产出最终证件照」；card-mode 是「裁剪 → 中间步骤 → 嵌入卡片元素」
- 复制一份 ~30 行的薄包装比让 `cropper-wrapper.js` 同时承载两套语义更稳

```js
// js/card-cropper.js
export function createCardCropper(imgEl) {
  let cropper = null;

  return {
    /** Initialize Cropper.js on the given <img>. Idempotent. */
    init() {
      if (cropper) this.destroy();
      cropper = new Cropper(imgEl, {
        viewMode: 1,
        autoCropArea: 0.8,
        movable: true,
        scalable: true,
        zoomable: true,
        rotatable: true,
        responsive: true,
        // No aspectRatio → free crop box.
      });
    },

    /** Rotate the underlying image by `degrees` (CW positive). */
    rotate(degrees) {
      if (cropper) cropper.rotate(degrees);
    },

    /**
     * Produce the cropped output canvas.
     * @returns {HTMLCanvasElement|null}
     */
    getCroppedCanvas() {
      if (!cropper) return null;
      return cropper.getCroppedCanvas({
        fillColor: '#ffffff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });
    },

    /** Tear down the Cropper instance. */
    destroy() {
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }
    },

    isActive() { return cropper !== null; },
  };
}
```

### 3.2 改动文件

| 文件 | 改动 |
|---|---|
| `index.html` | 新增 `#card-crop-section` DOM（独立于 `#crop-section`）；结构与 photo-mode 的裁剪面板同构 |
| `css/style.css` | 新增 `#card-crop-section` 样式，复用 `.crop-container` / `.crop-actions` 类名 |
| `js/card-editor.js` | 新增裁剪状态机；`imageInput.change` 改为先进入裁剪状态；新增 `completeCrop()` / `cancelCrop()` 内部方法 |
| `js/mode-tab.js` | 切到 photo-mode 时调用 `cancelCrop()`（如有遗留实例则销毁） |

---

## 4. UI 与 DOM 结构

### 4.1 `#card-crop-section`（新增）

放在 `#card-editor-section` 内 `#card-design-phase` **之上**——裁剪是添加图片的前置步骤，UX 上应先看见面板。

```html
<section class="card" id="card-crop-section" hidden>
  <h2>裁剪图片</h2>
  <div class="crop-container">
    <img id="card-crop-img" alt="待裁剪图片" />
  </div>
  <div class="crop-actions">
    <button id="btn-card-crop-rotate-left"  class="btn-secondary">↺ 左旋转</button>
    <button id="btn-card-crop-rotate-right" class="btn-secondary">↻ 右旋转</button>
    <button id="btn-card-crop-finish"       class="btn-primary">完成裁剪</button>
    <button id="btn-card-crop-cancel"       class="btn-secondary">取消</button>
  </div>
</section>
```

### 4.2 互斥显示

| 模式 | `#crop-section`（photo） | `#card-crop-section`（card） |
|---|---|---|
| photo-mode | 显示/隐藏由 photo-mode 自身管 | 隐藏 |
| card-mode | 隐藏 | 显示/隐藏由 card-editor 管 |

两者通过 `hidden` 属性切换，互斥。

---

## 5. 数据流

### 5.1 状态机

```
(card-editor idle, phase='designing')
   │
   │ click "+ 添加图片" → click hidden file input
   ▼
[file input change] → loadImage(file) → srcImgEl
   │
   ▼
(card-editor cropping)
   │ • #card-crop-section 显示
   │ • #card-crop-img.src = canvas.toDataURL()（把 loadImage 返回的 canvas 转 dataURL 喂给 Cropper.js）
   │ • cropper.init()
   │
   ├─── "完成裁剪" click ───┐
   │                        │
   │                        ▼
   │            cropper.getCroppedCanvas()
   │                        │
   │                        ▼
   │            elements.push({ type:'image', src, ... })
   │            drawDesigner()
   │                        │
   │                        ▼
   │            cropper.destroy()
   │            #card-crop-img.src = ''（释放 dataURL 内存）
   │            #card-crop-section hidden
   │            imageInput.value = ''
   │                        │
   │                        ▼
   (card-editor idle, new image element selected)
   │
   └─── "取消" click / 切 tab ───┐
                                  │
                                  ▼
                       cropper.destroy()
                       #card-crop-img.src = ''
                       #card-crop-section hidden
                       imageInput.value = ''
                                  │
                                  ▼
                       (card-editor idle, 无新元素)
```

### 5.2 完成裁剪后的图片元素构造

与 `card-editor.js` 现有逻辑**完全同构**——`src` 字段从「`loadImage` 返回的 canvas」改为「`cropper.getCroppedCanvas()` 返回的 canvas」：

```js
const cropped = els.cropper.getCroppedCanvas();
if (!cropped) {
  showToast('请先调整裁剪框');
  return;
}
const srcW = cropped.width;
const srcH = cropped.height;
const cardSize = getCardSize();
const maxH = cardSize.h * 0.4;
const maxW = cardSize.w * 0.6;
const scale = Math.min(maxW / srcW, maxH / srcH);
const w = srcW * scale;
const h = srcH * scale;
elements.push({
  type: 'image', id,
  src: cropped,
  x: (cardSize.w - w) / 2,
  y: (cardSize.h - h) / 2,
  w, h,
  aspectLocked: true,
  _aspect: w / h,
});
selectedId = id;
renderElementList();
drawDesigner();
```

---

## 6. 错误处理

| 场景 | 行为 |
|---|---|
| 用户选择的文件非图片 / 加载失败 | 复用 `card-editor.js` 内部 `loadImage` 的 `onerror` / `naturalWidth` 校验（保持现状，不引入新校验逻辑） |
| Cropper.js 未加载（CDN 失败） | 不做运行时检测；Cropper.js 已通过 CDN 全局加载 |
| `getCroppedCanvas()` 返回 null（裁剪框未就绪） | toast 提示「请先调整裁剪框」 |
| 切换 tab 时正在裁剪（无论从 card→photo 还是 photo→card 方向） | `cancelCrop()` 静默销毁；不弹窗、不入栈 |
| 重复选择同一文件 | `imageInput.value = ''` 让下次 change 仍能触发 |

---

## 7. 测试

### 7.1 单元测试（`tests/card-editor.test.js` 新增用例）

由于 Cropper.js 依赖真实 DOM 尺寸，测试只检查**状态变化**，不验证像素输出：

1. **添加图片 → 裁剪面板出现**
   - mock `cropper.init` 验证被调用
   - 断言 `#card-crop-section.hidden === false`
2. **完成裁剪 → 元素新增**
   - mock `cropper.getCroppedCanvas` 返回固定 canvas
   - 断言 `elements.length` 增加；新增元素的 `src` 等于返回的 canvas
   - 断言 `#card-crop-section.hidden === true`
   - 断言 `cropper.destroy` 被调用
3. **取消 → 无新元素**
   - 触发取消回调；断言 `elements.length` 不变；`cropper.destroy` 被调用
4. **切 tab → 残留 cropper 被销毁**
   - 在 cropping 状态下模拟切到 photo-mode
   - 断言 `cropper.destroy` 被调用

### 7.2 手动验证清单

- ✅ 选择一张大于 4000×4000 的图片，侧栏裁剪面板正常显示，能缩放/拖动
- ✅ 旋转按钮工作；裁剪框输出旋转后的内容
- ✅ 自由比例（拖拽 4 个角）
- ✅ 完成裁剪后图片立即出现在卡片画布上，可拖动
- ✅ 删除元素后再次点击「+ 添加图片」流程正常
- ✅ 在裁剪状态切到 photo-mode，再切回 card-mode，状态干净

---

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 复用 `#crop-section` 引起 photo-mode 状态污染 | **不复用**，新增独立 `#card-crop-section` |
| 切 tab 时残留 Cropper 实例导致内存泄漏 | 切 tab 前调 `cancelCrop()` 销毁 |
| 完成裁剪后立即绘制，新图片尺寸可能撑出边界 | 现有「按卡片 40% 高、60% 宽等比缩放」逻辑复用，行为一致 |
| 大图片加载慢 | `card-editor.js` 内部 `loadImage` 无超时（photo-mode 的 `loadImageFile` 有 15s 超时，但当前未复用）；接受现状；超大文件靠浏览器自身解码失败回退到 `onerror` 分支 |

---

## 9. 验收标准

1. ✅ 卡片模式下点击「+ 添加图片」立即出现侧栏裁剪面板（**必须裁剪**才能放回卡片）
2. ✅ 裁剪面板支持左右旋转 + 自由比例拖拽
3. ✅ 「完成裁剪」后图片作为元素出现在卡片画布上，可拖动、调整宽高
4. ✅ 「取消」按钮 / 切换 tab 都会清理裁剪状态，无残留
5. ✅ 现有 photo-mode 流程零回归（手工 + 自动测试）
6. ✅ 已有卡片编辑器功能零回归（拖动、字号、解锁比例、删除）
# Photosheet-Maker 设计文档

**日期**：2026-08-28
**项目**：Photosheet-Maker —— 浏览器端证件照排版工具
**状态**：设计中

---

## 1. 项目概述

Photosheet-Maker 是一个**纯前端 Web 应用**，让用户通过浏览器上传任意一张照片，手动裁剪后选择目标尺寸（一寸、二寸等）与相纸（A4、6 寸等），自动铺满相纸排版，调整边距与间距后导出为带裁切标记的高清图片（PNG / JPG），可直接送冲印店或家用打印机打印。

### 核心价值

- **隐私优先**：所有处理在浏览器内完成，照片不离开用户设备
- **零门槛**：双击 HTML 文件即可运行，无需安装、无需联网（首次加载 Cropper.js CDN 除外）
- **响应式**：电脑与手机浏览器均能使用

---

## 2. 目标用户与场景

### 主要用户

需要制作/打印证件照的普通人，例如：
- 报名考试需要提交标准证件照
- 已有合适的人像照片，想快速排版打印多份

### 核心场景

1. 用户从手机相册选一张半身人像照片
2. 在手机上调整裁剪框位置（保留头部与肩部）
3. 选择「一寸」+「A4」相纸
4. 调整边距和间距（可选）
5. 实时看到预览
6. 导出 PNG，发送到电脑打印

---

## 3. 功能范围

### 包含（In Scope）

- ✅ 上传单张图片（JPG / PNG / WebP，≤ 20MB）
- ✅ 基于 Cropper.js 的可视化手动裁剪框
- ✅ 裁剪阶段支持左右旋转（90° 步进），裁剪框比例跟随旋转
- ✅ 预设目标尺寸：一寸、小一寸、大一寸、二寸、小二寸、大二寸
- ✅ 预设相纸尺寸：6 寸（4R）、5 寸（3R）、7 寸（5R）、A6、A5、A4、A3
- ✅ 自动计算最大容纳数并铺满相纸
- ✅ 可调整：上下左右边距（0–50 mm）、横向间距 / 竖向间距（0–20 mm）
- ✅ 输出 DPI 可选：150 / 300 / 350 / 600
- ✅ 实时预览排版效果
- ✅ 导出 JPG（质量 95%）和 PNG（无损）
- ✅ 在每张照片边缘绘制裁切标记（角线）
- ✅ 响应式：手机、平板、桌面端

### 不包含（Out of Scope）

- ❌ 人脸检测 / 智能裁剪
- ❌ 背景替换（蓝底 / 红底 / 白底）
- ❌ 多张照片批量上传
- ❌ 同时生成多种尺寸
- ❌ PDF 输出
- ❌ 账号 / 历史记录 / 云存储
- ❌ PWA 离线安装（首版不做）
- ❌ 多语言（首版仅中文）
- ❌ 图片旋转 / 美化 / 滤镜

---

## 4. 技术选型

| 维度 | 选择 | 理由 |
|------|------|------|
| 架构 | 单页应用（SPA） | 流程简单，无需路由 |
| 技术栈 | 原生 HTML + CSS + JavaScript（ES6+） | 用户要求最轻量 |
| 构建工具 | 无（直接加载 JS） | 双击 HTML 即可运行 |
| 第三方库 | Cropper.js（CDN 引入） | 成熟的裁剪 UI 库 |
| 测试工具 | Vitest（仅 devDependencies） | 轻量、与原生 JS 兼容 |
| 图像处理 | Canvas 2D API | 浏览器原生，无需额外库 |

---

## 5. 架构与模块划分

### 整体架构

```
┌─────────────────────────────────────────────┐
│  PhotosheetMaker (主类 / 单例)              │
├─────────────────────────────────────────────┤
│  ├── Uploader        照片上传               │
│  ├── Cropper         裁剪交互               │
│  ├── ConfigPanel     参数配置               │
│  ├── LayoutEngine    排版计算（核心算法）   │
│  ├── PreviewRenderer 预览渲染（Canvas）     │
│  └── Exporter        导出生成               │
└─────────────────────────────────────────────┘
```

### 页面布局（桌面端 ≥ 768px）

```
┌──────────────────────────────────────────────────────┐
│  📐 Photosheet-Maker       [重新上传] [导出图片]    │
├─────────────────────┬────────────────────────────────┤
│ ① 目标尺寸         │  预览画布                      │
│   ○ 一寸            │   ┌──────────────┐             │
│   ○ 二寸            │   │   A4 相纸     │             │
│   ○ 小二寸          │   │   ┌──┐ ┌──┐   │             │
│   ○ 自定义          │   │   │  │ │  │   │             │
│                    │   │   └──┘ └──┘   │             │
│ ② 相纸尺寸         │   │   ┌──┐ ┌──┐   │             │
│   ○ 6寸（4R）       │   │   │  │ │  │   │             │
│   ○ A4             │   │   └──┘ └──┘   │             │
│                    │   └──────────────┘              │
│ ③ 边距（mm）       │                                 │
│   上 [5] 下 [5]    │  实时信息：                     │
│   左 [5] 右 [5]    │   容纳：24 张                   │
│                    │   输出：DPI 350，2779×3905 px   │
│                    │                                 │
│ ④ 间距（mm）       │                                 │
│   横向 [2] 竖向[2] │                                 │
└─────────────────────┴────────────────────────────────┘
```

### 页面布局（手机端 < 768px）

单列堆叠：上传 → 裁剪 → 尺寸设置 → 边距/间距 → 预览 → 底部固定导出按钮。

---

## 6. 数据流与状态管理

### 状态机

```
INITIAL → 上传图片 → CROPPING（裁剪 + 旋转）→ READY（排版）→ EXPORTING → DONE
                          ↑                            ↓
                          └──────── 「重新裁剪」 ────────┘
```

- **INITIAL**：初始状态，无图片，导出按钮禁用
- **CROPPING**：原图已加载，可裁剪、可旋转，提供「完成裁剪」按钮
- **READY**：裁剪确认后，进入排版。旋转按钮禁用，可调整边距/间距，可导出
- **EXPORTING**：生成图片中，显示进度
- **DONE**：下载完成，可继续调整或重新裁剪



### 全局状态对象

```js
const state = {
  originalImage: null,    // HTMLImageElement
  croppedCanvas: null,    // 裁剪后的 Canvas

  photoSize: '一寸',       // 目标尺寸 key
  paperSize: 'A4',        // 相纸 key
  dpi: 350,

  margin: { top: 5, bottom: 5, left: 5, right: 5 },   // mm
  gap:    { h: 2, v: 2 },                              // mm

  layout: null,           // LayoutEngine 输出缓存
};
```

### 事件订阅

- `imageReady`：原图加载完成 → 启用裁剪模块
- `cropChange`：裁剪框变更 → 更新预览
- `configChange`：参数变更 → 重算排版、重绘预览
- `layoutChange`：排版结果变更 → 更新信息面板

### 关键流程

**上传**：`选择文件 → 校验 → FileReader → Image.onload → setState → 初始化裁剪`

**裁剪**：`拖动裁剪框 → Cropper.onChange → croppedCanvas → 触发预览重绘`

**修改参数**：`input 事件 → debounce 100ms → setState → 重算 layout → 重绘预览`

**导出**：`点击导出 → 选择格式 → 创建离屏 Canvas → 绘制背景/照片/裁切标记 → toBlob → 触发下载`

---

## 7. 核心模块设计

### 7.1 Uploader

- 接收 `image/jpeg`、`image/png`、`image/webp`
- 大小限制 ≤ 20MB
- 用 `FileReader.readAsDataURL` 读取，`Image.onload` 加载

### 7.2 Cropper（封装 Cropper.js）

- 显示原图 + 裁剪框
- 裁剪框宽高比 = 当前目标尺寸的宽高比（旋转后会跟随变化）
- 提供鼠标拖拽、滚轮缩放（桌面）/ 手指拖拽、双指缩放（手机）
- `getCanvas()` 输出裁剪后的 Canvas

#### 7.2.1 旋转交互（CROPPING 阶段）

裁剪界面提供两个旋转按钮：

- **左旋转**：调用 `cropper.rotate(-90)`，裁剪框内图片逆时针旋转 90°
- **右旋转**：调用 `cropper.rotate(90)`，裁剪框内图片顺时针旋转 90°

旋转行为：

1. 旋转作用于裁剪框内的预览内容（不改变原图）
2. **裁剪框的宽高比跟随旋转**（如一寸 25:35 旋转后变为 35:25）
3. 旋转后裁剪框位置不变，用户可重新微调位置
4. 提供「完成裁剪」按钮：用户点击后进入 READY 阶段
5. READY 阶段：旋转按钮禁用（不可再次旋转），只能调整边距/间距

#### 7.2.2 重新裁剪

从 READY 阶段可通过「重新裁剪」按钮回到 CROPPING 阶段，重新调整裁剪框或旋转。



### 7.3 ConfigPanel

预设常量：

```js
const PHOTO_SIZES = {
  '一寸':   { w: 25, h: 35 },
  '小一寸': { w: 22, h: 32 },
  '大一寸': { w: 33, h: 48 },
  '二寸':   { w: 35, h: 49 },
  '小二寸': { w: 35, h: 45 },
  '大二寸': { w: 35, h: 53 },
};

const PAPER_SIZES = {
  '6寸（4R）': { w: 102, h: 152 },
  '5寸（3R）': { w: 89,  h: 127 },
  '7寸（5R）': { w: 127, h: 178 },
  'A6':       { w: 105, h: 148 },
  'A5':       { w: 148, h: 210 },
  'A4':       { w: 210, h: 297 },
  'A3':       { w: 297, h: 420 },
};

const DEFAULT_DPI = 350;
```

### 7.4 LayoutEngine（核心算法）

```js
function calculateLayout(photo, paper, margin, gap) {
  const usableW = paper.w - margin.left - margin.right;
  const usableH = paper.h - margin.top  - margin.bottom;

  const cols = Math.floor((usableW + gap.h) / (photo.w + gap.h));
  const rows = Math.floor((usableH + gap.v) / (photo.h + gap.v));

  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push({
        x: margin.left + c * (photo.w + gap.h),
        y: margin.top  + r * (photo.h + gap.v),
      });
    }
  }

  return { cols, rows, count: cols * rows, positions, paperSize: paper };
}
```

### 7.5 PreviewRenderer

- 双层渲染：屏幕预览（≤ 600px 宽）+ 导出时全分辨率
- 参数变更后 debounce 100ms 重绘

### 7.6 Exporter

- 创建离屏 Canvas（按 DPI 计算像素尺寸）
- 绘制白色背景 → 按 positions 绘制 croppedCanvas → 绘制裁切标记
- 裁切标记：照片四角内侧 3mm 处的 5mm 短线
- 输出格式：JPG（quality=0.95）或 PNG
- 文件名：`Photosheet_<timestamp>.<ext>`

---

## 8. 响应式设计

### 断点

| 断点 | 宽度 | 布局 |
|------|------|------|
| 手机 | < 768px | 单列堆叠，导出按钮 fixed 底部 |
| 平板 | 768–1023px | 左右分栏，控制面板 320px |
| 桌面 | ≥ 1024px | 左右分栏，控制面板 360px |

### 实现

```css
.container { flex-direction: column; }

@media (min-width: 768px) {
  .container { flex-direction: row; }
}

@media (min-width: 1024px) {
  .control-panel { width: 360px; }
}
```

---

## 9. 错误处理

| 场景 | 检测 | 提示 | 降级 |
|------|------|------|------|
| 文件 > 20MB | Uploader | 「文件过大，请压缩到 20MB 以下」 | 拒绝上传 |
| 格式不支持 | Uploader | 「仅支持 JPG / PNG / WebP」 | 拒绝上传 |
| 图片解析失败 | Image.onerror | 「图片损坏，请尝试其他文件」 | 回 INITIAL |
| 容纳数 = 0 | LayoutEngine | 「当前设置无法容纳任何照片，请缩小边距/间距或换大相纸」 | 禁用导出 |
| Canvas.toBlob 不支持 | Exporter | 「当前浏览器不支持，请升级或换用 Chrome / Edge / Firefox」 | 降级 toDataURL |
| 内存不足 | try/catch | 「图片处理失败，请尝试更小的原图」 | 回 CROPPING |

全局 `window.error` 与 `unhandledrejection` 监听，输出到 console + Toast。

---

## 10. 测试策略

### 单元测试（核心算法必须 100% 覆盖）

- `LayoutEngine.calculate()` 的多种组合：
  - 一寸 + A4（无间距）→ 64 张
  - 一寸 + A4（默认边距间距）→ 49 张
  - 极小相纸 → 0 张
  - 横向照片 + 纵向相纸（边界）

工具：Vitest

### 集成测试

- 完整流程：上传 → 裁剪 → 设置 → 导出
- 参数变更触发预览重绘
- 不同 DPI 输出像素尺寸正确

### 浏览器兼容性

- ✅ Chrome / Edge（推荐）
- ✅ Firefox
- ✅ Safari（含 iOS Safari）

### 用户验收（手动 checklist）

- [ ] 手机浏览器上传 5MB 照片
- [ ] 拖动与缩放裁剪框
- [ ] 切换尺寸裁剪框比例随之变化
- [ ] 切换相纸预览实时更新
- [ ] 调整边距间距预览实时更新
- [ ] 导出 JPG 文件 < 10MB
- [ ] 导出图片在冲印店可正确裁切

---

## 11. 项目结构

```
photosheet-maker/
├── index.html              # 单页入口
├── css/
│   └── style.css           # 样式（含响应式）
├── js/
│   ├── main.js             # 入口、状态管理
│   ├── constants.js        # PHOTO_SIZES / PAPER_SIZES / DPI
│   ├── uploader.js         # 上传
│   ├── cropper-wrapper.js  # 裁剪（封装 Cropper.js）
│   ├── config-panel.js     # 参数配置 UI
│   ├── layout-engine.js    # 排版算法
│   ├── preview-renderer.js # Canvas 预览
│   └── exporter.js         # 导出
├── tests/
│   └── layout-engine.test.js
├── docs/
│   └── README.md           # 用户文档
├── README.md
├── LICENSE
└── package.json            # 仅 devDependencies（vitest）
```

---

## 12. 未来扩展（不纳入首版）

- 人脸检测自动裁剪
- 背景替换
- 多张照片批量处理
- 同时生成多种尺寸
- PDF 输出
- PWA 离线安装
- 多语言（英文等）
- 打印预览（`@media print`）
- 历史记录与配置保存

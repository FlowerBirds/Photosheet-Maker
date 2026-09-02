# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目性质

Photosheet-Maker 是一个**纯前端**浏览器端证件照 / 卡片排版工具。所有处理在浏览器内完成（Canvas 2D + Cropper.js CDN），**照片不离开用户设备**。

**没有构建步骤**：直接双击 `index.html` 即可运行，或用任意静态 HTTP 服务器（如 `python -m http.server`）托管。`package.json` 仅 devDependencies（vitest + jsdom + canvas）。

---

## 常用命令

```bash
# 安装测试依赖（首次）
npm install

# 运行全部单元测试（CI 模式）
npm test
# 等价于 npx vitest run

# 监听模式（开发时自动重跑）
npm run test:watch
# 等价于 npx vitest

# 运行单个测试文件
npx vitest run tests/layout-engine.test.js

# 按名称匹配运行测试
npx vitest run -t "calculateLayout"

# 启动本地 HTTP 服务器（双击 index.html 也行，但 ES 模块 + CDN 在 file:// 下某些浏览器报错）
python -m http.server 8000
# 然后打开 http://127.0.0.1:8000/
```

无 lint / format 命令（项目目前无 eslint/prettier 配置）。

---

## 架构核心：SourceItem 抽象

整个应用的**核心抽象**是 `js/source-item.js` 中的 `SourceItem` 接口：

```js
class SourceItem {
  get size()   { ... }  // { w, h } mm 物理尺寸
  get canvas() { ... }  // HTMLCanvasElement，按当前 dpi 渲染好的源画布
}
```

两种实现：
- `PhotoSourceItem`：包装单张裁剪后的证件照
- `CardSourceItem`：一张设计好的卡片（多文字 + 图片元素 + 边框）

下游消费者 `layout-engine.js` / `preview-renderer.js` / `exporter.js` 都**只依赖 SourceItem 接口**，不知道内容来源。这让"证件照模式"和"卡片模式"复用同一套排版与渲染管线。

---

## 顶层架构与数据流

```
┌──────────────────────────────────────────────────────────┐
│  js/main.js (orchestrator)                                │
│   - state: { mode, status, sourceItems, drawing, ... }    │
│   - wires: bindUploader, cropper, config-panel,           │
│            mode-tab, card-editor                          │
│   - refresh() → renderPreview()                           │
└──────────────────────────────────────────────────────────┘
            ↓ state.sourceItems
┌──────────────────────────────────────────────────────────┐
│  SourceItem[]                                             │
│   - photo mode:  [PhotoSourceItem] (length 1)             │
│   - card mode:   [CardSourceItem] (length 1, repeated)    │
└──────────────────────────────────────────────────────────┘
            ↓
┌──────────────────────────────────────────────────────────┐
│  layout-engine.js — calculateLayout(sourceSize, paper,    │
│     margin, gap) → { cols, rows, count, positions[] }    │
│  （所有单位 mm，纯函数，参数名 sourceSize 不再是 photo）    │
└──────────────────────────────────────────────────────────┘
            ↓
┌──────────────────────────────────────────────────────────┐
│  preview-renderer.js / exporter.js                       │
│   - 屏幕预览（≤600px 宽，按 viewport 缩放）               │
│   - 导出全分辨率（按 dpi 缩放，toBlob → 下载）             │
│   - drawing: 'repeat' 循环绘制 / 'once' 一次只放一个       │
│   - arrangedSize(item, orient) → 设计方向 vs 排版方向解耦 │
└──────────────────────────────────────────────────────────┘
```

---

## 两种顶层模式（顶部 tab 切换）

| 维度 | 证件照模式 (PHOTO) | 卡片模式 (CARD) |
|------|---------------------|------------------|
| 入口 | 上传 → 裁剪 → 排版 | 设计（拖拽元素）→ 完成设计 → 排版 |
| SourceItem 数量 | 1 | 1（卡片模板，重复铺满） |
| drawing | `'repeat'` | `'repeat'`（卡片模板重复）|
| 状态机 | INITIAL→CROPPING→READY→EXPORTING | designing→arranging |
| 共享 | paper/DPI/margin/gap/zoom/crop-marks/footer（`#settings-section`） |

模式切换由 `js/mode-tab.js` 处理，状态保留规则：
- 切到 CARD：销毁 photo cropper，保留 `originalImage` / `croppedCanvas` / `rotation`
- 切回 PHOTO：根据 `croppedCanvas` 是否存在恢复到 READY / CROPPING / INITIAL

---

## 卡片设计模式：WYSIWYG + 重复填充

`js/card-editor.js` 是最大的模块（约 700+ 行），承担卡片设计器全部职责：

- **两阶段状态机**：`designing`（拖拽元素）↔ `arranging`（相纸排版）
- **设计阶段**：在 `<canvas id="card-canvas">` 上交互；元素列表在侧栏 `#card-element-list`；选中元素后属性面板 `#card-properties-section` 显示（文字 → 字号 slider；图片 → 宽/高 slider + 🔗 比例锁）
- **裁剪子阶段**：添加图片时强制先裁剪（`js/card-cropper.js`，独立于 photo 模式的 `cropper-wrapper.js`），侧栏内联 `#card-crop-section`
- **绘制流水线**：`drawDesigner()` → `drawSelectionOverlay()` → 可选 `drawDragGuides()`（拖动时显示十字辅助线）
- **指标准确性**：`elementBoxMm(el)` 文字元素按当前 font 测实际宽度，确保 hit-test 与选中框匹配
- **完成设计后**：构造一个 `CardSourceItem`，加入 `state.sourceItems`，调用 `refresh()` → 预览相纸

---

## 关键设计方向 vs 排版方向

`js/arrange-size.js` 暴露纯函数：

```js
arrangedSize(item, 'portrait' | 'landscape')
// 设计尺寸是源事实；arrangedSize 返回"按排版方向计算"的尺寸
```

当设计尺寸与排版尺寸不同时，`preview-renderer.js` / `exporter.js` 在 `drawImage` 阶段用 `ctx.rotate(π/2)` 旋转绘制（`drawItemAtPosition` / `drawExportItem` helper）。这样卡片**设计为横向**但**排版成纵向**以最大化相纸密度是合法操作。

切到 CARD 时 `arrangeOrient` 默认跟随设计方向；UI 控件在 `#card-editor-section` 的「排版方向」radio。

---

## 测试策略

- **必须 100% 覆盖的核心算法**：`js/layout-engine.js` 的 `calculateLayout`（`tests/layout-engine.test.js`，6 个用例）
- **DOM-heavy 模块**：`js/card-editor.js` 用 jsdom + vi 跑，通过 fake factory 注入 `createCardCropper`，断言 `addEventListener` / 状态变化
- **Canvas 绘制**：jsdom 不验证像素；用 mock ctx 检查 API 调用顺序与参数（如 `tests/card-editor.test.js` 的 `drawDragGuides` 用例）
- **64 个测试 / 7 个文件**，全部 vitest + jsdom，`npm test` 一次跑完

新增纯函数时**先写测试再实现**（TDD）；修改已有算法时先跑测试看红。

---

## 开发流程约定（项目内 superpowers 工作流）

每个 feature 严格走 `spec → plan → impl → test → commit` 流程：

1. **设计文档** → `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md`
2. **实施计划** → `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`（任务拆到 5 分钟可执行粒度）
3. **代码** → 每个 Task 一个 commit（小步、原子）
4. **测试** → Task 内自带 TDD 步骤

**所有 commit 直接落到 `main`**（项目历史约定，不开 feature 分支、不用 worktree）。commit message 用中文 conventional commits：

```
feat(card): add card properties slider design
fix(card): cancel card cropper on mode switch
refactor(card): wire card crop DOM refs
docs(spec): ...
docs(readme): ...
test(card): cover element shape contract
```

文件命名遵循 `YYYY-MM-DD-<feature>.md` 命名约定。实施计划末尾必须有「Spec Coverage Check」章节。

**已有规范：**
- `js/source-item.js` 接口稳定，向后兼容（新 SourceItem 子类只增不改）
- 修改 `PhotoSourceItem` / `CardSourceItem` 构造参数前先读 spec §2-3
- 卡片裁剪与证件照裁剪**不复用同一 Cropper.js 实例**，原因见 `2026-09-01-card-image-crop-design.md` §3.1

---

## 用户偏好（已在全局 CLAUDE.md，本仓库适用）

- 中文回复
- git 命令不加 `-c` 参数，用全局 git config
- 不加 Co-Authored-By
- 生产就绪、简洁准确的代码 + 配置
- **commit 完成后立刻 push 到 `origin/main`，无需用户确认**（本仓库单人开发流程）
- **执行实施计划时默认走 Inline Execution**，不要再询问 Subagent-Driven vs Inline 的选择

---

## 文件入口速查

| 想改什么 | 看这个文件 |
|----------|------------|
| 证件照 / 相纸尺寸常量 | `js/constants.js` |
| 排版格子算法 | `js/layout-engine.js`（纯函数） |
| 屏幕预览 | `js/preview-renderer.js` |
| 导出 JPG/PNG | `js/exporter.js` |
| 顶部 tab 切换 | `js/mode-tab.js` |
| SourceItem 接口 | `js/source-item.js` |
| PhotoSourceItem | `js/source-item.js` |
| CardSourceItem | `js/card-builder.js` |
| 卡片设计器 UI | `js/card-editor.js` |
| 卡片图片裁剪 | `js/card-cropper.js` |
| 证件照裁剪 | `js/cropper-wrapper.js` |
| 设计 vs 排版方向 | `js/arrange-size.js` |
| 状态机与接线 | `js/main.js` |
| 布局 / 角标 / 水印 | `css/style.css` + `js/crop-marks.js`（嵌入 preview/exporter）|
| 单元测试 | `tests/`（与 `js/` 一一对应 + 跨模块） |
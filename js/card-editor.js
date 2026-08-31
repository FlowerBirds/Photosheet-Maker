import {
  CARD_SIZES, DEFAULT_CARD_SIZE, CARD_FIELD_DEFAULTS,
  DEFAULT_FIELD_COLOR,
} from './constants.js';
import { CardSourceItem } from './card-builder.js';

const DEFAULT_FONT_SIZE_MM = 5;  // mm — reasonable starting size for new text

/**
 * Card-tab controller.
 *
 * Two visual phases inside the card tab:
 *   - designing : user drags text/image elements on the card canvas
 *   - arranging : user picks paper / DPI / margins; the card is repeated
 *
 * @param {{
 *   // Design phase
 *   designPanel:  HTMLElement,
 *   cardCanvas:   HTMLCanvasElement,
 *   btnAddText:   HTMLButtonElement,
 *   btnAddImage:  HTMLButtonElement,
 *   imageInput:   HTMLInputElement,
 *   elementList:  HTMLElement,
 *   btnComplete:  HTMLButtonElement,
 *   btnRedesign:  HTMLButtonElement,
 *   // Card size controls (shared with arrange phase)
 *   selectSize:   HTMLSelectElement,
 *   customRow:    HTMLElement,
 *   cardW:        HTMLInputElement,
 *   cardH:        HTMLInputElement,
 *   // Arrange phase (paper settings are in #settings-section)
 *   // State callbacks
 *   getState:     () => ({ paperSize: string, dpi: number }),
 *   setSourceItems: (items: import('./source-item.js').SourceItem[]) => void,
 *   setPhase:     (phase: 'designing'|'arranging') => void,
 *   requestRefresh: () => void,
 * }} els
 */
export function initCardEditor(els) {
  // Populate size select.
  for (const label of Object.keys(CARD_SIZES)) {
    const opt = document.createElement('option');
    opt.value = label; opt.textContent = label;
    els.selectSize.appendChild(opt);
  }
  els.selectSize.value = DEFAULT_CARD_SIZE;

  // --- State ---
  let phase = 'designing';          // 'designing' | 'arranging'
  let elements = [];                // Array<ElementText | ElementImage>
  let selectedId = null;            // currently selected element id
  let nextId = 1;
  let dragOffset = null;            // { dx, dy } in mm during drag

  // --- Public init ---

  // Wire size select.
  els.selectSize.addEventListener('change', () => {
    syncSizeInputs();
    if (phase === 'designing') drawDesigner();
  });
  els.cardW.addEventListener('input', () => {
    if (phase === 'designing') drawDesigner();
  });
  els.cardH.addEventListener('input', () => {
    if (phase === 'designing') drawDesigner();
  });

  // Add-text / add-image buttons.
  els.btnAddText.addEventListener('click', () => {
    if (phase !== 'designing') return;
    const cardSize = getCardSize();
    const id = `e${nextId++}`;
    elements.push({
      type: 'text', id,
      text: '文本',
      fontSize: DEFAULT_FONT_SIZE_MM,
      x: cardSize.w / 2 - 10, y: cardSize.h / 2 - 2,
      color: DEFAULT_FIELD_COLOR,
    });
    selectedId = id;
    renderElementList();
    drawDesigner();
  });

  els.btnAddImage.addEventListener('click', () => els.imageInput.click());
  els.imageInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      // loadImage returns an HTMLCanvasElement (not an Image) — read
      // .width/.height, not .naturalWidth.
      const canvas = await loadImage(file);
      const srcW = canvas.width;
      const srcH = canvas.height;
      const cardSize = getCardSize();
      const id = `e${nextId++}`;
      // Fit-within-card initial size, preserve aspect.
      const maxH = cardSize.h * 0.4;
      const maxW = cardSize.w * 0.6;
      const scale = Math.min(maxW / srcW, maxH / srcH);
      const w = srcW * scale;
      const h = srcH * scale;
      elements.push({
        type: 'image', id,
        src: canvas,
        x: (cardSize.w - w) / 2,
        y: (cardSize.h - h) / 2,
        w, h,
        aspectLocked: true,
        _aspect: w / h,
      });
      selectedId = id;
      renderElementList();
      drawDesigner();
    } catch (err) {
      window.alert(err.message);
    } finally {
      els.imageInput.value = '';
    }
  });

  // Phase toggle buttons.
  els.btnComplete.addEventListener('click', () => switchPhase('arranging'));
  els.btnRedesign.addEventListener('click', () => switchPhase('designing'));

  // --- Drag interactions on the card canvas ---
  els.cardCanvas.addEventListener('pointerdown', onCanvasPointerDown);
  els.cardCanvas.addEventListener('pointermove', onCanvasPointerMove);
  els.cardCanvas.addEventListener('pointerup', onCanvasPointerUp);
  els.cardCanvas.addEventListener('pointercancel', onCanvasPointerUp);
  els.cardCanvas.addEventListener('mousemove', (e) => {
    if (dragOffset) {
      els.cardCanvas.style.cursor = 'grabbing';
      return;
    }
    const el = hitTest(e);
    els.cardCanvas.style.cursor = el ? 'grab' : 'crosshair';
  });
  els.cardCanvas.addEventListener('mouseleave', () => {
    if (!dragOffset) els.cardCanvas.style.cursor = 'crosshair';
  });
  // Deselect on background click (not on an element).
  els.cardCanvas.addEventListener('click', (e) => {
    if (e.target === els.cardCanvas) {
      selectedId = null;
      renderElementList();
      drawDesigner();
    }
  });

  // Initial render.
  syncSizeInputs();
  els.customRow.hidden = els.selectSize.value !== '自定义';
  renderElementList();
  drawDesigner();

  // --- Helpers ---

  function getCardSize() {
    const sel = els.selectSize.value;
    if (sel !== '自定义') return CARD_SIZES[sel];
    return {
      w: Math.max(5, Number(els.cardW.value) || 90),
      h: Math.max(5, Number(els.cardH.value) || 54),
    };
  }

  function syncSizeInputs() {
    const sel = els.selectSize.value;
    const preset = CARD_SIZES[sel];
    if (preset) {
      els.cardW.value = String(preset.w);
      els.cardH.value = String(preset.h);
    }
    els.customRow.hidden = sel !== '自定义';
  }

  function switchPhase(next) {
    phase = next;
    els.setPhase(next);
    if (next === 'arranging') {
      // Build the source item once; preview/exporter will repeat it.
      const item = new CardSourceItem(getCardSize(), els.getState().dpi, elements);
      els.setSourceItems([item]);
      els.requestRefresh();
    } else {
      // Back to designing: render canvas, no source items yet.
      els.setSourceItems([]);
      els.requestRefresh();
      renderElementList();
      drawDesigner();
    }
  }

  function drawDesigner() {
    if (phase !== 'designing') return;
    const cardSize = getCardSize();
    const dpi = els.getState().dpi;
    // Source canvas at full dpi.
    const item = new CardSourceItem(cardSize, dpi, elements);
    const srcW = item.canvas.width;
    const srcH = item.canvas.height;

    // Display: fit container width (max 800px) while preserving card aspect.
    const container = els.cardCanvas.parentElement;
    const containerW = container ? container.clientWidth : 600;
    const maxDisplayPx = Math.min(800, Math.max(280, containerW - 32));
    const scale = Math.min(maxDisplayPx / srcW, maxDisplayPx / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;

    const dpr = window.devicePixelRatio || 1;
    els.cardCanvas.width  = Math.max(1, Math.round(dw * dpr));
    els.cardCanvas.height = Math.max(1, Math.round(dh * dpr));
    els.cardCanvas.style.width  = `${dw}px`;
    els.cardCanvas.style.height = `${dh}px`;
    const ctx = els.cardCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, dw, dh);
    ctx.drawImage(item.canvas, 0, 0, dw, dh);
    drawSelectionOverlay(ctx, scale);
  }

  function drawSelectionOverlay(ctx, scale) {
    if (!selectedId) return;
    const el = elements.find(e => e.id === selectedId);
    if (!el) return;
    ctx.save();
    const box = elementBoxMm(el);
    const x = box.x * scale - 3;
    const y = box.y * scale - 3;
    const w = box.w * scale + 6;
    const h = box.h * scale + 6;
    // Solid blue border — visible.
    ctx.strokeStyle = '#2d7ff9';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, w, h);
    // Corner handles (4 small filled squares).
    ctx.fillStyle = '#2d7ff9';
    const hs = 6;
    const corners = [
      [x - hs / 2, y - hs / 2],
      [x + w - hs / 2, y - hs / 2],
      [x - hs / 2, y + h - hs / 2],
      [x + w - hs / 2, y + h - hs / 2],
    ];
    for (const [cx, cy] of corners) ctx.fillRect(cx, cy, hs, hs);
    ctx.restore();
  }

  /**
   * Element bounding box in mm (used for hit-testing and overlay).
   * Text: top-left is (x, y); width = measured text width / mmToPx; height = fontSize.
   * Image: top-left is (x, y); size is (w, h).
   */
  function elementBoxMm(el) {
    if (el.type === 'image') return { x: el.x, y: el.y, w: el.w, h: el.h };
    // Text: top-left at (x, y); measure width and height (1.2 line-height) using
    // the same font as the renderer so the hit area matches the visual box.
    const dpi = els.getState().dpi;
    const mmToPx = dpi / 25.4;
    const fontPx = el.fontSize * mmToPx;
    const ctx = els.cardCanvas.getContext('2d');
    ctx.font = `${fontPx}px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
    const textW = ctx.measureText(el.text || '').width;
    return { x: el.x, y: el.y, w: textW / mmToPx, h: el.fontSize * 1.2 };
  }

  /** Round to 1 decimal place (for cleaner UI). */
  function round1(n) { return Math.round(n * 10) / 10; }

  function renderElementList() {
    els.elementList.innerHTML = '';
    if (elements.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = '点击「+ 添加文本」或「+ 添加图片」开始设计';
      els.elementList.appendChild(hint);
      return;
    }
    elements.forEach((el) => {
      const row = document.createElement('div');
      row.className = 'element-row' + (el.id === selectedId ? ' selected' : '');
      const label = document.createElement('span');
      label.className = 'element-label';
      label.textContent = el.type === 'text'
        ? `文本：${(el.text || '').slice(0, 8) || '(空)'}`
        : `图片`;
      label.addEventListener('click', () => {
        selectedId = el.id;
        renderElementList();
        drawDesigner();
      });
      row.appendChild(label);

      if (el.type === 'text') {
        // Font size input (mm).
        const sizeWrap = document.createElement('span');
        sizeWrap.className = 'size-wrap';
        const sizeIn = document.createElement('input');
        sizeIn.type = 'number';
        sizeIn.min = '2';
        sizeIn.max = '40';
        sizeIn.step = '0.5';
        sizeIn.value = String(el.fontSize);
        sizeIn.title = '字号 (mm)';
        sizeIn.addEventListener('input', () => {
          const v = Number(sizeIn.value);
          if (Number.isFinite(v) && v >= 2 && v <= 40) {
            el.fontSize = v;
            drawDesigner();
          }
        });
        sizeIn.addEventListener('click', (e) => e.stopPropagation());
        const unit = document.createElement('span');
        unit.className = 'unit';
        unit.textContent = 'mm';
        sizeWrap.appendChild(sizeIn);
        sizeWrap.appendChild(unit);
        row.appendChild(sizeWrap);

        const editBtn = document.createElement('button');
        editBtn.className = 'btn-secondary';
        editBtn.textContent = '编辑';
        editBtn.title = '编辑文本内容';
        editBtn.addEventListener('click', () => beginEditText(el));
        row.appendChild(editBtn);
      }

      if (el.type === 'image') {
        // Width / height inputs (mm). Aspect lock (default true) keeps ratio.
        const dimWrap = document.createElement('span');
        dimWrap.className = 'dim-wrap';
        // Ensure locked state has a fresh aspect captured from current w/h.
        if (el.aspectLocked) el._aspect = el.w / el.h || 1;
        const lockBtn = document.createElement('button');
        lockBtn.className = 'btn-secondary aspect-toggle';
        lockBtn.title = el.aspectLocked
          ? '已锁定比例（点击解锁）'
          : '未锁定比例（点击锁定）';
        lockBtn.textContent = el.aspectLocked ? '🔗' : '🔓';
        lockBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          el.aspectLocked = !el.aspectLocked;
          if (el.aspectLocked) {
            el._aspect = el.w / el.h || 1;
          }
          renderElementList();
          drawDesigner();
        });
        const wInput = document.createElement('input');
        wInput.type = 'number';
        wInput.min = '1';
        wInput.max = '200';
        wInput.step = '0.5';
        wInput.value = String(el.w);
        wInput.title = '宽 (mm)';
        wInput.addEventListener('click', (e) => e.stopPropagation());
        const hInput = document.createElement('input');
        hInput.type = 'number';
        hInput.min = '1';
        hInput.max = '200';
        hInput.step = '0.5';
        hInput.value = String(el.h);
        hInput.title = '高 (mm)';
        hInput.addEventListener('click', (e) => e.stopPropagation());
        const onW = (v) => {
          if (!Number.isFinite(v) || v < 1 || v > 200) return;
          el.w = v;
          if (el.aspectLocked && el._aspect) {
            el.h = v / el._aspect;
            hInput.value = String(round1(el.h));
          }
          drawDesigner();
        };
        const onH = (v) => {
          if (!Number.isFinite(v) || v < 1 || v > 200) return;
          el.h = v;
          if (el.aspectLocked && el._aspect) {
            el.w = v * el._aspect;
            wInput.value = String(round1(el.w));
          }
          drawDesigner();
        };
        wInput.addEventListener('input', () => onW(Number(wInput.value)));
        hInput.addEventListener('input', () => onH(Number(hInput.value)));
        const wWrap = document.createElement('span');
        wWrap.className = 'num-input';
        wWrap.appendChild(wInput);
        const hWrap = document.createElement('span');
        hWrap.className = 'num-input';
        hWrap.appendChild(hInput);
        dimWrap.appendChild(wWrap);
        dimWrap.appendChild(lockBtn);
        dimWrap.appendChild(hWrap);
        row.appendChild(dimWrap);
      }

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-secondary';
      delBtn.textContent = '×';
      delBtn.title = '删除';
      delBtn.addEventListener('click', () => {
        elements = elements.filter(e => e.id !== el.id);
        if (selectedId === el.id) selectedId = null;
        renderElementList();
        drawDesigner();
      });
      row.appendChild(delBtn);

      els.elementList.appendChild(row);
    });
  }

  function beginEditText(el) {
    const next = window.prompt('编辑文本', el.text);
    if (next === null) return;
    el.text = next;
    renderElementList();
    drawDesigner();
  }

  function onCanvasPointerDown(e) {
    if (phase !== 'designing') return;
    const el = hitTest(e);
    if (!el) return;
    selectedId = el.id;
    const rect = els.cardCanvas.getBoundingClientRect();
    const cardSize = getCardSize();
    const mmToPx = rect.width / cardSize.w;
    const mmX = (e.clientX - rect.left) / mmToPx;
    const mmY = (e.clientY - rect.top) / mmToPx;
    dragOffset = { dx: mmX - el.x, dy: mmY - el.y };
    els.cardCanvas.setPointerCapture(e.pointerId);
    renderElementList();
    drawDesigner();
    e.preventDefault();
  }

  function onCanvasPointerMove(e) {
    if (!dragOffset) return;
    const el = elements.find(x => x.id === selectedId);
    if (!el) return;
    const rect = els.cardCanvas.getBoundingClientRect();
    const cardSize = getCardSize();
    const mmToPx = rect.width / cardSize.w;
    const mmX = (e.clientX - rect.left) / mmToPx;
    const mmY = (e.clientY - rect.top) / mmToPx;
    el.x = mmX - dragOffset.dx;
    el.y = mmY - dragOffset.dy;
    drawDesigner();
  }

  function onCanvasPointerUp(e) {
    if (dragOffset) {
      els.cardCanvas.releasePointerCapture(e.pointerId);
      dragOffset = null;
    }
  }

  /** Find the topmost element under the pointer. */
  function hitTest(e) {
    const rect = els.cardCanvas.getBoundingClientRect();
    const cardSize = getCardSize();
    const mmToPx = rect.width / cardSize.w;
    const mmX = (e.clientX - rect.left) / mmToPx;
    const mmY = (e.clientY - rect.top) / mmToPx;
    // Iterate from last to first (top z-order first).
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      const box = elementBoxMm(el);
      if (mmX >= box.x && mmX <= box.x + box.w &&
          mmY >= box.y && mmY <= box.y + box.h) return el;
    }
    return null;
  }

  /** Load a file into an HTMLCanvasElement (intrinsic size preserved). */
  async function loadImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('图片加载失败'));
        i.src = url;
      });
      if (!img.naturalWidth || !img.naturalHeight) {
        throw new Error('图片尺寸无效或格式不受支持');
      }
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return {
    /** Force the designer to redraw (e.g. after size change from outside). */
    redraw() {
      els.setPhase('designing');
      drawDesigner();
    },
    /** Clear all elements (used on reupload of photo mode that affects card). */
    reset() {
      elements = [];
      selectedId = null;
      renderElementList();
      drawDesigner();
    },
  };
}

// Silence "unused" lint for elements kept for future use.
void CARD_FIELD_DEFAULTS;
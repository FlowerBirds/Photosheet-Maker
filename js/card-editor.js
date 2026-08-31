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
      const img = await loadImage(file);
      const cardSize = getCardSize();
      const id = `e${nextId++}`;
      // Fit-within-card initial size, preserve aspect.
      const maxH = cardSize.h * 0.4;
      const maxW = cardSize.w * 0.6;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      elements.push({
        type: 'image', id,
        src: img,
        x: (cardSize.w - w) / 2,
        y: (cardSize.h - h) / 2,
        w, h,
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
    // Render at dpi but size display to fit a max on-screen dimension.
    const item = new CardSourceItem(cardSize, dpi, elements);
    const srcW = item.canvas.width;
    const srcH = item.canvas.height;
    const maxDisplayPx = 360;
    const scale = Math.min(maxDisplayPx / srcW, maxDisplayPx / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;
    const dpr = window.devicePixelRatio || 1;
    els.cardCanvas.width  = dw * dpr;
    els.cardCanvas.height = dh * dpr;
    els.cardCanvas.style.width  = `${dw}px`;
    els.cardCanvas.style.height = `${dh}px`;
    const ctx = els.cardCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, dw, dh);
    ctx.drawImage(item.canvas, 0, 0, dw, dh);
    // Draw selection marker on top.
    drawSelectionOverlay(ctx, scale);
  }

  function drawSelectionOverlay(ctx, scale) {
    if (!selectedId) return;
    const el = elements.find(e => e.id === selectedId);
    if (!el) return;
    ctx.save();
    ctx.strokeStyle = '#2d7ff9';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    if (el.type === 'text') {
      // Approximate bounding box from text width.
      const fontPx = el.fontSize * (els.getState().dpi / 25.4) * scale;
      ctx.font = `${fontPx}px -apple-system, "Segoe UI", sans-serif`;
      const textW = ctx.measureText(el.text || '').width;
      const textH = fontPx * 1.2;
      ctx.strokeRect(el.x * scale - 2, el.y * scale - 2, textW + 4, textH + 4);
    } else {
      ctx.strokeRect(el.x * scale - 2, el.y * scale - 2, el.w * scale + 4, el.h * scale + 4);
    }
    ctx.restore();
  }

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
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-secondary';
        editBtn.textContent = '编辑';
        editBtn.addEventListener('click', () => beginEditText(el));
        row.appendChild(editBtn);
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
      if (el.type === 'image') {
        if (mmX >= el.x && mmX <= el.x + el.w &&
            mmY >= el.y && mmY <= el.y + el.h) return el;
      } else {
        // For text, hit-test a small rect around (x, y).
        if (mmX >= el.x && mmX <= el.x + 30 &&
            mmY >= el.y - el.fontSize && mmY <= el.y + el.fontSize) return el;
      }
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
    redraw() { drawDesigner(); },
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
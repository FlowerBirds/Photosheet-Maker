import {
  CARD_SIZES, DEFAULT_CARD_SIZE, CARD_FIELD_DEFAULTS,
  DEFAULT_FIELD_COLOR,
} from './constants.js';
import { CardSourceItem } from './card-builder.js';
import { createCardCropper } from './card-cropper.js';

/**
 * Draw two dashed center guides across the card canvas (in display px).
 * Exported so the visual contract can be unit-tested directly with a mock ctx.
 */
export function drawDragGuides(ctx, dw, dh) {
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
 *   btnAddRect:   HTMLButtonElement,    // rect element button
 *   imageInput:   HTMLInputElement,
 *   elementList:  HTMLElement,
 *   btnComplete:  HTMLButtonElement,
 *   btnRedesign:  HTMLButtonElement,
 *   cardBorderWidth: HTMLInputElement,
 *   cardBorderWidthVal: HTMLElement,
 *   cardBorderColor: HTMLInputElement,
 *   cardWVal: HTMLElement,
 *   cardHVal: HTMLElement,
 *   // Card size controls (shared with arrange phase)
 *   selectSize:   HTMLSelectElement,
 *   customRow:    HTMLElement,
 *   cardW:        HTMLInputElement,
 *   cardH:        HTMLInputElement,
 *   // Arrange phase (paper settings are in #settings-section)
 *   // Card image crop phase
 *   cardCropSection:    HTMLElement,
 *   cardCropImg:        HTMLImageElement,
 *   btnCardCropRotateL: HTMLButtonElement,
 *   btnCardCropRotateR: HTMLButtonElement,
 *   btnCardCropFinish:  HTMLButtonElement,
 *   btnCardCropCancel:  HTMLButtonElement,
 *   // Properties panel (selected-element editor)
 *   propertiesSection:  HTMLElement,
 *   propFontSize:       HTMLElement,
 *   propFontSizeInput:  HTMLInputElement,
 *   propFontSizeVal:    HTMLElement,
 *   propImageDims:      HTMLElement,
 *   propWInput:         HTMLInputElement,
 *   propWVal:           HTMLElement,
 *   propHInput:         HTMLInputElement,
 *   propHVal:           HTMLElement,
 *   propAspectToggle:   HTMLButtonElement,
   *   // Rect element properties
   *   propRectDims:         HTMLElement,
   *   propRectWInput:       HTMLInputElement,
   *   propRectWVal:         HTMLElement,
   *   propRectHInput:       HTMLInputElement,
   *   propRectHVal:         HTMLElement,
   *   propBorderWidthInput: HTMLInputElement,
   *   propBorderWidthVal:   HTMLElement,
   *   propBorderColor:      HTMLInputElement,
   *   propFillColor:        HTMLInputElement,
   *   propRectAspectToggle: HTMLButtonElement,
 *   // State callbacks
 *   getState:     () => ({ paperSize: string, dpi: number }),
 *   setSourceItems: (items: import('./source-item.js').SourceItem[]) => void,
 *   setPhase:     (phase: 'designing'|'arranging') => void,
 *   requestRefresh: () => void,
 *   // Called when user toggles the arrange-orientation radio. Lets the host
 *   (main.js) keep `state.arrangeOrient` in sync and trigger a refresh.
 *   Optional: omitted in older tests.
 *   setArrangementOrient?: (value: 'portrait'|'landscape') => void,
 *   // Override (tests)
 *   createCardCropper?: typeof import('./card-cropper.js').createCardCropper,
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
  // Card-level border. Default: 0.1mm gray (~1px at 350dpi).
  const border = { width: 0.1, color: '#888888' };
  // Crop state: null when idle; { cw, sourceCanvas } while cropping.
  let cropState = null;
  // Factory (overridable for tests).
  const _createCardCropper = els.createCardCropper || createCardCropper;
  // Arrangement (layout) orientation. Defaults to design orientation.
  let arrangeOrient = getOrientation();

  /** Read the currently-selected orientation radio ('portrait' | 'landscape'). */
  function getOrientation() {
    const r = document.querySelector('input[name="card-orientation"]:checked');
    return r ? r.value : 'portrait';
  }

  /** Set orientation radio by value ('portrait' | 'landscape'). */
  function setOrientation(value) {
    const r = document.querySelector(`input[name="card-orientation"][value="${value}"]`);
    if (r) r.checked = true;
  }

  // --- Public init ---

  // Wire size select.
  els.selectSize.addEventListener('change', () => {
    setOrientation('portrait');  // selecting a preset resets orientation
    syncSizeInputs();
    if (phase === 'designing') drawDesigner();
    else if (phase === 'arranging') rebuildArrangeItem();
  });

  // Orientation radios.
  document.querySelectorAll('input[name="card-orientation"]').forEach((r) => {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      // Reflect into the input boxes (visible only for 自定义 row, but
      // keeps them in sync with current size).
      const cur = getCardSize();
      els.cardW.value = String(cur.w);
      els.cardH.value = String(cur.h);
      if (phase === 'designing') drawDesigner();
      else if (phase === 'arranging') rebuildArrangeItem();
    });
  });
  els.cardW.addEventListener('input', () => {
    if (els.cardWVal) els.cardWVal.textContent = String(els.cardW.value);
    if (phase === 'designing') drawDesigner();
  });
  els.cardH.addEventListener('input', () => {
    if (els.cardHVal) els.cardHVal.textContent = String(els.cardH.value);
    if (phase === 'designing') drawDesigner();
  });

  // Border controls.
  els.cardBorderWidth.addEventListener('input', () => {
    border.width = clampBorderWidth(Number(els.cardBorderWidth.value));
    mirrorBorderWidth();
    if (phase === 'designing') drawDesigner();
    else if (phase === 'arranging') rebuildArrangeItem();
  });
  els.cardBorderColor.addEventListener('input', () => {
    border.color = els.cardBorderColor.value || '#888888';
    if (phase === 'designing') drawDesigner();
    else if (phase === 'arranging') rebuildArrangeItem();
  });

  // Orientation radios are wired above (after selectSize change handler).
// (Removed the toggle button in favour of explicit portrait/landscape radios.)

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
    renderProperties();
    drawDesigner();
  });

  els.btnAddImage.addEventListener('click', () => els.imageInput.click());

  if (els.btnAddRect) {
  els.btnAddRect.addEventListener('click', () => {
    if (phase !== 'designing') return;
    const cardSize = getCardSize();
    const id = `e${nextId++}`;
    // Default: 15×15 mm square centered in the card.
    const w = 15, h = 15;
    elements.push({
      type: 'rect', id,
      x: cardSize.w / 2 - w / 2,
      y: cardSize.h / 2 - h / 2,
      width: w,
      height: h,
      borderWidth: 0.1,
      borderColor: '#888888',
      fillColor: '#ffffff',
      aspectLocked: true,
      _aspect: w / h,
    });
    selectedId = id;
    renderElementList();
    renderProperties();
    drawDesigner();
  });
}

  // Arrange-orientation radios.
  document.querySelectorAll('input[name="card-arrange-orientation"]').forEach((r) => {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      arrangeOrient = r.value;
      // Propagate to host so state.arrangeOrient + refresh() run.
      if (els.setArrangementOrient) els.setArrangementOrient(arrangeOrient);
    });
  });

  els.imageInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      // loadImage returns an HTMLCanvasElement (not an Image).
      const canvas = await loadImage(file);
      startCrop(canvas);
    } catch (err) {
      window.alert(err.message);
    } finally {
      els.imageInput.value = '';
    }
  });

  // Phase toggle buttons.
  els.btnComplete.addEventListener('click', () => switchPhase('arranging'));
  els.btnRedesign.addEventListener('click', () => switchPhase('designing'));

  // --- Image crop phase ---
  // Wire crop buttons.
  els.btnCardCropRotateL.addEventListener('click', () => {
    if (cropState && cropState.cw.isActive()) cropState.cw.rotate(-90);
  });
  els.btnCardCropRotateR.addEventListener('click', () => {
    if (cropState && cropState.cw.isActive()) cropState.cw.rotate(90);
  });
  els.btnCardCropFinish.addEventListener('click', completeCrop);
  els.btnCardCropCancel.addEventListener('click', cancelCrop);

  /**
   * Show the crop panel, load the canvas into the <img>, init Cropper.js.
   * Idempotent: if already cropping, destroys first.
   */
  function startCrop(sourceCanvas) {
    if (cropState) cancelCrop();
    els.cardCropImg.src = sourceCanvas.toDataURL();
    const cw = _createCardCropper(els.cardCropImg);
    cw.init();
    cropState = { cw, sourceCanvas };
    els.cardCropSection.hidden = false;
  }

  /** Commit the crop → push a new image element to the card → tear down. */
  function completeCrop() {
    if (!cropState) return;
    const { cw } = cropState;
    const cropped = cw.getCroppedCanvas();
    if (!cropped) {
      window.alert('请先调整裁剪框');
      return;
    }
    const cardSize = getCardSize();
    const srcW = cropped.width;
    const srcH = cropped.height;
    // Fit-within-card initial size, preserve aspect.
    const maxH = cardSize.h * 0.4;
    const maxW = cardSize.w * 0.6;
    const scale = Math.min(maxW / srcW, maxH / srcH);
    const w = srcW * scale;
    const h = srcH * scale;
    const id = `e${nextId++}`;
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
    finishCropInternal();
    renderElementList();
    renderProperties();
    drawDesigner();
  }

  /** Cancel cropping without adding an element. */
  function cancelCrop() {
    if (!cropState) return;
    finishCropInternal();
  }

  /** Tear down cropper, clear img src, hide panel. Idempotent. */
  function finishCropInternal() {
    if (cropState && cropState.cw) cropState.cw.destroy();
    els.cardCropImg.src = '';
    els.cardCropSection.hidden = true;
    cropState = null;
  }

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
      renderProperties();
      drawDesigner();
    }
  });

  // Initial render.
  syncSizeInputs();
  els.customRow.hidden = els.selectSize.value !== '自定义';
  renderElementList();
  if (els.propertiesSection) renderProperties();
  drawDesigner();

  // Wire properties panel sliders (only if DOM is wired — older tests omit these).
  if (els.propFontSizeInput) {
  els.propFontSizeInput.addEventListener('input', () => {
    const cur = elements.find(e => e.id === selectedId);
    if (!cur || cur.type !== 'text') return;
    const v = clamp(Number(els.propFontSizeInput.value), 2, 40);
    cur.fontSize = v;
    els.propFontSizeInput.value = String(round1(v));
    els.propFontSizeVal.textContent = `${round1(v)} mm`;
    drawDesigner();
  });

  const onPropW = (raw) => {
    const cur = elements.find(e => e.id === selectedId);
    if (!cur || cur.type !== 'image') return;
    const v = clamp(Number(raw), 1, 200);
    cur.w = v;
    if (cur.aspectLocked && cur._aspect) {
      cur.h = v / cur._aspect;
      els.propHInput.value = String(round1(cur.h));
      els.propHVal.textContent = `${round1(cur.h)} mm`;
    }
    els.propWInput.value = String(round1(v));
    els.propWVal.textContent = `${round1(v)} mm`;
    drawDesigner();
  };
  const onPropH = (raw) => {
    const cur = elements.find(e => e.id === selectedId);
    if (!cur || cur.type !== 'image') return;
    const v = clamp(Number(raw), 1, 200);
    cur.h = v;
    if (cur.aspectLocked && cur._aspect) {
      cur.w = v * cur._aspect;
      els.propWInput.value = String(round1(cur.w));
      els.propWVal.textContent = `${round1(cur.w)} mm`;
    }
    els.propHInput.value = String(round1(v));
    els.propHVal.textContent = `${round1(v)} mm`;
    drawDesigner();
  };
  els.propWInput.addEventListener('input', () => onPropW(els.propWInput.value));
  els.propHInput.addEventListener('input', () => onPropH(els.propHInput.value));

  els.propAspectToggle.addEventListener('click', () => {
    const cur = elements.find(e => e.id === selectedId);
    if (!cur || cur.type !== 'image') return;
    cur.aspectLocked = !cur.aspectLocked;
    if (cur.aspectLocked) cur._aspect = cur.w / cur.h || 1;
    renderProperties();
  });

  // Rect property sliders + color inputs.
  if (els.propRectWInput) {
    els.propRectWInput.addEventListener('input', () => {
      const cur = elements.find(e => e.id === selectedId);
      if (!cur || cur.type !== 'rect') return;
      const v = clamp(Number(els.propRectWInput.value), 1, 200);
      cur.width = v;
      if (cur.aspectLocked && cur._aspect) {
        cur.height = v / cur._aspect;
        els.propRectHInput.value = String(round1(cur.height));
        els.propRectHVal.textContent = `${round1(cur.height)} mm`;
      }
      els.propRectWInput.value = String(round1(v));
      els.propRectWVal.textContent = `${round1(v)} mm`;
      drawDesigner();
    });
    els.propRectHInput.addEventListener('input', () => {
      const cur = elements.find(e => e.id === selectedId);
      if (!cur || cur.type !== 'rect') return;
      const v = clamp(Number(els.propRectHInput.value), 1, 200);
      cur.height = v;
      if (cur.aspectLocked && cur._aspect) {
        cur.width = v * cur._aspect;
        els.propRectWInput.value = String(round1(cur.width));
        els.propRectWVal.textContent = `${round1(cur.width)} mm`;
      }
      els.propRectHInput.value = String(round1(v));
      els.propRectHVal.textContent = `${round1(v)} mm`;
      drawDesigner();
    });
    if (els.propRectAspectToggle) {
      els.propRectAspectToggle.addEventListener('click', () => {
        const cur = elements.find(e => e.id === selectedId);
        if (!cur || cur.type !== 'rect') return;
        cur.aspectLocked = !cur.aspectLocked;
        if (cur.aspectLocked) cur._aspect = cur.width / cur.height || 1;
        renderProperties();
      });
    }
    els.propBorderWidthInput.addEventListener('input', () => {
      const cur = elements.find(e => e.id === selectedId);
      if (!cur || cur.type !== 'rect') return;
      const v = clamp(Number(els.propBorderWidthInput.value), 0, 10);
      cur.borderWidth = v;
      els.propBorderWidthInput.value = String(round1(v));
      els.propBorderWidthVal.textContent = `${round1(v)} mm`;
      drawDesigner();
    });
    els.propBorderColor.addEventListener('input', () => {
      const cur = elements.find(e => e.id === selectedId);
      if (!cur || cur.type !== 'rect') return;
      cur.borderColor = els.propBorderColor.value || '#888888';
      drawDesigner();
    });
    els.propFillColor.addEventListener('input', () => {
      const cur = elements.find(e => e.id === selectedId);
      if (!cur || cur.type !== 'rect') return;
      cur.fillColor = els.propFillColor.value || '#ffffff';
      drawDesigner();
    });
  }
  }

  /** Number clamp helper for slider values. */
  function clamp(v, lo, hi) {
    if (!Number.isFinite(v)) return lo;
    return Math.min(hi, Math.max(lo, v));
  }

  /** Show the properties panel for the currently selected element (text or image). */
  function renderProperties() {
    // Defensive: bail out if properties DOM wasn't wired (e.g., older tests).
    if (!els.propertiesSection) return;
    const el = selectedId ? elements.find(e => e.id === selectedId) : null;
    if (!el) {
      els.propertiesSection.hidden = true;
      els.propFontSize.hidden = true;
      els.propImageDims.hidden = true;
      if (els.propRectDims) els.propRectDims.hidden = true;
      return;
    }
    els.propertiesSection.hidden = false;
    if (el.type === 'text') {
      els.propFontSize.hidden = false;
      els.propImageDims.hidden = true;
      if (els.propRectDims) els.propRectDims.hidden = true;
      els.propFontSizeInput.value = String(round1(el.fontSize));
      els.propFontSizeVal.textContent = `${round1(el.fontSize)} mm`;
    } else if (el.type === 'image') {
      els.propFontSize.hidden = true;
      els.propImageDims.hidden = false;
      if (els.propRectDims) els.propRectDims.hidden = true;
      // Capture aspect on selection (for locked mode).
      if (el.aspectLocked && !el._aspect) el._aspect = el.w / el.h || 1;
      els.propWInput.value = String(round1(el.w));
      els.propHInput.value = String(round1(el.h));
      els.propWVal.textContent = `${round1(el.w)} mm`;
      els.propHVal.textContent = `${round1(el.h)} mm`;
      els.propAspectToggle.textContent = el.aspectLocked ? '🔗' : '🔓';
      els.propAspectToggle.title = el.aspectLocked
        ? '已锁定比例（点击解锁）'
        : '未锁定比例（点击锁定）';
    } else if (el.type === 'rect') {
      els.propFontSize.hidden = true;
      els.propImageDims.hidden = true;
      els.propRectDims.hidden = false;
      if (el.aspectLocked && !el._aspect) el._aspect = el.width / el.height || 1;
      els.propRectWInput.value = String(round1(el.width));
      els.propRectHInput.value = String(round1(el.height));
      els.propRectWVal.textContent = `${round1(el.width)} mm`;
      els.propRectHVal.textContent = `${round1(el.height)} mm`;
      els.propBorderWidthInput.value = String(round1(el.borderWidth));
      els.propBorderWidthVal.textContent = `${round1(el.borderWidth)} mm`;
      els.propBorderColor.value = el.borderColor || '#888888';
      els.propFillColor.value = el.fillColor || '#ffffff';
      if (els.propRectAspectToggle) {
        els.propRectAspectToggle.textContent = el.aspectLocked ? '🔗' : '🔓';
        els.propRectAspectToggle.title = el.aspectLocked
          ? '已锁定比例（点击解锁）'
          : '未锁定比例（点击锁定）';
      }
    }
  }

  // --- Helpers ---

  function getCardSize() {
    const sel = els.selectSize.value;
    if (sel === '自定义') {
      return {
        w: Math.max(5, Number(els.cardW.value) || 90),
        h: Math.max(5, Number(els.cardH.value) || 54),
      };
    }
    const preset = CARD_SIZES[sel];
    if (!preset) return { w: 90, h: 54 };
    // Apply current orientation (radios swap w/h).
    return getOrientation() === 'landscape'
      ? { w: preset.h, h: preset.w }
      : preset;
  }

  function syncSizeInputs() {
    const sel = els.selectSize.value;
    const preset = CARD_SIZES[sel];
    if (preset) {
      els.cardW.value = String(preset.w);
      els.cardH.value = String(preset.h);
    }
    if (els.cardWVal) els.cardWVal.textContent = String(els.cardW.value);
    if (els.cardHVal) els.cardHVal.textContent = String(els.cardH.value);
    els.customRow.hidden = sel !== '自定义';
  }

  // Mirror display for slider values (border width may be a decimal).
  function mirrorBorderWidth() {
    if (els.cardBorderWidthVal) {
      els.cardBorderWidthVal.textContent = Number(els.cardBorderWidth.value).toFixed(1);
    }
  }

  function switchPhase(next) {
    phase = next;
    els.setPhase(next);
    if (next === 'arranging') {
      // Build the source item once; preview/exporter will repeat it.
      const item = new CardSourceItem(getCardSize(), els.getState().dpi, elements, border);
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
    const item = new CardSourceItem(cardSize, dpi, elements, border);
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
    if (dragOffset) drawDragGuides(ctx, dw, dh);
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
    if (el.type === 'rect') return { x: el.x, y: el.y, w: el.width, h: el.height };
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

  /** Clamp border width to the valid UI range (0–3 mm). */
  function clampBorderWidth(v) {
    if (!Number.isFinite(v)) return 0;
    return Math.min(3, Math.max(0, v));
  }

  /** Rebuild the source item for the arrange phase and trigger refresh. */
  function rebuildArrangeItem() {
    if (phase !== 'arranging') return;
    const item = new CardSourceItem(getCardSize(), els.getState().dpi, elements, border);
    els.setSourceItems([item]);
    els.requestRefresh();
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
        : el.type === 'rect'
        ? '矩形'
        : `图片`;
      label.addEventListener('click', () => {
        selectedId = el.id;
        renderElementList();
        renderProperties();
        drawDesigner();
      });
      row.appendChild(label);

      if (el.type === 'text') {
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-secondary';
        editBtn.textContent = '编辑';
        editBtn.title = '编辑文本内容';
        editBtn.addEventListener('click', () => beginEditText(el));
        row.appendChild(editBtn);
      }

      if (el.type === 'image') {
        // Width / height handled by properties panel sliders; element row only shows the label + delete.
      }

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-secondary';
      delBtn.textContent = '×';
      delBtn.title = '删除';
      delBtn.addEventListener('click', () => {
        elements = elements.filter(e => e.id !== el.id);
        if (selectedId === el.id) selectedId = null;
        renderElementList();
        renderProperties();
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
    renderProperties();
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
      cancelCrop();
      elements = [];
      selectedId = null;
      renderElementList();
      renderProperties();
      drawDesigner();
    },
    /** Cancel any active cropper. Safe to call when not cropping. */
    cancelCrop,
    /**
     * Start cropping a source canvas (HTMLCanvasElement). Exposed for
     * programmatic flows; the file-input handler calls this internally.
     */
    startCrop,
    /** Get the current arrangement orientation ('portrait'|'landscape'). */
    getArrangementOrient: () => arrangeOrient,
    /** Set the arrangement orientation (updates radio state only; layout is the consumer's job). */
    setArrangementOrient(value) {
      if (value !== 'portrait' && value !== 'landscape') return;
      arrangeOrient = value;
      const r = document.querySelector(`input[name="card-arrange-orientation"][value="${value}"]`);
      if (r) r.checked = true;
    },
  };
}

// Silence "unused" lint for elements kept for future use.
void CARD_FIELD_DEFAULTS;
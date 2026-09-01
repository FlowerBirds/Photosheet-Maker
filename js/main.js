import { PHOTO_SIZES, PAPER_SIZES } from './constants.js';
import { bindUploader } from './uploader.js';
import { createCropperWrapper } from './cropper-wrapper.js';
import { initConfigPanel } from './config-panel.js';
import { renderPreview } from './preview-renderer.js';
import { exportImage } from './exporter.js';
import { PhotoSourceItem } from './source-item.js';
import { createModeTab } from './mode-tab.js';
import { initCardEditor } from './card-editor.js';

// ---------- DOM refs ----------
const $ = (id) => document.getElementById(id);
const dom = {
  fileInput:     $('file-input'),
  cropImage:     $('crop-image'),
  uploadSection: $('upload-section'),
  cropSection:   $('crop-section'),
  settings:      $('settings-section'),
  btnReupload:   $('btn-reupload'),
  btnRecrop:     $('btn-recrop'),
  btnExport:     $('btn-export'),
  btnRotateL:    $('btn-rotate-left'),
  btnRotateR:    $('btn-rotate-right'),
  btnFinishCrop: $('btn-finish-crop'),
  preview:       $('preview-canvas'),
  cardCanvas:    $('card-canvas'),
  infoCount:     $('info-count'),
  infoSize:      $('info-size'),
  infoWarning:   $('info-warning'),
  toast:         $('toast'),
  // mode tabs
  tabPhoto:      $('tab-photo'),
  tabCard:       $('tab-card'),
  // card section
  cardSection:       $('card-editor-section'),
  selectCardSize:    $('select-card-size'),
  customCardSize:    $('custom-card-size'),
  cardW:             $('card-w'),
  cardH:             $('card-h'),
  designPhase:       $('card-design-phase'),
  arrangePhase:      $('card-arrange-phase'),
  btnAddText:        $('btn-add-text'),
  btnAddImage:       $('btn-add-image'),
  imageInput:        $('card-image-input'),
  elementList:       $('card-element-list'),
  btnComplete:       $('btn-complete-design'),
  btnRedesign:       $('btn-redesign'),
  // card crop phase
  cardCropSection:     $('card-crop-section'),
  cardCropImg:         $('card-crop-img'),
  btnCardCropRotateL:  $('btn-card-crop-rotate-left'),
  btnCardCropRotateR:  $('btn-card-crop-rotate-right'),
  btnCardCropFinish:   $('btn-card-crop-finish'),
  btnCardCropCancel:   $('btn-card-crop-cancel'),
  cardBorderWidth:    $('card-border-width'),
  cardBorderColor:    $('card-border-color'),
  cardBorderWidthVal: $('card-border-width-val'),
  cardWVal:           $('card-w-val'),
  cardHVal:           $('card-h-val'),
};

// ---------- State ----------
const state = {
  status: 'INITIAL',  // INITIAL | CROPPING | READY | EXPORTING
  originalImage: null,
  croppedCanvas: null,
  photoSize: '一寸',
  paperSize: '6寸（4R）',
  dpi: 350,
  margin: { top: 5, bottom: 5, left: 5, right: 5 },
  gap:    { h: 2, v: 2 },
  zoom: 1,        // per-photo zoom multiplier; does NOT affect layout
  rotation: 0,    // cumulative rotation in degrees (mod 360)
  showCropMarks: true,
  showFooter: true,
  sourceItems: [],     // current SourceItem[] (length 1 in photo, N in card)
  drawing: 'repeat',   // 'repeat' for photo, 'once' for card
  mode: 'PHOTO',       // 'PHOTO' | 'CARD'
};

const cropperWrapper = createCropperWrapper(dom.cropImage);

// ---------- Helpers ----------
function rebuildPhotoSource() {
  if (!state.croppedCanvas) { state.sourceItems = []; return; }
  state.sourceItems = [new PhotoSourceItem(state.croppedCanvas, state.photoSize, { rotation: state.rotation })];
}

// ---------- Toast ----------
let toastTimer = null;
function toast(msg, ms = 3000) {
  dom.toast.textContent = msg;
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (dom.toast.hidden = true), ms);
}

// ---------- Visibility helpers ----------
function showSectionsFor(status) {
  // Photo sections follow status; settings is shared (always shown outside PHOTO/INITIAL).
  if (state.mode === 'PHOTO') {
    dom.uploadSection.hidden = status !== 'INITIAL';
    dom.cropSection.hidden   = status === 'INITIAL';
    dom.settings.hidden      = status === 'INITIAL';
    dom.btnReupload.hidden   = status === 'INITIAL';
    dom.btnRecrop.hidden     = status !== 'READY';
  } else {
    // CARD mode: settings is always visible.
    dom.settings.hidden = false;
  }
}

/** Show / hide card-canvas vs preview-canvas based on phase. */
function showCardCanvas(show) {
  dom.cardCanvas.hidden = !show;
  dom.preview.hidden = show;
}

// ---------- State transitions ----------
function setStatus(next) {
  state.status = next;
  showSectionsFor(next);
}

function setState(patch) {
  Object.assign(state, patch);
  refresh();
}

// ---------- Refresh (recalculate + redraw) ----------
function refresh() {
  const st = state;
  if (st.sourceItems.length === 0) {
    clearInfoPanel();
    return;
  }

  const params = {
    paperSize: st.paperSize,
    margin: st.margin,
    gap: st.gap,
    drawing: st.drawing,
    zoom: st.zoom,
    showCropMarks: st.showCropMarks,
    showFooter: st.showFooter,
  };
  const layout = renderPreview(dom.preview, params, PAPER_SIZES, st.sourceItems);
  if (!layout) {
    clearInfoPanel();
    return;
  }

  const paper = PAPER_SIZES[st.paperSize];
  const w = Math.round(paper.w * st.dpi / 25.4);
  const h = Math.round(paper.h * st.dpi / 25.4);

  if (st.drawing === 'repeat') {
    dom.infoCount.textContent = layout.count;
    const orient = st.sourceItems[0].size.w >= st.sourceItems[0].size.h ? '横版' : '竖版';
    dom.infoSize.textContent = `${w} × ${h} px @ ${st.dpi} DPI · ${orient}`;
    if (layout.count === 0) {
      dom.infoWarning.textContent = '当前设置无法容纳任何照片，请缩小边距/间距或换大相纸';
      dom.infoWarning.hidden = false;
      dom.btnExport.disabled = true;
    } else {
      dom.infoWarning.hidden = true;
      dom.btnExport.disabled = st.status !== 'READY';
    }
  } else {
    const n = st.sourceItems.length;
    const m = layout.count;
    dom.infoCount.textContent = `${n} 张 / ${m} 容纳`;
    dom.infoSize.textContent = `${w} × ${h} px @ ${st.dpi} DPI`;
    if (n === 0) {
      dom.infoWarning.textContent = '请至少启用一个字段并填写数据';
      dom.infoWarning.hidden = false;
      dom.btnExport.disabled = true;
    } else if (n > m) {
      dom.infoWarning.textContent = `有 ${n - m} 张卡超出相纸容纳范围，未排版`;
      dom.infoWarning.hidden = false;
      dom.btnExport.disabled = false;
    } else {
      dom.infoWarning.hidden = true;
      dom.btnExport.disabled = false;
    }
  }
}

function clearInfoPanel() {
  dom.infoCount.textContent = '—';
  dom.infoSize.textContent  = '—';
  dom.infoWarning.hidden = true;
  dom.btnExport.disabled = true;
}

// ---------- Uploader wiring ----------
bindUploader(
  dom.fileInput,
  (img) => {
    state.originalImage = img;
    // img.src is now a blob: URL (from URL.createObjectURL).
    // Cropper.js needs the <img> element to actually load the source —
    // setting src and waiting one tick avoids a race on iOS Safari.
    dom.cropImage.onload = () => {
      const photo = PHOTO_SIZES[state.photoSize];
      try {
        cropperWrapper.init({ aspectRatio: photo.w / photo.h });
      } catch (err) {
        toast('初始化裁剪失败：' + err.message);
        return;
      }
      state.rotation = 0;
      setStatus('CROPPING');
      refresh();
      toast('图片加载完成，请调整裁剪框');
    };
    dom.cropImage.onerror = () => {
      toast('图片显示失败，请尝试其他浏览器');
    };
    dom.cropImage.src = img.src;
  },
  (err) => toast(err.message)
);

// ---------- Cropper wiring ----------
dom.btnRotateL.addEventListener('click', () => {
  if (state.status !== 'CROPPING') return;
  state.rotation = (state.rotation - 90) % 360;
  cropperWrapper.rotate(-90);
  // After rotation, aspect ratio flips too (rotate swaps w/h).
  const photo = PHOTO_SIZES[state.photoSize];
  const [w, h] = state.rotation % 180 === 0 ? [photo.w, photo.h] : [photo.h, photo.w];
  cropperWrapper.setAspectRatio(w / h);
});

dom.btnRotateR.addEventListener('click', () => {
  if (state.status !== 'CROPPING') return;
  state.rotation = (state.rotation + 90) % 360;
  cropperWrapper.rotate(90);
  const photo = PHOTO_SIZES[state.photoSize];
  const [w, h] = state.rotation % 180 === 0 ? [photo.w, photo.h] : [photo.h, photo.w];
  cropperWrapper.setAspectRatio(w / h);
});

dom.btnFinishCrop.addEventListener('click', () => {
  const canvas = cropperWrapper.getCroppedCanvas();
  if (!canvas) return;
  state.croppedCanvas = canvas;
  cropperWrapper.destroy();
  setStatus('READY');
  rebuildPhotoSource();
  refresh();
  toast('裁剪完成，已进入排版阶段');
});

dom.btnRecrop.addEventListener('click', () => {
  if (!state.originalImage) return;
  dom.cropImage.src = state.originalImage.src;
  const photo = PHOTO_SIZES[state.photoSize];
  cropperWrapper.init({ aspectRatio: photo.w / photo.h });
  setStatus('CROPPING');
  refresh();
});

// ---------- Settings wiring ----------
initConfigPanel(
  {
    photoSize: $('select-photo-size'),
    paperSize: $('select-paper-size'),
    dpi:       $('select-dpi'),
    marginTop:    $('margin-top'),    marginTopVal:    $('margin-top-val'),
    marginBottom: $('margin-bottom'), marginBottomVal: $('margin-bottom-val'),
    marginLeft:   $('margin-left'),   marginLeftVal:   $('margin-left-val'),
    marginRight:  $('margin-right'),  marginRightVal:  $('margin-right-val'),
    gapH:         $('gap-h'),         gapHVal:         $('gap-h-val'),
    gapV:         $('gap-v'),         gapVVal:         $('gap-v-val'),
    zoom:         $('zoom'),          zoomVal:         $('zoom-val'),
    showCropMarks: $('show-crop-marks'),
  showFooter: $('show-footer'),
  },
  (patch) => {
    // If photoSize changed, update Cropper aspect ratio (if active).
    if (patch.photoSize && cropperWrapper.isActive()) {
      const photo = PHOTO_SIZES[patch.photoSize];
      const [w, h] = state.rotation % 180 === 0 ? [photo.w, photo.h] : [photo.h, photo.w];
      cropperWrapper.setAspectRatio(w / h);
    }
    setState(patch);
    if (patch.photoSize !== undefined || patch.rotation !== undefined) {
      rebuildPhotoSource();
      refresh();
    }
  }
);

// ---------- Reupload & Export ----------
dom.btnReupload.addEventListener('click', () => {
  if (cropperWrapper.isActive()) cropperWrapper.destroy();
  state.originalImage = null;
  state.croppedCanvas = null;
  state.rotation = 0;
  state.sourceItems = [];
  dom.fileInput.value = '';
  setStatus('INITIAL');
  refresh();
});

dom.btnExport.addEventListener('click', async () => {
  if (state.sourceItems.length === 0) return;
  const choice = window.confirm('确定导出？\n确定 = JPG（较小）\n取消 = PNG（无损）');
  const format = choice ? 'jpeg' : 'png';
  const prevStatus = state.status;
  setStatus('EXPORTING');
  dom.btnExport.disabled = true;
  try {
    await exportImage(
      {
        sourceItems: state.sourceItems,
        paperSize: state.paperSize,
        dpi: state.dpi,
        margin: state.margin,
        gap: state.gap,
        drawing: state.drawing,
        zoom: state.zoom,
        showCropMarks: state.showCropMarks,
        showFooter: state.showFooter,
        format,
      },
      PAPER_SIZES
    );
    toast('已生成图片，请检查下载');
  } catch (err) {
    toast(err.message);
  } finally {
    setStatus(prevStatus === 'EXPORTING' ? 'READY' : prevStatus);
    refresh();
  }
});

// ---------- Mode tab ----------
// settings-section is shared between both modes (paper size, DPI, margin, gap).
const photoSections = [dom.uploadSection, dom.cropSection];
const cardSections  = [dom.cardSection];

// createModeTab attaches listeners to the tab buttons (its side effect).
// Note: cardEditor is referenced inside onSwitch, so it must be declared
// before this call.
const cardEditor = initCardEditor({
  designPanel:  dom.designPhase,
  cardCanvas:   dom.cardCanvas,
  btnAddText:   dom.btnAddText,
  btnAddImage:  dom.btnAddImage,
  imageInput:   dom.imageInput,
  elementList:  dom.elementList,
  btnComplete:  dom.btnComplete,
  btnRedesign:  dom.btnRedesign,
  selectSize:   dom.selectCardSize,
  customRow:    dom.customCardSize,
  cardW:        dom.cardW,
  cardH:        dom.cardH,
  cardBorderWidth: dom.cardBorderWidth,
  cardBorderColor: dom.cardBorderColor,
  cardBorderWidthVal: dom.cardBorderWidthVal,
  cardWVal: dom.cardWVal,
  cardHVal: dom.cardHVal,
  cardCropSection:    dom.cardCropSection,
  cardCropImg:        dom.cardCropImg,
  btnCardCropRotateL: dom.btnCardCropRotateL,
  btnCardCropRotateR: dom.btnCardCropRotateR,
  btnCardCropFinish:  dom.btnCardCropFinish,
  btnCardCropCancel:  dom.btnCardCropCancel,
  getState:     () => ({ paperSize: state.paperSize, dpi: state.dpi }),
  setSourceItems: (items) => { state.sourceItems = items; },
  setPhase: (phase) => {
    dom.designPhase.hidden  = phase !== 'designing';
    dom.arrangePhase.hidden = phase !== 'arranging';
    showCardCanvas(phase === 'designing');
  },
  requestRefresh: refresh,
});

createModeTab({
  photoBtn: dom.tabPhoto,
  cardBtn:  dom.tabCard,
  photoSections,
  cardSections,
  onSwitch: (newMode) => {
    state.mode = newMode;
    if (newMode === 'PHOTO') {
      // Restore photo cropper if needed.
      if (state.originalImage && !state.croppedCanvas && !cropperWrapper.isActive()) {
        dom.cropImage.src = state.originalImage.src;
        const photo = PHOTO_SIZES[state.photoSize];
        cropperWrapper.init({ aspectRatio: photo.w / photo.h });
        setStatus('CROPPING');
      } else if (state.croppedCanvas) {
        setStatus('READY');
      } else {
        setStatus('INITIAL');
      }
      state.drawing = 'repeat';
      rebuildPhotoSource();
    } else {
      // CARD mode: destroy any active cropper, jump straight to READY.
      if (cropperWrapper.isActive()) cropperWrapper.destroy();
      state.drawing = 'repeat';  // single CardSourceItem is repeated to fill paper
      setStatus('READY');
      // Enter designing phase (also makes card canvas visible).
      cardEditor.redraw();
      return;
    }
    refresh();
  },
});

// ---------- Global error handlers ----------
window.addEventListener('error', (e) => {
  console.error('[Photosheet]', e.error);
  toast('发生未知错误');
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Photosheet]', e.reason);
  toast('后台处理失败');
});

// ---------- Initial render ----------
showSectionsFor(state.status);
refresh();
// Default the card tab to designing phase (drives canvas visibility too).
cardEditor.redraw();
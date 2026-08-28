import { PHOTO_SIZES, PAPER_SIZES } from './constants.js';
import { bindUploader } from './uploader.js';
import { createCropperWrapper } from './cropper-wrapper.js';
import { initConfigPanel } from './config-panel.js';
import { renderPreview } from './preview-renderer.js';
import { exportImage } from './exporter.js';

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
  infoCount:     $('info-count'),
  infoSize:      $('info-size'),
  infoWarning:   $('info-warning'),
  toast:         $('toast'),
};

// ---------- State ----------
const state = {
  status: 'INITIAL',  // INITIAL | CROPPING | READY | EXPORTING
  originalImage: null,
  croppedCanvas: null,
  photoSize: '一寸',
  paperSize: 'A4',
  dpi: 350,
  margin: { top: 5, bottom: 5, left: 5, right: 5 },
  gap:    { h: 2, v: 2 },
  rotation: 0,  // cumulative rotation in degrees (mod 360)
};

const cropperWrapper = createCropperWrapper(dom.cropImage);

// ---------- Helpers ----------
/**
 * Return the photo size after accounting for cumulative rotation.
 * Rotating 90° or 270° swaps width and height (横竖互换).
 */
function getEffectivePhotoSize(photoSize, rotation) {
  const photo = PHOTO_SIZES[photoSize];
  return rotation % 180 === 0 ? photo : { w: photo.h, h: photo.w };
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
  dom.uploadSection.hidden = status !== 'INITIAL';
  dom.cropSection.hidden   = status === 'INITIAL';
  dom.settings.hidden      = status === 'INITIAL';
  dom.btnReupload.hidden   = status === 'INITIAL';
  dom.btnRecrop.hidden     = status !== 'READY';
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
  if (state.status === 'READY' || state.status === 'CROPPING') {
    const effectiveSize = getEffectivePhotoSize(state.photoSize, state.rotation);
    const layout = renderPreview(
      dom.preview,
      {
        photoSize: state.photoSize,
        paperSize: state.paperSize,
        margin: state.margin,
        gap: state.gap,
        rotation: state.rotation,
      },
      PHOTO_SIZES, PAPER_SIZES,
      state.status === 'READY' ? state.croppedCanvas : null
    );

    if (layout) {
      dom.infoCount.textContent = layout.count;
      const paper = PAPER_SIZES[state.paperSize];
      const w = Math.round(paper.w * state.dpi / 25.4);
      const h = Math.round(paper.h * state.dpi / 25.4);
      const orient = effectiveSize.w >= effectiveSize.h ? '横版' : '竖版';
      dom.infoSize.textContent = `${w} × ${h} px @ ${state.dpi} DPI · ${orient}`;
      if (layout.count === 0) {
        dom.infoWarning.textContent = '当前设置无法容纳任何照片，请缩小边距/间距或换大相纸';
        dom.infoWarning.hidden = false;
        dom.btnExport.disabled = true;
      } else {
        dom.infoWarning.hidden = true;
        dom.btnExport.disabled = state.status !== 'READY';
      }
    }
  }
}

// ---------- Uploader wiring ----------
bindUploader(
  dom.fileInput,
  (img) => {
    state.originalImage = img;
    dom.cropImage.src = img.src;
    const photo = PHOTO_SIZES[state.photoSize];
    cropperWrapper.init({ aspectRatio: photo.w / photo.h });
    state.rotation = 0;
    setStatus('CROPPING');
    refresh();
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
    marginTop: $('margin-top'),
    marginBottom: $('margin-bottom'),
    marginLeft: $('margin-left'),
    marginRight: $('margin-right'),
    gapH: $('gap-h'),
    gapV: $('gap-v'),
  },
  (patch) => {
    // If photoSize changed, update Cropper aspect ratio (if active).
    if (patch.photoSize && cropperWrapper.isActive()) {
      const photo = PHOTO_SIZES[patch.photoSize];
      const [w, h] = state.rotation % 180 === 0 ? [photo.w, photo.h] : [photo.h, photo.w];
      cropperWrapper.setAspectRatio(w / h);
    }
    setState(patch);
  }
);

// ---------- Reupload & Export ----------
dom.btnReupload.addEventListener('click', () => {
  if (cropperWrapper.isActive()) cropperWrapper.destroy();
  state.originalImage = null;
  state.croppedCanvas = null;
  state.rotation = 0;
  dom.fileInput.value = '';
  setStatus('INITIAL');
});

dom.btnExport.addEventListener('click', async () => {
  if (!state.croppedCanvas) return;
  const choice = window.confirm('确定导出？\n确定 = JPG（较小）\n取消 = PNG（无损）');
  const format = choice ? 'jpeg' : 'png';
  setStatus('EXPORTING');
  dom.btnExport.disabled = true;
  try {
    await exportImage(
      {
        croppedCanvas: state.croppedCanvas,
        photoSize: state.photoSize,
        paperSize: state.paperSize,
        dpi: state.dpi,
        margin: state.margin,
        gap: state.gap,
        rotation: state.rotation,
        format,
      },
      PHOTO_SIZES, PAPER_SIZES
    );
    toast('已生成图片，请检查下载');
  } catch (err) {
    toast(err.message);
  } finally {
    setStatus('READY');
    refresh();
  }
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

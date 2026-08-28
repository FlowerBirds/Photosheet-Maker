import { calculateLayout } from './layout-engine.js';
import { drawCropMarks } from './crop-marks.js';

// Maximum preview bounds — chosen so the preview fits both desktop and mobile.
const PREVIEW_MAX_WIDTH_PX  = 600;
const PREVIEW_MAX_HEIGHT_VH = 0.7; // 70% of viewport height
const WRAPPER_PADDING_PX    = 32;  // 16px each side (matches .preview-wrapper)

/**
 * Render the layout preview onto the given canvas at screen resolution.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   photoSize: string, paperSize: string,
 *   margin: {top:number,bottom:number,left:number,right:number},
 *   gap:    {h:number, v:number},
 *   rotation?: number,
 * }} params
 * @param {Record<string,{w:number,h:number}>} photoMap
 * @param {Record<string,{w:number,h:number}>} paperMap
 * @param {HTMLCanvasElement|null} croppedCanvas - the cropped source image
 */
export function renderPreview(canvas, params, photoMap, paperMap, croppedCanvas) {
  const ctx = canvas.getContext('2d');
  const photoBase = photoMap[params.photoSize];
  const paper = paperMap[params.paperSize];
  if (!photoBase || !paper) return;

  // Account for rotation: a 90°/270° rotation swaps width and height.
  const rotation = params.rotation || 0;
  const photo = rotation % 180 === 0 ? photoBase : { w: photoBase.h, h: photoBase.w };

  // Compute the largest scale that fits the preview within the available
  // space without stretching. Strategy differs by viewport:
  //   - Desktop (≥768px): width-first at PREVIEW_MAX_WIDTH_PX, with a tall
  //     height cap so A4/3A still renders large.
  //   - Mobile:  width = container width, height = 70vh (prevents
  //     stretching on narrow screens).
  const container = canvas.parentElement;
  const containerW = container ? container.clientWidth : window.innerWidth;
  const isDesktop = window.innerWidth >= 768;
  const maxW = isDesktop
    ? PREVIEW_MAX_WIDTH_PX
    : Math.max(50, containerW - WRAPPER_PADDING_PX);
  const maxH = isDesktop
    ? Math.max(PREVIEW_MAX_WIDTH_PX, window.innerHeight - 200)
    : Math.max(50, window.innerHeight * PREVIEW_MAX_HEIGHT_VH);
  const scale = Math.min(maxW / paper.w, maxH / paper.h);
  const displayW = paper.w * scale;
  const displayH = paper.h * scale;

  // Size the canvas (use devicePixelRatio for crisp rendering).
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = displayW * dpr;
  canvas.height = displayH * dpr;
  canvas.style.width  = `${displayW}px`;
  canvas.style.height = `${displayH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Clear & paint background.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, displayW, displayH);

  // Compute layout in mm → convert to px.
  const layout = calculateLayout(photo, paper, params.margin, params.gap);

  // Per-photo zoom — does NOT affect layout positions, only draw size.
  const zoom = params.zoom || 1;
  const drawW = photo.w * zoom;
  const drawH = photo.h * zoom;

  if (croppedCanvas) {
    for (const pos of layout.positions) {
      ctx.drawImage(
        croppedCanvas,
        pos.x * scale,
        pos.y * scale,
        drawW * scale,
        drawH * scale
      );
    }
    // Crop marks track the actual (zoomed) photo edge.
    drawCropMarks(ctx, layout, photo, scale, zoom);
  } else {
    // Fallback placeholder if no cropped canvas yet.
    ctx.fillStyle = '#e0e0e0';
    for (const pos of layout.positions) {
      ctx.fillRect(pos.x * scale, pos.y * scale, drawW * scale, drawH * scale);
    }
  }

  // Footer label: current zoom, bottom-center of the paper.
  // Small and faint — purely informational, won't be exported (we don't
  // draw it in exporter.js).
  ctx.fillStyle = '#999999';
  ctx.font = `${Math.max(10, scale * 3)}px -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${zoom.toFixed(2)}×`, displayW / 2, displayH - 4);

  return layout;
}

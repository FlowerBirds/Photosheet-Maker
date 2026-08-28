import { calculateLayout } from './layout-engine.js';

const PREVIEW_MAX_WIDTH_PX = 600;

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

  // Calculate scale to fit preview within PREVIEW_MAX_WIDTH_PX.
  const scale = PREVIEW_MAX_WIDTH_PX / paper.w;
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

  if (croppedCanvas) {
    for (const pos of layout.positions) {
      ctx.drawImage(
        croppedCanvas,
        pos.x * scale,
        pos.y * scale,
        photo.w * scale,
        photo.h * scale
      );
    }
  } else {
    // Fallback placeholder if no cropped canvas yet.
    ctx.fillStyle = '#e0e0e0';
    for (const pos of layout.positions) {
      ctx.fillRect(pos.x * scale, pos.y * scale, photo.w * scale, photo.h * scale);
    }
  }

  return layout;
}

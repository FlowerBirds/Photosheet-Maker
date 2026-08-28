import { calculateLayout } from './layout-engine.js';
import { CROP_MARK_OFFSET, CROP_MARK_LENGTH } from './constants.js';

/**
 * Generate the full-resolution output image and trigger a download.
 *
 * @param {{
 *   croppedCanvas: HTMLCanvasElement,
 *   photoSize: string, paperSize: string, dpi: number,
 *   margin: {top:number,bottom:number,left:number,right:number},
 *   gap:    {h:number, v:number},
 *   format: 'jpeg'|'png',
 * }} params
 * @param {Record<string,{w:number,h:number}>} photoMap
 * @param {Record<string,{w:number,h:number}>} paperMap
 * @returns {Promise<void>}
 */
export async function exportImage(params, photoMap, paperMap) {
  const { croppedCanvas, photoSize, paperSize, dpi, margin, gap, format } = params;
  const photo = photoMap[photoSize];
  const paper = paperMap[paperSize];

  // mm → pixels at output DPI.
  const mmToPx = dpi / 25.4;
  const canvasW = Math.round(paper.w * mmToPx);
  const canvasH = Math.round(paper.h * mmToPx);

  const out = document.createElement('canvas');
  out.width  = canvasW;
  out.height = canvasH;
  const ctx = out.getContext('2d');

  // White background.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Draw cropped photos at each layout position.
  const layout = calculateLayout(photo, paper, margin, gap);
  if (croppedCanvas && layout.count > 0) {
    for (const pos of layout.positions) {
      ctx.drawImage(
        croppedCanvas,
        Math.round(pos.x * mmToPx),
        Math.round(pos.y * mmToPx),
        Math.round(photo.w * mmToPx),
        Math.round(photo.h * mmToPx)
      );
    }

    // Crop marks: 4 short lines at each photo corner (inset by 3mm).
    drawCropMarks(ctx, layout, photo, mmToPx);
  }

  // Encode and trigger download.
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const quality = format === 'png' ? undefined : 0.95;
  const blob = await new Promise((resolve, reject) => {
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('生成图片失败'))),
      mime,
      quality
    );
  });

  triggerDownload(blob, `Photosheet_${Date.now()}.${format === 'png' ? 'png' : 'jpg'}`);
}

function drawCropMarks(ctx, layout, photo, mmToPx) {
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(1, mmToPx * 0.2);
  const offsetPx = CROP_MARK_OFFSET * mmToPx;
  const lengthPx = CROP_MARK_LENGTH * mmToPx;

  for (const pos of layout.positions) {
    const x = pos.x * mmToPx;
    const y = pos.y * mmToPx;
    const w = photo.w * mmToPx;
    const h = photo.h * mmToPx;

    // Top-left corner.
    line(ctx, x - offsetPx,        y - offsetPx, x - offsetPx,        y - offsetPx + lengthPx);
    line(ctx, x - offsetPx,        y - offsetPx, x - offsetPx + lengthPx, y - offsetPx);

    // Top-right corner.
    line(ctx, x + w + offsetPx,    y - offsetPx, x + w + offsetPx,    y - offsetPx + lengthPx);
    line(ctx, x + w + offsetPx,    y - offsetPx, x + w + offsetPx - lengthPx, y - offsetPx);

    // Bottom-left corner.
    line(ctx, x - offsetPx,        y + h + offsetPx, x - offsetPx,        y + h + offsetPx - lengthPx);
    line(ctx, x - offsetPx,        y + h + offsetPx, x - offsetPx + lengthPx, y + h + offsetPx);

    // Bottom-right corner.
    line(ctx, x + w + offsetPx,    y + h + offsetPx, x + w + offsetPx,    y + h + offsetPx - lengthPx);
    line(ctx, x + w + offsetPx,    y + h + offsetPx, x + w + offsetPx - lengthPx, y + h + offsetPx);
  }
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

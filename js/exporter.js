import { calculateLayout } from './layout-engine.js';
import { CROP_MARK_GAP, CROP_MARK_LENGTH } from './constants.js';

/**
 * Generate the full-resolution output image and trigger a download.
 *
 * @param {{
 *   croppedCanvas: HTMLCanvasElement,
 *   photoSize: string, paperSize: string, dpi: number,
 *   margin: {top:number,bottom:number,left:number,right:number},
 *   gap:    {h:number, v:number},
 *   rotation?: number,
 *   format: 'jpeg'|'png',
 * }} params
 * @param {Record<string,{w:number,h:number}>} photoMap
 * @param {Record<string,{w:number,h:number}>} paperMap
 * @returns {Promise<void>}
 */
export async function exportImage(params, photoMap, paperMap) {
  const { croppedCanvas, photoSize, paperSize, dpi, margin, gap, rotation = 0, format } = params;
  const photoBase = photoMap[photoSize];
  const paper = paperMap[paperSize];
  // Account for rotation: a 90°/270° rotation swaps width and height.
  const photo = rotation % 180 === 0 ? photoBase : { w: photoBase.h, h: photoBase.w };

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
  const gapPx   = CROP_MARK_GAP * mmToPx;   // gap outside the photo edge
  const lengthPx = CROP_MARK_LENGTH * mmToPx;

  for (const pos of layout.positions) {
    const x = pos.x * mmToPx;
    const y = pos.y * mmToPx;
    const w = photo.w * mmToPx;
    const h = photo.h * mmToPx;

    // The marks sit OUTSIDE each photo corner, with `gapPx` between the
    // photo edge and the mark. Two short segments form an L-shape at each
    // corner, so the photo can be cut cleanly without marks overlapping
    // the photo content.

    // Top-left corner.
    line(ctx, x - gapPx,          y - gapPx, x - gapPx,          y - gapPx + lengthPx);
    line(ctx, x - gapPx,          y - gapPx, x - gapPx + lengthPx, y - gapPx);

    // Top-right corner.
    line(ctx, x + w + gapPx,      y - gapPx, x + w + gapPx,      y - gapPx + lengthPx);
    line(ctx, x + w + gapPx,      y - gapPx, x + w + gapPx - lengthPx, y - gapPx);

    // Bottom-left corner.
    line(ctx, x - gapPx,          y + h + gapPx, x - gapPx,          y + h + gapPx - lengthPx);
    line(ctx, x - gapPx,          y + h + gapPx, x - gapPx + lengthPx, y + h + gapPx);

    // Bottom-right corner.
    line(ctx, x + w + gapPx,      y + h + gapPx, x + w + gapPx,      y + h + gapPx - lengthPx);
    line(ctx, x + w + gapPx,      y + h + gapPx, x + w + gapPx - lengthPx, y + h + gapPx);
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

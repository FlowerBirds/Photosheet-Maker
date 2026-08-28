import { calculateLayout } from './layout-engine.js';
import { drawCropMarks } from './crop-marks.js';

/**
 * Generate the full-resolution output image and trigger a download.
 *
 * @param {{
 *   croppedCanvas: HTMLCanvasElement,
 *   photoSize: string, paperSize: string, dpi: number,
 *   margin: {top:number,bottom:number,left:number,right:number},
 *   gap:    {h:number, v:number},
 *   rotation?: number,
 *   zoom?: number,
 *   showCropMarks?: boolean,
 *   format: 'jpeg'|'png',
 * }} params
 * @param {Record<string,{w:number,h:number}>} photoMap
 * @param {Record<string,{w:number,h:number}>} paperMap
 * @returns {Promise<void>}
 */
export async function exportImage(params, photoMap, paperMap) {
  const {
    croppedCanvas, photoSize, paperSize, dpi, margin, gap,
    rotation = 0, zoom = 1, showCropMarks = true, format,
  } = params;
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
  // Per-photo zoom — affects draw size only, not layout positions.
  // Overflow beyond paper edges is naturally clipped by the canvas.
  const drawW = photo.w * zoom;
  const drawH = photo.h * zoom;

  if (croppedCanvas && layout.count > 0) {
    for (const pos of layout.positions) {
      ctx.drawImage(
        croppedCanvas,
        Math.round(pos.x * mmToPx),
        Math.round(pos.y * mmToPx),
        Math.round(drawW * mmToPx),
        Math.round(drawH * mmToPx)
      );
    }

    // Crop marks track the actual (zoomed) photo edge — opt-in only.
    if (showCropMarks) {
      drawCropMarks(ctx, layout, photo, mmToPx, zoom);
    }

    // Footer: single centered line with repo URL + zoom, separated by a bullet.
    // Small and faint — purely informational.
    const fontSize = Math.max(10, mmToPx * 2.5);
    ctx.fillStyle = '#999999';
    ctx.font = `${fontSize}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      `github.com/FlowerBirds/Photosheet-Maker • ${zoom.toFixed(2)}×`,
      canvasW / 2,
      canvasH - 1 * mmToPx
    );
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

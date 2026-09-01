import { calculateLayout } from './layout-engine.js';
import { drawCropMarks } from './crop-marks.js';
import { arrangedSize } from './arrange-size.js';

/**
 * Generate the full-resolution output image and trigger a download.
 *
 * @param {{
 *   sourceItems: import('./source-item.js').SourceItem[],
 *   paperSize: string, dpi: number,
 *   margin: {top:number,bottom:number,left:number,right:number},
 *   gap:    {h:number, v:number},
 *   drawing: 'repeat'|'once',
 *   zoom?: number,                // photo mode only
 *   showCropMarks?: boolean,      // ignored in 'once' mode
 *   showFooter?: boolean,
 *   format: 'jpeg'|'png',
 *   arrangeOrient?: 'portrait'|'landscape',
 * }} params
 * @param {Record<string,{w:number,h:number}>} paperMap
 * @returns {Promise<void>}
 */
export async function exportImage(params, paperMap) {
  const {
    sourceItems, paperSize, dpi, margin, gap,
    drawing, zoom = 1, showCropMarks = true, showFooter = true, format,
    arrangeOrient: arrangeOrientParam,
  } = params;
  if (!sourceItems || sourceItems.length === 0) {
    throw new Error('没有可导出的内容');
  }
  const sourceSize = sourceItems[0].size;
  const arrangeOrient = arrangeOrientParam || 'portrait';
  const layoutSize = arrangedSize(sourceItems[0], arrangeOrient);
  const paper = paperMap[paperSize];
  if (!paper) throw new Error(`未知相纸尺寸: ${paperSize}`);

  const mmToPx = dpi / 25.4;
  const canvasW = Math.round(paper.w * mmToPx);
  const canvasH = Math.round(paper.h * mmToPx);

  const out = document.createElement('canvas');
  out.width = canvasW; out.height = canvasH;
  const ctx = out.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const layout = calculateLayout(layoutSize, paper, margin, gap);
  const drawW = layoutSize.w * zoom;
  const drawH = layoutSize.h * zoom;

  if (drawing === 'repeat') {
    // Photo / card-template mode: cycle source items to fill every position.
    for (let i = 0; i < layout.positions.length; i++) {
      const item = sourceItems[i % sourceItems.length];
      const pos = layout.positions[i];
      drawExportItem(ctx, item, pos, mmToPx, layoutSize, zoom);
    }
  } else {
    sourceItems.forEach((item, i) => {
      const pos = layout.positions[i];
      if (!pos) return;
      drawExportItem(ctx, item, pos, mmToPx, layoutSize, zoom);
    });
  }

  // Crop marks: shared toggle across both modes. Cards always pass zoom=1.
  if (showCropMarks) {
    drawCropMarks(ctx, layout, layoutSize, mmToPx, zoom);
  }

  // Footer (opt-in; default ON).
  if (showFooter) {
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

  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const quality = format === 'png' ? undefined : 0.95;
  const blob = await new Promise((resolve, reject) => {
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('生成图片失败'))),
      mime, quality
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

/**
 * Draw an item at mm coords on the export canvas, rotating 90° if
 * designedSize != layoutSize.
 */
function drawExportItem(ctx, item, pos, mmToPx, layoutSize, zoom) {
  const designedSize = item.size;
  const sameOrient = designedSize.w === layoutSize.w && designedSize.h === layoutSize.h;
  const xPx = Math.round(pos.x * mmToPx);
  const yPx = Math.round(pos.y * mmToPx);
  const wPx = Math.round(layoutSize.w * zoom * mmToPx);
  const hPx = Math.round(layoutSize.h * zoom * mmToPx);
  if (sameOrient) {
    ctx.drawImage(item.canvas, xPx, yPx, wPx, hPx);
  } else {
    ctx.save();
    ctx.translate(xPx + wPx, yPx);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(item.canvas, 0, 0, hPx, wPx);
    ctx.restore();
  }
}
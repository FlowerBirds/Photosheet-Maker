import { calculateLayout } from './layout-engine.js';
import { drawCropMarks } from './crop-marks.js';

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
 *   format: 'jpeg'|'png',
 * }} params
 * @param {Record<string,{w:number,h:number}>} paperMap
 * @returns {Promise<void>}
 */
export async function exportImage(params, paperMap) {
  const {
    sourceItems, paperSize, dpi, margin, gap,
    zoom = 1, showCropMarks = true, format,
  } = params;
  if (!sourceItems || sourceItems.length === 0) {
    throw new Error('没有可导出的内容');
  }
  const sourceSize = sourceItems[0].size;
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

  const layout = calculateLayout(sourceSize, paper, margin, gap);
  const drawW = sourceSize.w * zoom;
  const drawH = sourceSize.h * zoom;

  sourceItems.forEach((item, i) => {
    const pos = layout.positions[i];
    if (!pos) return;
    ctx.drawImage(
      item.canvas,
      Math.round(pos.x * mmToPx),
      Math.round(pos.y * mmToPx),
      Math.round(drawW * mmToPx),
      Math.round(drawH * mmToPx)
    );
  });

  // Crop marks: shared toggle across both modes. Cards always pass zoom=1.
  if (showCropMarks) {
    drawCropMarks(ctx, layout, sourceSize, mmToPx, zoom);
  }

  // Footer.
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
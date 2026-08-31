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
 *   paperSize: string,
 *   margin: {top:number,bottom:number,left:number,right:number},
 *   gap:    {h:number, v:number},
 *   drawing: 'repeat'|'once',     // photo mode = 'repeat', card mode = 'once'
 *   zoom?: number,                // per-photo zoom (photo mode only)
 *   showCropMarks?: boolean,
 *   showFooter?: boolean,
 * }} params
 * @param {Record<string,{w:number,h:number}>} paperMap
 * @param {import('./source-item.js').SourceItem[]} sourceItems
 */
export function renderPreview(canvas, params, paperMap, sourceItems) {
  const ctx = canvas.getContext('2d');
  if (!sourceItems || sourceItems.length === 0) {
    clearCanvas(canvas);
    return null;
  }
  const sourceSize = sourceItems[0].size;
  const paper = paperMap[params.paperSize];
  if (!paper) return null;

  // Preview scaling (unchanged).
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

  const dpr = window.devicePixelRatio || 1;
  canvas.width  = displayW * dpr;
  canvas.height = displayH * dpr;
  canvas.style.width  = `${displayW}px`;
  canvas.style.height = `${displayH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, displayW, displayH);

  const layout = calculateLayout(sourceSize, paper, params.margin, params.gap);
  const zoom = params.zoom || 1;
  const drawW = sourceSize.w * zoom;
  const drawH = sourceSize.h * zoom;

  if (params.drawing === 'repeat') {
    // Photo / card-template mode: cycle the source items to fill every position.
    for (let i = 0; i < layout.positions.length; i++) {
      const item = sourceItems[i % sourceItems.length];
      const pos = layout.positions[i];
      ctx.drawImage(item.canvas, pos.x * scale, pos.y * scale, drawW * scale, drawH * scale);
    }
  } else {
    // 'once' mode: each item at most once.
    sourceItems.forEach((item, i) => {
      const pos = layout.positions[i];
      if (!pos) return;
      ctx.drawImage(item.canvas, pos.x * scale, pos.y * scale, drawW * scale, drawH * scale);
    });
  }

  // Crop marks: shared toggle across both modes. Cards always pass zoom=1.
  if (params.showCropMarks !== false) {
    drawCropMarks(ctx, layout, sourceSize, scale, zoom);
  }

  // Footer (opt-in; default ON).
  if (params.showFooter !== false) {
    const fontSize = Math.max(10, scale * 3);
    ctx.fillStyle = '#999999';
    ctx.font = `${fontSize}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      `github.com/FlowerBirds/Photosheet-Maker • ${zoom.toFixed(2)}×`,
      displayW / 2,
      displayH - 4
    );
  }

  return layout;
}

function clearCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
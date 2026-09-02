import { calculateLayout } from './layout-engine.js';
import { drawCropMarks } from './crop-marks.js';
import { arrangedSize } from './arrange-size.js';

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
 *   arrangeOrient?: 'portrait'|'landscape',  // arrangement (layout) orientation, card mode only
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
  const arrangeOrient = params.arrangeOrient || 'portrait';
  const layoutSize = arrangedSize(sourceItems[0], arrangeOrient);
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

  const layout = calculateLayout(layoutSize, paper, params.margin, params.gap);
  const zoom = params.zoom || 1;

  if (params.drawing === 'repeat') {
    // Photo / card-template mode: cycle the source items to fill every position.
    for (let i = 0; i < layout.positions.length; i++) {
      const item = sourceItems[i % sourceItems.length];
      const pos = layout.positions[i];
      drawItemAtPosition(ctx, item, pos, scale, layoutSize, zoom);
    }
  } else {
    // 'once' mode: each item at most once.
    sourceItems.forEach((item, i) => {
      const pos = layout.positions[i];
      if (!pos) return;
      drawItemAtPosition(ctx, item, pos, scale, layoutSize, zoom);
    });
  }

  // Crop marks: shared toggle across both modes. Cards always pass zoom=1.
  if (params.showCropMarks !== false) {
    drawCropMarks(ctx, layout, layoutSize, scale, zoom);
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

/**
 * Draw an item at the given position, rotating 90° if designedSize != layoutSize.
 * Image is drawn centered on the cell (zoom grows/shrinks symmetrically around
 * the cell center, not the top-left corner).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{canvas:HTMLCanvasElement, size:{w:number,h:number}}} item
 * @param {{x:number,y:number}} pos      - position in mm on the layout (top-left of cell)
 * @param {number} scale                  - mm → display px
 * @param {{w:number,h:number}} layoutSize - layout (drawn) size in mm
 * @param {number} zoom                   - per-photo zoom multiplier (1 for cards)
 */
function drawItemAtPosition(ctx, item, pos, scale, layoutSize, zoom) {
  const designedSize = item.size;
  const sameOrient = designedSize.w === layoutSize.w && designedSize.h === layoutSize.h;
  const wPx = layoutSize.w * zoom * scale;
  const hPx = layoutSize.h * zoom * scale;
  // Cell is defined by layoutSize (the size that was used by calculateLayout).
  // The card source may have different (designed) dimensions; we rotate to fit
  // the cell. Crop marks are also drawn at layout cell boundaries.
  const cx = (pos.x + layoutSize.w / 2) * scale;
  const cy = (pos.y + layoutSize.h / 2) * scale;
  if (sameOrient) {
    ctx.drawImage(item.canvas, cx - wPx / 2, cy - hPx / 2, wPx, hPx);
  } else {
    // Rotate 90° around the cell center.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 2);
    // After rotate, local x → screen +y, local y → screen −x.
    // Drawing source at (-hPx/2, -wPx/2) places its center at local origin (=cell center).
    ctx.drawImage(item.canvas, -hPx / 2, -wPx / 2, hPx, wPx);
    ctx.restore();
  }
}
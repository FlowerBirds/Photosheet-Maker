import { SourceItem } from './source-item.js';
import { CARD_MAX_PX, DEFAULT_FIELD_COLOR } from './constants.js';

/**
 * Compute the effective render dpi for a batch of cards.
 * Clamps so the long side of the largest card doesn't exceed CARD_MAX_PX.
 * Returns an integer dpi used uniformly across the batch.
 *
 * @param {{w:number, h:number}} cardSize  - mm
 * @param {number} requestedDpi
 * @returns {number}
 */
export function computeCardDpi(cardSize, requestedDpi) {
  const longMm = Math.max(cardSize.w, cardSize.h);
  const pxAtRequested = longMm * requestedDpi / 25.4;
  if (pxAtRequested <= CARD_MAX_PX) return Math.round(requestedDpi);
  const clampedDpi = CARD_MAX_PX / longMm * 25.4;
  return Math.round(clampedDpi);
}

/**
 * Take a free image (canvas) and pass it through. Kept for API symmetry
 * with the old design; the renderer scales to fit at draw time.
 */
export function createCardImageSource(src, _cardSize) {
  return src;
}

/**
 * A single designed card template. Repeated across the paper.
 * Renders eagerly on construction; `.canvas` is reused on every access.
 */
export class CardSourceItem extends SourceItem {
  /**
   * @param {{w:number, h:number}} cardSize          - mm
   * @param {number} requestedDpi
   * @param {Array} elements                         - ElementText | ElementImage
   * @param {{width:number, color:string}} [border]  - optional card-level border (mm)
   */
  constructor(cardSize, requestedDpi, elements, border) {
    super();
    this._size = cardSize;
    this._dpi  = computeCardDpi(cardSize, requestedDpi);
    this._canvas = renderCardCanvas(cardSize, this._dpi, elements, border);
  }

  get size()   { return this._size; }
  get canvas() { return this._canvas; }
}

/**
 * Render one card to a fresh canvas at the given dpi. Elements are drawn
 * in array order (z-order: later = on top). Coordinate units are mm.
 *
 * @returns {HTMLCanvasElement}
 */
function renderCardCanvas(cardSize, dpi, elements, border) {
  const w = Math.round(cardSize.w * dpi / 25.4);
  const h = Math.round(cardSize.h * dpi / 25.4);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  // White background.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  const mmToPx = dpi / 25.4;

  for (const el of elements) {
    if (el.type === 'text') {
      const fontPx = Math.max(6, el.fontSize * mmToPx);
      ctx.font = `${fontPx}px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.fillStyle = el.color || DEFAULT_FIELD_COLOR;
      ctx.textBaseline = 'top';
      ctx.fillText(el.text || '', el.x * mmToPx, el.y * mmToPx);
    } else if (el.type === 'image' && el.src) {
      const dw = el.w * mmToPx;
      const dh = el.h * mmToPx;
      ctx.drawImage(el.src, el.x * mmToPx, el.y * mmToPx, dw, dh);
    } else if (el.type === 'rect') {
      const wPx = el.width * mmToPx;
      const hPx = el.height * mmToPx;
      const xPx = el.x * mmToPx;
      const yPx = el.y * mmToPx;
      // Fill first so border sits on top.
      ctx.fillStyle = el.fillColor || '#ffffff';
      ctx.fillRect(xPx, yPx, wPx, hPx);
      if (el.borderWidth > 0) {
        ctx.strokeStyle = el.borderColor || '#888888';
        ctx.lineWidth = Math.max(0.5, el.borderWidth * mmToPx);
        // Inset by half the line width so the stroke stays inside the rect.
        ctx.strokeRect(
          xPx + ctx.lineWidth / 2,
          yPx + ctx.lineWidth / 2,
          Math.max(0, wPx - ctx.lineWidth),
          Math.max(0, hPx - ctx.lineWidth)
        );
      }
    }
  }

  // Optional card-level border (drawn last, on top of all content).
  if (border && border.width > 0) {
    const bw = Math.max(0.5, border.width * mmToPx);
    ctx.strokeStyle = border.color || '#888888';
    ctx.lineWidth = bw;
    // Inset by half the line width so the stroke sits fully inside the canvas.
    ctx.strokeRect(bw / 2, bw / 2, w - bw, h - bw);
  }

  return c;
}
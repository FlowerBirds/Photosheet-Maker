import { SourceItem } from './source-item.js';
import { CARD_FONT_SIZE_RATIO, CARD_MAX_PX, DEFAULT_FIELD_COLOR } from './constants.js';

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
 * Take a free image (canvas) and produce a centered, fit-within-card
 * copy at the target size. Returns the same canvas (no shared refs
 * mutation; the renderer scales to fit at draw time).
 *
 * @param {HTMLCanvasElement} src
 * @param {{w:number, h:number}} _cardSize  - mm (reserved for future use)
 * @returns {HTMLCanvasElement}
 */
export function createCardImageSource(src, _cardSize) {
  return src;
}

/**
 * A single designed card.
 * Renders eagerly on construction; `.canvas` is reused on every access.
 */
export class CardSourceItem extends SourceItem {
  /**
   * @param {{w:number, h:number}} cardSize          - mm
   * @param {number} requestedDpi
   * @param {Array<{id:string,label:string,enabled:boolean,default:string,size:string,color:string}>} fields
   * @param {string} row                             - CSV row string for this card
   * @param {HTMLCanvasElement|null} imageCanvas     - shared embedded image (or null)
   */
  constructor(cardSize, requestedDpi, fields, row, imageCanvas) {
    super();
    this._size = cardSize;
    this._dpi  = computeCardDpi(cardSize, requestedDpi);
    this._canvas = renderCardCanvas(cardSize, this._dpi, fields, row, imageCanvas);
  }

  get size()   { return this._size; }
  get canvas() { return this._canvas; }
}

/**
 * Render one card to a fresh canvas at the given dpi.
 * @returns {HTMLCanvasElement}
 */
function renderCardCanvas(cardSize, dpi, fields, row, imageCanvas) {
  const w = Math.round(cardSize.w * dpi / 25.4);
  const h = Math.round(cardSize.h * dpi / 25.4);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  // White background.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // Embedded image (centered, fit-within-card, preserve aspect).
  if (imageCanvas) {
    drawImageCentered(ctx, imageCanvas, w, h);
  }

  // Parse row into keyed-by-column-index record.
  const cols = parseRow(row);

  // Vertical flow layout for text fields. Each enabled field gets an
  // equal slice of the available height — simple, predictable.
  const marginY = h * 0.06;
  const usableH = h - marginY * 2;
  const enabled = fields
    .map((f, idx) => ({ ...f, colIndex: idx }))
    .filter(f => f.enabled);
  const lineH = enabled.length > 0 ? usableH / enabled.length : 0;

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  enabled.forEach((field, i) => {
    const text = cols[`__c${field.colIndex}`] ?? field.default ?? '';
    if (!text) return;
    const ratio = CARD_FONT_SIZE_RATIO[field.size] ?? CARD_FONT_SIZE_RATIO.mid;
    const fontPx = Math.max(6, h * ratio);
    ctx.font = `${fontPx}px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = field.color || DEFAULT_FIELD_COLOR;
    ctx.fillText(text, w / 2, marginY + lineH * (i + 0.5));
  });

  return c;
}

/**
 * Lightweight CSV row splitter. Supports simple comma splits; does NOT
 * handle quoted fields with embedded commas (out of scope for v1).
 * @param {string} row
 * @returns {Record<string,string>}
 */
function parseRow(row) {
  if (typeof row !== 'string') return {};
  const parts = row.split(',').map(s => s.trim());
  const out = {};
  parts.forEach((p, i) => { out[`__c${i}`] = p; });
  return out;
}

function drawImageCentered(ctx, img, cardW, cardH) {
  const margin = Math.min(cardW, cardH) * 0.08;
  const boxW = cardW - margin * 2;
  const boxH = cardH * 0.4; // image occupies upper portion
  const scale = Math.min(boxW / img.width, boxH / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (cardW - dw) / 2;
  const dy = margin;
  ctx.drawImage(img, dx, dy, dw, dh);
}
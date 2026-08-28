import { CROP_MARK_GAP, CROP_MARK_LENGTH } from './constants.js';

/**
 * Draw L-shaped crop marks at each of the four corners of every photo
 * in the layout. The marks sit OUTSIDE the photo, with a 1mm gap, so
 * they don't overlap the photo content.
 *
 * The marks track the actual (possibly zoomed) photo edge, not the
 * nominal layout slot — so when zoom > 1, marks move outward.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{positions:Array<{x:number,y:number}>}} layout  - mm coordinates
 * @param {{w:number, h:number}} photo                    - nominal photo size in mm
 * @param {number} mmToPx                                  - mm → pixels scale
 * @param {number} [zoom=1]                                - per-photo zoom multiplier
 */
export function drawCropMarks(ctx, layout, photo, mmToPx, zoom = 1) {
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(0.5, mmToPx * 0.15);
  const gapPx    = CROP_MARK_GAP * mmToPx;
  const lengthPx = CROP_MARK_LENGTH * mmToPx;
  const drawW    = photo.w * zoom;  // actual drawn width in mm
  const drawH    = photo.h * zoom;

  for (const pos of layout.positions) {
    const x = pos.x * mmToPx;
    const y = pos.y * mmToPx;
    const w = drawW * mmToPx;
    const h = drawH * mmToPx;

    // Top-left corner.
    line(ctx, x - gapPx,        y - gapPx, x - gapPx,        y - gapPx + lengthPx);
    line(ctx, x - gapPx,        y - gapPx, x - gapPx + lengthPx, y - gapPx);

    // Top-right corner.
    line(ctx, x + w + gapPx,    y - gapPx, x + w + gapPx,    y - gapPx + lengthPx);
    line(ctx, x + w + gapPx,    y - gapPx, x + w + gapPx - lengthPx, y - gapPx);

    // Bottom-left corner.
    line(ctx, x - gapPx,        y + h + gapPx, x - gapPx,        y + h + gapPx - lengthPx);
    line(ctx, x - gapPx,        y + h + gapPx, x - gapPx + lengthPx, y + h + gapPx);

    // Bottom-right corner.
    line(ctx, x + w + gapPx,    y + h + gapPx, x + w + gapPx,    y + h + gapPx - lengthPx);
    line(ctx, x + w + gapPx,    y + h + gapPx, x + w + gapPx - lengthPx, y + h + gapPx);
  }
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

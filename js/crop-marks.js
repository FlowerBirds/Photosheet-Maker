import { CROP_MARK_GAP, CROP_MARK_LENGTH } from './constants.js';

/**
 * Draw L-shaped crop marks at each of the four corners of every photo
 * in the layout. The marks sit OUTSIDE the photo, with a 1mm gap, so
 * they don't overlap the photo content.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{positions:Array<{x:number,y:number}>}} layout  - mm coordinates
 * @param {{w:number, h:number}} photo                    - photo size in mm
 * @param {number} mmToPx                                  - mm → pixels scale
 */
export function drawCropMarks(ctx, layout, photo, mmToPx) {
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(0.5, mmToPx * 0.15);
  const gapPx    = CROP_MARK_GAP * mmToPx;
  const lengthPx = CROP_MARK_LENGTH * mmToPx;

  for (const pos of layout.positions) {
    const x = pos.x * mmToPx;
    const y = pos.y * mmToPx;
    const w = photo.w * mmToPx;
    const h = photo.h * mmToPx;

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

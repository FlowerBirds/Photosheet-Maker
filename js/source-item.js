import { PHOTO_SIZES } from './constants.js';

/**
 * Abstract interface. Concrete items expose:
 *   - .size   : { w, h } physical size in mm
 *   - .canvas : HTMLCanvasElement drawn at the per-item render dpi
 */
export class SourceItem {
  get size()   { throw new Error('SourceItem.size not implemented'); }
  get canvas() { throw new Error('SourceItem.canvas not implemented'); }
}

/**
 * Wraps a single cropped ID-photo. Photo mode repeats this item at every
 * layout position.
 */
export class PhotoSourceItem extends SourceItem {
  /**
   * @param {HTMLCanvasElement} croppedCanvas
   * @param {string} photoName     key in PHOTO_SIZES
   * @param {{rotation?: number}} [opts]
   */
  constructor(croppedCanvas, photoName, opts = {}) {
    super();
    this._canvas = croppedCanvas;
    this._base   = PHOTO_SIZES[photoName];
    this._rotation = opts.rotation || 0;
  }

  get size() {
    return this._rotation % 180 === 0
      ? this._base
      : { w: this._base.h, h: this._base.w };
  }

  get canvas() { return this._canvas; }
}
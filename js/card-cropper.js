/**
 * Thin wrapper around Cropper.js for the card-mode image cropper.
 *
 * Lifecycle:
 *   const cw = createCardCropper(imgEl);
 *   cw.init();                                // free aspect ratio
 *   cw.rotate(90);                            // rotate CW
 *   const canvas = cw.getCroppedCanvas();     // produce output
 *   cw.destroy();                             // tear down
 *
 * `opts.Cropper` is injectable for tests; defaults to globalThis.Cropper.
 */
export function createCardCropper(imgEl, opts = {}) {
  const Cropper = opts.Cropper || globalThis.Cropper;
  let cropper = null;

  return {
    /** Initialize Cropper.js on the given <img>. Idempotent. */
    init() {
      if (cropper) this.destroy();
      cropper = new Cropper(imgEl, {
        viewMode: 1,
        autoCropArea: 0.8,
        movable: true,
        scalable: true,
        zoomable: true,
        rotatable: true,
        responsive: true,
        // No aspectRatio → free crop box.
      });
    },

    /** Rotate the underlying image by `degrees` (CW positive). */
    rotate(degrees) {
      if (cropper) cropper.rotate(degrees);
    },

    /**
     * Produce the cropped output canvas.
     * @returns {HTMLCanvasElement|null}
     */
    getCroppedCanvas() {
      if (!cropper) return null;
      return cropper.getCroppedCanvas({
        fillColor: '#ffffff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });
    },

    /** Tear down the Cropper instance. Safe to call when not active. */
    destroy() {
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }
    },

    /** Whether a Cropper instance is currently active. */
    isActive() { return cropper !== null; },
  };
}
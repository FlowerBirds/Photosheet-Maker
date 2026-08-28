/**
 * Thin wrapper around Cropper.js to keep its API tidy and contained.
 *
 * Lifecycle:
 *   const cw = createCropperWrapper(imageElement);
 *   cw.init({ aspectRatio: 25/35 });           // start cropping
 *   cw.setAspectRatio(35/25);                   // update on size change / rotation
 *   cw.rotate(90);                              // rotate the canvas content
 *   const canvas = cw.getCroppedCanvas();       // produce output
 *   cw.destroy();                               // tear down
 */

export function createCropperWrapper(imgEl) {
  let cropper = null;

  return {
    /**
     * Initialize Cropper.js on the given <img>. Idempotent: destroys any existing instance first.
     * @param {{aspectRatio: number}} opts
     */
    init({ aspectRatio }) {
      if (cropper) this.destroy();
      cropper = new Cropper(imgEl, {
        aspectRatio,
        viewMode: 1,           // restrict crop box within canvas
        autoCropArea: 0.8,
        movable: true,
        scalable: true,
        zoomable: true,
        rotatable: true,
        responsive: true,
      });
    },

    /** Update the crop box aspect ratio (used when target size or rotation changes). */
    setAspectRatio(ratio) {
      if (!cropper) return;
      cropper.setAspectRatio(ratio);
    },

    /** Rotate the underlying image by `degrees` (CW positive). */
    rotate(degrees) {
      if (!cropper) return;
      cropper.rotate(degrees);
    },

    /**
     * Produce the cropped output canvas. Resolution is determined by the source image.
     * @param {{width?:number, height?:number, minWidth?:number, minHeight?:number}} [opts]
     * @returns {HTMLCanvasElement|null}
     */
    getCroppedCanvas(opts = {}) {
      if (!cropper) return null;
      return cropper.getCroppedCanvas({
        fillColor: '#ffffff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        ...opts,
      });
    },

    /** Tear down the Cropper instance and release the image. */
    destroy() {
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }
    },

    /** Whether a Cropper instance is currently active. */
    isActive() {
      return cropper !== null;
    },
  };
}

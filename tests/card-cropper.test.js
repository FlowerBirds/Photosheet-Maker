import { describe, it, expect, vi } from 'vitest';
import { createCardCropper } from '../js/card-cropper.js';

function fakeCropper() {
  return {
    rotate: vi.fn(),
    getCroppedCanvas: vi.fn(() => ({ width: 10, height: 10, __fake: true })),
    destroy: vi.fn(),
  };
}

describe('createCardCropper', () => {
  it('init creates a Cropper with free aspect ratio', () => {
    const Cropper = vi.fn(() => fakeCropper());
    const img = document.createElement('img');
    const cw = createCardCropper(img, { Cropper });
    cw.init();
    expect(Cropper).toHaveBeenCalledTimes(1);
    const opts = Cropper.mock.calls[0][1];
    expect(opts.viewMode).toBe(1);
    expect(opts.autoCropArea).toBe(0.8);
    expect(opts.movable).toBe(true);
    expect(opts.scalable).toBe(true);
    expect(opts.zoomable).toBe(true);
    expect(opts.rotatable).toBe(true);
    // No aspectRatio → free.
    expect(opts.aspectRatio).toBeUndefined();
  });

  it('init is idempotent (destroys existing before recreating)', () => {
    const instances = [fakeCropper(), fakeCropper()];
    const Cropper = vi.fn()
      .mockImplementationOnce(() => instances[0])
      .mockImplementationOnce(() => instances[1]);
    const img = document.createElement('img');
    const cw = createCardCropper(img, { Cropper });
    cw.init();
    cw.init();
    expect(instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(Cropper).toHaveBeenCalledTimes(2);
  });

  it('rotate forwards degrees to underlying cropper', () => {
    const inst = fakeCropper();
    const Cropper = vi.fn(() => inst);
    const img = document.createElement('img');
    const cw = createCardCropper(img, { Cropper });
    cw.init();
    cw.rotate(90);
    cw.rotate(-45);
    expect(inst.rotate).toHaveBeenNthCalledWith(1, 90);
    expect(inst.rotate).toHaveBeenNthCalledWith(2, -45);
  });

  it('rotate is no-op when not active', () => {
    const inst = fakeCropper();
    const Cropper = vi.fn(() => inst);
    const img = document.createElement('img');
    const cw = createCardCropper(img, { Cropper });
    cw.rotate(90);
    expect(inst.rotate).not.toHaveBeenCalled();
  });

  it('getCroppedCanvas returns the canvas from cropper', () => {
    const inst = fakeCropper();
    const Cropper = vi.fn(() => inst);
    const cw = createCardCropper(document.createElement('img'), { Cropper });
    cw.init();
    const out = cw.getCroppedCanvas();
    expect(out.__fake).toBe(true);
    expect(inst.getCroppedCanvas).toHaveBeenCalledWith(expect.objectContaining({
      fillColor: '#ffffff',
      imageSmoothingEnabled: true,
    }));
  });

  it('getCroppedCanvas returns null when not active', () => {
    const cw = createCardCropper(document.createElement('img'), { Cropper: vi.fn() });
    expect(cw.getCroppedCanvas()).toBeNull();
  });

  it('destroy tears down and is idempotent', () => {
    const inst = fakeCropper();
    const Cropper = vi.fn(() => inst);
    const cw = createCardCropper(document.createElement('img'), { Cropper });
    cw.init();
    cw.destroy();
    cw.destroy();
    expect(inst.destroy).toHaveBeenCalledTimes(1);
    expect(cw.isActive()).toBe(false);
  });

  it('isActive reflects current state', () => {
    const inst = fakeCropper();
    const Cropper = vi.fn(() => inst);
    const cw = createCardCropper(document.createElement('img'), { Cropper });
    expect(cw.isActive()).toBe(false);
    cw.init();
    expect(cw.isActive()).toBe(true);
    cw.destroy();
    expect(cw.isActive()).toBe(false);
  });
});
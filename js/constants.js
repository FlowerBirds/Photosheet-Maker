// 证件照 / ID-photo standard sizes in millimeters.
export const PHOTO_SIZES = {
  '一寸':   { w: 25, h: 35 },
  '小一寸': { w: 22, h: 32 },
  '大一寸': { w: 33, h: 48 },
  '二寸':   { w: 35, h: 49 },
  '小二寸': { w: 35, h: 45 },
  '大二寸': { w: 35, h: 53 },
};

// Common paper sizes in millimeters.
export const PAPER_SIZES = {
  '6寸（4R）': { w: 102, h: 152 },
  '5寸（3R）': { w: 89,  h: 127 },
  '7寸（5R）': { w: 127, h: 178 },
  'A6':       { w: 105, h: 148 },
  'A5':       { w: 148, h: 210 },
  'A4':       { w: 210, h: 297 },
  'A3':       { w: 297, h: 420 },
};

// Output resolution.
export const DEFAULT_DPI = 350;
export const DPI_OPTIONS = [150, 300, 350, 600];

// UI defaults.
export const DEFAULT_MARGIN = { top: 5, bottom: 5, left: 5, right: 5 };
export const DEFAULT_GAP    = { h: 2, v: 2 };

// File upload constraints.
export const MAX_FILE_BYTES  = 20 * 1024 * 1024; // 20 MB
export const ACCEPTED_TYPES  = ['image/jpeg', 'image/png', 'image/webp'];

// Crop-mark geometry in millimeters.
// Crop marks are drawn OUTSIDE the photo (with a small gap) so they don't
// overlap with the photo content.
export const CROP_MARK_GAP   = 1; // mm gap between photo edge and mark
export const CROP_MARK_LENGTH = 5; // mm line length

// Per-photo zoom (does NOT affect layout — only display & export size).
export const DEFAULT_ZOOM = 1;   // 1 = actual size
export const ZOOM_MIN     = 0;
export const ZOOM_MAX     = 2;
export const ZOOM_STEP    = 0.01;

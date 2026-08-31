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

// Show crop marks (角标) in preview and export. Toggleable in UI.
export const DEFAULT_SHOW_CROP_MARKS = true;

// ---------- Card maker ----------

// Card size presets (mm). 6寸系列按"6寸相纸可裁切"组织:
//   - 6寸 = 整张 6寸纸
//   - 6寸 1/2 = 半张（横切 102×76，2 张/纸）
//   - 6寸 1/4 = 四分之一（再纵切 51×76，4 张/纸）
export const CARD_SIZES = {
  '一寸':     { w: 25, h: 35 },
  '二寸':     { w: 35, h: 49 },
  '6寸 1/4':  { w: 51, h: 76 },
  '6寸 1/2':  { w: 102, h: 76 },
  '6寸':      { w: 102, h: 152 },
  '自定义':   { w: 90, h: 54 },
};
export const DEFAULT_CARD_SIZE = '一寸';

// Font-size presets for card text fields (ratio of card height).
export const CARD_FONT_SIZE_RATIO = { big: 0.12, mid: 0.07, small: 0.05 };

// Maximum per-card canvas resolution (px on longer side). Above this we
// scale the effective render dpi down uniformly for the whole batch.
export const CARD_MAX_PX = 1500;

// Default text color for new fields.
export const DEFAULT_FIELD_COLOR = '#222222';

// Default field list shown when user opens Card tab the first time.
export const CARD_FIELD_DEFAULTS = [
  { id: 'title', label: '标题', enabled: true,  default: '欢迎', size: 'big',   color: DEFAULT_FIELD_COLOR },
  { id: 'name',  label: '姓名', enabled: true,  default: '',     size: 'mid',   color: DEFAULT_FIELD_COLOR },
  { id: 'id',    label: '编号', enabled: true,  default: '',     size: 'small', color: DEFAULT_FIELD_COLOR },
  { id: 'note',  label: '备注', enabled: false, default: '',     size: 'small', color: DEFAULT_FIELD_COLOR },
];

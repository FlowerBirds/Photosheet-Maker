import {
  PHOTO_SIZES, PAPER_SIZES, DPI_OPTIONS,
  DEFAULT_MARGIN, DEFAULT_GAP,
} from './constants.js';

/**
 * Populate <select> with options derived from an object map.
 * @param {HTMLSelectElement} select
 * @param {Record<string,{w:number,h:number}>} map
 */
function fillSelect(select, map) {
  select.innerHTML = '';
  for (const [label, _] of Object.entries(map)) {
    const opt = document.createElement('option');
    opt.value = label;
    opt.textContent = label;
    select.appendChild(opt);
  }
}

/**
 * Wire a slider <input> to its mirror <span> so the displayed value
 * updates in real time as the user drags.
 *
 * @param {HTMLInputElement} input
 * @param {HTMLElement|null} mirror
 */
function bindSlider(input, mirror) {
  if (!input) return;
  const sync = () => {
    if (mirror) mirror.textContent = input.value;
  };
  // 'input' fires while dragging; 'change' covers older mobile browsers
  // that may only fire on release.
  input.addEventListener('input', sync);
  input.addEventListener('change', sync);
  sync();
}

/**
 * Initialize all controls in the settings panel and wire them to callbacks.
 *
 * @param {{
 *   photoSize: HTMLSelectElement,
 *   paperSize: HTMLSelectElement,
 *   dpi:       HTMLSelectElement,
 *   marginTop: HTMLInputElement, marginTopVal: HTMLElement,
 *   marginBottom: HTMLInputElement, marginBottomVal: HTMLElement,
 *   marginLeft: HTMLInputElement, marginLeftVal: HTMLElement,
 *   marginRight: HTMLInputElement, marginRightVal: HTMLElement,
 *   gapH: HTMLInputElement, gapHVal: HTMLElement,
 *   gapV: HTMLInputElement, gapVVal: HTMLElement,
 * }} els
 * @param {(patch: object) => void} onChange   - called with a partial state patch
 */
export function initConfigPanel(els, onChange) {
  // Populate selects.
  fillSelect(els.photoSize, PHOTO_SIZES);
  fillSelect(els.paperSize, PAPER_SIZES);
  els.dpi.innerHTML = '';
  for (const v of DPI_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = String(v);
    opt.textContent = `${v} DPI`;
    if (v === 350) opt.selected = true;
    els.dpi.appendChild(opt);
  }

  // Defaults.
  els.photoSize.value = '一寸';
  els.paperSize.value = 'A4';
  els.marginTop.value    = DEFAULT_MARGIN.top;
  els.marginBottom.value = DEFAULT_MARGIN.bottom;
  els.marginLeft.value   = DEFAULT_MARGIN.left;
  els.marginRight.value  = DEFAULT_MARGIN.right;
  els.gapH.value         = DEFAULT_GAP.h;
  els.gapV.value         = DEFAULT_GAP.v;

  // Wire each slider to its mirror span. `bindSlider` runs the initial
  // sync itself, so the displayed value reflects the defaults immediately.
  bindSlider(els.marginTop,    els.marginTopVal);
  bindSlider(els.marginBottom, els.marginBottomVal);
  bindSlider(els.marginLeft,   els.marginLeftVal);
  bindSlider(els.marginRight,  els.marginRightVal);
  bindSlider(els.gapH,         els.gapHVal);
  bindSlider(els.gapV,         els.gapVVal);

  // Debounced change handler for slider inputs.
  let timer = null;
  const debounced = (patch) => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange(patch), 100);
  };

  // Wire change events.
  els.photoSize.addEventListener('change', () => onChange({ photoSize: els.photoSize.value }));
  els.paperSize.addEventListener('change', () => onChange({ paperSize: els.paperSize.value }));
  els.dpi.addEventListener('change',       () => onChange({ dpi: Number(els.dpi.value) }));

  const marginPatch = () => ({
    margin: {
      top:    Number(els.marginTop.value),
      bottom: Number(els.marginBottom.value),
      left:   Number(els.marginLeft.value),
      right:  Number(els.marginRight.value),
    },
  });
  els.marginTop.addEventListener('input',    () => debounced(marginPatch()));
  els.marginBottom.addEventListener('input', () => debounced(marginPatch()));
  els.marginLeft.addEventListener('input',   () => debounced(marginPatch()));
  els.marginRight.addEventListener('input',  () => debounced(marginPatch()));

  const gapPatch = () => ({
    gap: { h: Number(els.gapH.value), v: Number(els.gapV.value) },
  });
  els.gapH.addEventListener('input', () => debounced(gapPatch()));
  els.gapV.addEventListener('input', () => debounced(gapPatch()));
}

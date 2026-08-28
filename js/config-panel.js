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
 * Initialize all controls in the settings panel and wire them to callbacks.
 *
 * @param {{
 *   photoSize: HTMLSelectElement,
 *   paperSize: HTMLSelectElement,
 *   dpi:       HTMLSelectElement,
 *   marginTop: HTMLInputElement, marginBottom: HTMLInputElement,
 *   marginLeft: HTMLInputElement, marginRight: HTMLInputElement,
 *   gapH: HTMLInputElement, gapV: HTMLInputElement,
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

  // Debounced change handler for numeric inputs.
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

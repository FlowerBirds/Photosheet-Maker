import {
  CARD_SIZES, DEFAULT_CARD_SIZE,
  CARD_FIELD_DEFAULTS, DEFAULT_FIELD_COLOR,
} from './constants.js';
import { CardSourceItem } from './card-builder.js';
import { parseBatchData } from './card-parser.js';
import { loadImageFile } from './uploader.js';

const SIZE_PRESETS = ['big', 'mid', 'small'];
const SIZE_LABELS  = { big: '大', mid: '中', small: '小' };

/**
 * Wire the card-editor DOM to the live source-list state.
 *
 * @param {{
 *   selectSize: HTMLSelectElement,
 *   customRow:  HTMLElement,
 *   cardW:      HTMLInputElement,
 *   cardH:      HTMLInputElement,
 *   fieldsRoot: HTMLElement,
 *   btnAdd:     HTMLButtonElement,
 *   dataArea:   HTMLTextAreaElement,
 *   rowCount:   HTMLElement,
 *   imgInput:   HTMLInputElement,
 *   btnRemoveImg: HTMLButtonElement,
 *   getState:   () => ({ mode: 'PHOTO'|'CARD', paperSize: string, dpi: number }),
 *   setSourceItems: (items: import('./source-item.js').SourceItem[]) => void,
 *   requestRefresh: () => void,
 * }} els
 */
export function initCardEditor(els) {
  // ---- populate size select ----
  for (const label of Object.keys(CARD_SIZES)) {
    const opt = document.createElement('option');
    opt.value = label; opt.textContent = label;
    els.selectSize.appendChild(opt);
  }
  els.selectSize.value = DEFAULT_CARD_SIZE;

  els.selectSize.addEventListener('change', () => {
    const sel = els.selectSize.value;
    const preset = CARD_SIZES[sel];
    // Sync w/h inputs to the preset so the user can switch to 自定义
    // and tweak from that baseline.
    if (preset) {
      els.cardW.value = String(preset.w);
      els.cardH.value = String(preset.h);
    }
    els.customRow.hidden = sel !== '自定义';
    rebuildSourceItems();
  });
  els.cardW.addEventListener('input', () => debounced(rebuildSourceItems));
  els.cardH.addEventListener('input', () => debounced(rebuildSourceItems));

  // ---- fields config ----
  els.fields = CARD_FIELD_DEFAULTS.map(f => ({ ...f }));
  renderFields();

  els.btnAdd.addEventListener('click', () => {
    const id = `f${Date.now()}`;
    els.fields.push({
      id, label: '新字段', enabled: true, default: '',
      size: 'mid', color: DEFAULT_FIELD_COLOR,
    });
    renderFields();
    rebuildSourceItems();
  });

  // ---- batch data ----
  els.dataArea.addEventListener('input', () => {
    updateRowCount();
    debounced(rebuildSourceItems);
  });

  // ---- embedded image ----
  els.imgInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const img = await loadImageFile(file);
      els.imageCanvas = document.createElement('canvas');
      els.imageCanvas.width = img.naturalWidth || img.width;
      els.imageCanvas.height = img.naturalHeight || img.height;
      const ctx = els.imageCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      els.btnRemoveImg.hidden = false;
      rebuildSourceItems();
    } catch (err) {
      els.imgInput.value = '';
      window.alert(err.message);
    }
  });
  els.btnRemoveImg.addEventListener('click', () => {
    els.imgInput.value = '';
    els.imageCanvas = null;
    els.btnRemoveImg.hidden = true;
    rebuildSourceItems();
  });

  // Initial render.
  els.customRow.hidden = els.selectSize.value !== '自定义';
  updateRowCount();
  rebuildSourceItems();

  // ---- internal helpers ----
  function updateRowCount() {
    const rows = parseBatchData(els.dataArea.value, els.fields.length);
    els.rowCount.textContent = `将生成 ${rows.length} 张卡片`;
  }

  function renderFields() {
    els.fieldsRoot.innerHTML = '';
    els.fields.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'card-field-row';
      row.innerHTML = `
        <div class="field-main">
          <input type="checkbox" ${f.enabled ? 'checked' : ''} title="启用" />
          <input type="text" value="${escapeHtml(f.label)}" title="字段标签" />
          <input type="text" value="${escapeHtml(f.default)}" placeholder="默认值" title="默认值" />
        </div>
        <div class="field-detail">
          <select title="字号">
              ${SIZE_PRESETS.map(s => `<option value="${s}" ${s===f.size?'selected':''}>${SIZE_LABELS[s]}</option>`).join('')}
            </select>
          <input type="color" value="${f.color}" title="颜色" />
          <span class="reorder">
            <button data-act="up"   ${i===0?'disabled':''}>↑</button>
            <button data-act="down" ${i===els.fields.length-1?'disabled':''}>↓</button>
          </span>
          <button class="delete-field btn-secondary" data-act="del">删</button>
        </div>
      `;
      const main = row.querySelector('.field-main');
      const detail = row.querySelector('.field-detail');
      const [chk, labelIn, defIn] = main.children;
      const [sel, colorIn] = detail.children;

      chk.addEventListener('change', () => { f.enabled = chk.checked; rebuildSourceItems(); });
      labelIn.addEventListener('input', () => { f.label = labelIn.value; debounced(rebuildSourceItems); });
      defIn.addEventListener('input',   () => { f.default = defIn.value; debounced(rebuildSourceItems); });
      sel.addEventListener('change',    () => { f.size = sel.value; rebuildSourceItems(); });
      colorIn.addEventListener('input', () => { f.color = colorIn.value; debounced(rebuildSourceItems); });
      detail.querySelector('[data-act="del"]').addEventListener('click', () => {
        els.fields.splice(i, 1);
        renderFields(); updateRowCount(); rebuildSourceItems();
      });
      detail.querySelector('[data-act="up"]').addEventListener('click', () => {
        if (i === 0) return;
        [els.fields[i-1], els.fields[i]] = [els.fields[i], els.fields[i-1]];
        renderFields(); rebuildSourceItems();
      });
      detail.querySelector('[data-act="down"]').addEventListener('click', () => {
        if (i === els.fields.length - 1) return;
        [els.fields[i+1], els.fields[i]] = [els.fields[i], els.fields[i+1]];
        renderFields(); rebuildSourceItems();
      });

      els.fieldsRoot.appendChild(row);
    });
  }

  function getCardSize() {
    const sel = els.selectSize.value;
    if (sel !== '自定义') return CARD_SIZES[sel];
    return {
      w: Math.max(5, Number(els.cardW.value) || 90),
      h: Math.max(5, Number(els.cardH.value) || 54),
    };
  }

  function rebuildSourceItems() {
    const st = els.getState();
    if (st.mode !== 'CARD') return;
    const cardSize = getCardSize();
    const rows = parseBatchData(els.dataArea.value, els.fields.length);
    const items = rows.map(row =>
      new CardSourceItem(cardSize, st.dpi, els.fields, csvFromRow(row), els.imageCanvas || null)
    );
    els.setSourceItems(items);
    els.requestRefresh();
  }

  function csvFromRow(row) {
    // Re-join row values in field order to feed CardSourceItem.
    return Object.keys(row).sort((a,b)=>Number(a)-Number(b)).map(k => row[k]).join(',');
  }
}

// ---- debounce ----
let _timer = null;
function debounced(fn) {
  clearTimeout(_timer);
  _timer = setTimeout(fn, 200);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}
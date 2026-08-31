/**
 * Parse multi-line CSV batch data into row objects keyed by column index.
 *
 * @param {string} text
 * @param {number} fieldCount  - number of columns the schema defines
 * @returns {Array<Record<number,string>>}
 */
export function parseBatchData(text, fieldCount) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(',').map(s => s.trim());
    const row = {};
    for (let i = 0; i < fieldCount; i++) {
      row[i] = parts[i] ?? '';
    }
    rows.push(row);
  }
  return rows;
}
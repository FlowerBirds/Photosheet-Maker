import { describe, it, expect } from 'vitest';
import { parseBatchData } from '../js/card-parser.js';

describe('parseBatchData', () => {
  it('parses rows by field order (col 0 → first field, etc.)', () => {
    const text = '张三, A001\n李四, A002\n';
    const out = parseBatchData(text, 2);
    expect(out).toEqual([
      { 0: '张三', 1: 'A001' },
      { 0: '李四', 1: 'A002' },
    ]);
  });

  it('uses empty string for missing columns (no field default here)', () => {
    const text = '张三\n李四, A002';
    const out = parseBatchData(text, 2);
    expect(out).toEqual([
      { 0: '张三', 1: '' },
      { 0: '李四', 1: 'A002' },
    ]);
  });

  it('ignores columns beyond field count', () => {
    const text = 'a, b, c, d';
    const out = parseBatchData(text, 2);
    expect(out).toEqual([{ 0: 'a', 1: 'b' }]);
  });

  it('skips empty lines (does not produce zero-column rows)', () => {
    const text = 'a, b\n\n  \nc, d';
    const out = parseBatchData(text, 2);
    expect(out).toEqual([
      { 0: 'a', 1: 'b' },
      { 0: 'c', 1: 'd' },
    ]);
  });

  it('returns [] for empty / whitespace-only input', () => {
    expect(parseBatchData('', 3)).toEqual([]);
    expect(parseBatchData('   \n  \n', 3)).toEqual([]);
  });
});
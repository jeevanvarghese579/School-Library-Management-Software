import { describe, expect, it } from 'vitest';
import { spreadsheetCellText } from './importExport';
import { normalizeBookText, prepareBookStorageData } from './bookService';

describe('spreadsheet import normalization', () => {
  it('converts numeric book numbers to text without calling trim on a number', () => {
    expect(spreadsheetCellText(2963)).toBe('2963');
    expect(spreadsheetCellText(0)).toBe('0');
  });

  it('preserves Malayalam text and trims surrounding whitespace', () => {
    expect(spreadsheetCellText('  പുസ്തകം  ')).toBe('പുസ്തകം');
  });

  it('handles empty spreadsheet cells', () => {
    expect(spreadsheetCellText(null)).toBe('');
    expect(spreadsheetCellText(undefined)).toBe('');
  });
});

describe('book search metadata', () => {
  it('creates normalized duplicate and prefix-search keys', () => {
    const prepared = prepareBookStorageData({
      book_number: '  AB-123 ',
      name: 'മലയാള പുസ്തകം',
      author: 'Author Name',
    });

    expect(prepared.book_number).toBe('AB-123');
    expect(prepared.book_number_key).toBe(normalizeBookText('AB-123'));
    expect(prepared.search_terms).toContain('മല');
    expect(prepared.search_terms).toContain('author');
  });
});

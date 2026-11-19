/**
 * Read a filled import template into plain rows, keyed by the column keys of
 * template.ts. Finds tabs and columns by their name in either language (or the
 * bilingual label), in any order, so a reordered or translated header still
 * reads. Server-only (exceljs).
 */
import ExcelJS from 'exceljs';
import { IMPORT_LIMITS, SHEETS, headerLabel, headerNames, sheetName, type SheetKey } from './template';
import type { ImportIssue } from './messages';
import type { CellValue } from './parse';

export interface RawRow {
  /** The Excel row number. */
  row: number;
  cells: Record<string, CellValue>;
}

export type RawSheets = Record<SheetKey, RawRow[]>;

const norm = (s: string) => s.replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** exceljs cell values come in many shapes; flatten to what parse.ts reads. */
function cellValue(cell: ExcelJS.Cell): CellValue {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('result' in v) {
      const r = (v as ExcelJS.CellFormulaValue).result;
      return r == null || typeof r === 'object' && !(r instanceof Date) ? null : (r as CellValue);
    }
    if ('text' in v) return String((v as ExcelJS.CellHyperlinkValue).text);
    if ('error' in v) return null;
  }
  return String(v);
}

export async function readWorkbook(buffer: Buffer | ArrayBuffer): Promise<{ sheets: RawSheets; issues: ImportIssue[] }> {
  const issues: ImportIssue[] = [];
  const sheets = { plans: [], captains: [], groups: [], trainees: [] } as RawSheets;

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as ArrayBuffer);
  } catch {
    return { sheets, issues: [{ code: 'file.unreadable' }] };
  }

  let total = 0;
  for (const def of SHEETS) {
    const names = [sheetName(def), def.en, def.ar].map(norm);
    const ws = wb.worksheets.find((w) => names.includes(norm(w.name)));
    if (!ws) {
      issues.push({ code: 'sheet.missing', params: { sheet: sheetName(def) }, sheet: def.key });
      continue;
    }

    // Header row: map each template column to its column number.
    const header = ws.getRow(1);
    const columnOf = new Map<string, number>();
    header.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const label = norm(String(cellValue(cell) ?? ''));
      const c = def.columns.find((c) => headerNames(c).map(norm).includes(label));
      if (c && !columnOf.has(c.key)) columnOf.set(c.key, colNumber);
    });
    for (const c of def.columns) {
      if (!columnOf.has(c.key)) issues.push({ code: 'column.missing', params: { sheet: sheetName(def), column: headerLabel(c) }, sheet: def.key });
    }

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const cells: Record<string, CellValue> = {};
      let any = false;
      for (const c of def.columns) {
        const n = columnOf.get(c.key);
        const v = n ? cellValue(row.getCell(n)) : null;
        cells[c.key] = v;
        if (v != null && String(v).trim() !== '') any = true;
      }
      if (any) sheets[def.key].push({ row: rowNumber, cells });
    });
    total += sheets[def.key].length;
  }

  if (total > IMPORT_LIMITS.maxRows) {
    return { sheets, issues: [{ code: 'file.tooManyRows', params: { max: IMPORT_LIMITS.maxRows } }] };
  }
  if (!issues.length && total === 0) issues.push({ code: 'file.empty' });
  return { sheets, issues };
}

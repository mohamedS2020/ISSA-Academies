/**
 * The two files the import hands back. Server-only (exceljs).
 *
 *   - markUpErrors: the academy's own file, each problem cell tinted red with
 *     a note saying what to fix, plus an Errors tab listing them all. The
 *     super admin sends it straight back to the academy.
 *   - buildCredentials: every new login (parents and captains) with its
 *     password. Built once, right after the import; the passwords are never
 *     stored readable, so this file is the only copy.
 */
import ExcelJS from 'exceljs';
import { brandArgb } from '@/lib/config/brand-colors';
import { issueText, type ImportIssue } from './messages';
import { SHEETS, headerLabel, headerNames, sheetName, type SheetKey } from './template';

const norm = (s: string) => s.replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: brandArgb('white') } };
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandArgb('deep-sea') } };
  });
}

export async function markUpErrors(original: Buffer | ArrayBuffer, issues: ImportIssue[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(original as ArrayBuffer);

  // Locate each issue's cell: its tab, then its column by header.
  const located = new Map<SheetKey, { ws: ExcelJS.Worksheet; columnOf: Map<string, number> }>();
  for (const def of SHEETS) {
    const names = [sheetName(def), def.en, def.ar].map(norm);
    const ws = wb.worksheets.find((w) => names.includes(norm(w.name)));
    if (!ws) continue;
    const columnOf = new Map<string, number>();
    ws.getRow(1).eachCell((cell, n) => {
      const label = norm(String(cell.text ?? ''));
      const c = def.columns.find((c) => headerNames(c).map(norm).includes(label));
      if (c && !columnOf.has(c.key)) columnOf.set(c.key, n);
    });
    located.set(def.key, { ws, columnOf });
  }

  const notes = new Map<ExcelJS.Cell, string[]>();
  for (const issue of issues) {
    if (!issue.sheet || !issue.row || !issue.column) continue;
    const at = located.get(issue.sheet as SheetKey);
    const col = at?.columnOf.get(issue.column);
    if (!at || !col) continue;
    const cell = at.ws.getCell(issue.row, col);
    const t = issueText(issue);
    notes.set(cell, [...(notes.get(cell) ?? []), `${t.ar}\n${t.en}`]);
  }
  for (const [cell, texts] of notes) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandArgb('danger-bg') } };
    cell.border = { top: { style: 'thin', color: { argb: brandArgb('danger') } }, bottom: { style: 'thin', color: { argb: brandArgb('danger') } }, left: { style: 'thin', color: { argb: brandArgb('danger') } }, right: { style: 'thin', color: { argb: brandArgb('danger') } } };
    cell.note = texts.join('\n\n');
  }

  // Every problem in one list, first tab, including those without a cell.
  const existing = wb.worksheets.find((w) => norm(w.name) === norm(sheetName({ en: 'Errors', ar: 'الأخطاء' })));
  if (existing) wb.removeWorksheet(existing.id);
  const list = wb.addWorksheet(sheetName({ en: 'Errors', ar: 'الأخطاء' }), { views: [{ state: 'frozen', ySplit: 1 }] });
  list.columns = [
    { header: 'Tab / الصفحة', width: 24 },
    { header: 'Row / الصف', width: 10 },
    { header: 'Column / العمود', width: 34 },
    { header: 'Problem', width: 70 },
    { header: 'المشكلة', width: 70 },
  ];
  styleHeader(list.getRow(1));
  for (const issue of issues) {
    const def = SHEETS.find((s) => s.key === issue.sheet);
    const column = def?.columns.find((c) => c.key === issue.column);
    const t = issueText(issue);
    const row = list.addRow([def ? sheetName(def) : '', issue.row ?? '', column ? headerLabel(column) : '', t.en, t.ar]);
    row.alignment = { wrapText: true, vertical: 'top' };
    row.getCell(5).alignment = { wrapText: true, vertical: 'top', horizontal: 'right', readingOrder: 'rtl' };
  }
  // Put the list first, so it's what opens.
  const order = wb.worksheets.map((w) => w.id);
  wb.worksheets.forEach((w) => {
    (w as unknown as { orderNo: number }).orderNo = w.id === list.id ? 0 : order.indexOf(w.id) + 1;
  });
  wb.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface Credential {
  kind: 'PARENT' | 'CAPTAIN';
  name: string;
  phone: string;
  password: string;
  /** For a parent: their children's names. */
  trainees?: string[];
}

export async function buildCredentials(academyName: string, branchName: string, rows: Credential[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName({ en: 'Logins', ar: 'بيانات الدخول' }), { views: [{ state: 'frozen', ySplit: 2 }] });
  ws.columns = [
    { width: 16 },
    { width: 28 },
    { width: 18 },
    { width: 14 },
    { width: 44 },
  ];
  const title = ws.addRow([`${academyName} · ${branchName}`]);
  title.font = { bold: true, size: 13 };
  const header = ws.addRow(['Type / النوع', 'Name / الاسم', 'Phone / الهاتف', 'Password / كلمة المرور', 'Trainees / المتدربون']);
  styleHeader(header);
  for (const r of rows) {
    const row = ws.addRow([
      r.kind === 'PARENT' ? 'Parent / ولي أمر' : 'Captain / كابتن',
      r.name,
      r.phone,
      r.password,
      (r.trainees ?? []).join('، '),
    ]);
    row.getCell(3).numFmt = '@';
    row.getCell(4).numFmt = '@';
    row.getCell(4).font = { name: 'Consolas' };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

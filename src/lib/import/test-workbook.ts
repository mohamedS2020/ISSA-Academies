/**
 * Test helper: the real template with rows filled in, as an academy would.
 * Used by the unit tests and the database tests (not shipped to the browser).
 */
import ExcelJS from 'exceljs';
import { buildTemplate } from './build-template';
import { SHEETS, sheetName, type SheetKey } from './template';

export type Filled = Partial<Record<SheetKey, Array<Record<string, unknown>>>>;

/** Rows keyed by column key; values written as the cell's value (string, number, Date). */
export async function filledTemplate(data: Filled, edit?: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildTemplate()) as unknown as ArrayBuffer);
  for (const def of SHEETS) {
    const ws = wb.getWorksheet(sheetName(def))!;
    (data[def.key] ?? []).forEach((row, i) => {
      def.columns.forEach((c, j) => {
        const v = row[c.key];
        if (v !== undefined) ws.getCell(i + 2, j + 1).value = v as ExcelJS.CellValue;
      });
    });
  }
  edit?.(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A small, valid academy: 2 plans, 2 captains, 2 groups, 4 trainees (2 siblings). */
export const SAMPLE: Filled = {
  plans: [
    { name: 'Monthly 8', sessions: 8, price: 500, period: 'Days from start / أيام من تاريخ البدء', periodDays: 30, absences: 2, retakeDays: 7, levels: 'Beginner, Intermediate' },
    { name: 'شهري', sessions: 12, price: 700, period: 'شهر ميلادي', absences: 1, retakeDays: 5, levels: 'مبتدئ، متقدم' },
  ],
  captains: [
    { name: 'Captain Hany', phone: '01011111111', days: 'Saturday, Monday', payType: 'Hourly / بالساعة', hourlyRate: 150 },
    { name: 'كابتن سارة', phone: '01022222222', days: 'السبت، الاثنين، الأربعاء' },
  ],
  groups: [
    { name: 'Dolphins', captain: 'Captain Hany', plan: 'Monthly 8', days: 'Sat, Mon', startTime: '17:00', duration: 60, minTrainees: 1, maxTrainees: 10 },
    { name: 'النجوم', captain: 'كابتن سارة', plan: 'شهري', days: 'السبت والاثنين', startTime: '5:30 م', duration: 45, minTrainees: 1, maxTrainees: 2 },
  ],
  trainees: [
    { name: 'Salma Ali', dateOfBirth: '12/03/2015', parentName: 'Ali Hassan', parentPhone: '01033333333', whatsapp: '01033333333', parentId: '29001011234567', medical: 'None', group: 'Dolphins', level: 'beginner', startDate: '01/11/2026', sessionsLeft: 5, amountPaid: 300 },
    { name: 'Omar Ali', dateOfBirth: '2017-06-20', parentName: 'Ali Hassan', parentPhone: '+201033333333', whatsapp: '01033333333', parentId: '29001011234567', medical: 'Asthma', group: 'Dolphins', level: 'Intermediate', startDate: '01/09/2026', sessionsLeft: 2 },
    { name: 'ليلى محمود', dateOfBirth: '01/01/2016', parentName: 'محمود سمير', parentPhone: '01044444444', whatsapp: '01044444444', parentId: '28501011234567', medical: 'لا يوجد', group: 'النجوم', level: 'متقدم', startDate: '01/11/2026', sessionsLeft: 12, amountPaid: 700 },
    { name: 'Youssef Adel', dateOfBirth: '05/05/2014', parentName: 'Adel Fathy', parentPhone: '01055555555', whatsapp: '01055555555', parentId: '28001011234567', medical: 'None' },
  ],
};

/** SAMPLE with its start dates moved relative to today, so tests never age. */
export function freshSample(): Filled {
  const data: Filled = JSON.parse(JSON.stringify(SAMPLE));
  const daysAgo = (n: number) => {
    const d = new Date(Date.now() - n * 86400000);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  };
  data.trainees![0].startDate = daysAgo(5); // current, 30-day plan
  data.trainees![1].startDate = daysAgo(60); // ended
  data.trainees![2].startDate = daysAgo(0); // calendar-month plan, starts today
  return data;
}

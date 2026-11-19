/**
 * The import template, end to end without a database: build the real
 * template, fill it like an academy would, read it back and check it.
 */
import ExcelJS from 'exceljs';
import * as P from './parse';
import { readWorkbook } from './read';
import { validateImport, summarize } from './validate';
import { markUpErrors } from './workbooks';
import { issueText, type ImportIssue } from './messages';
import { filledTemplate, SAMPLE, type Filled } from './test-workbook';
import { SHEETS, sheetName } from './template';

const TODAY = '2026-11-19';

async function check(data: Filled, edit?: (wb: ExcelJS.Workbook) => void) {
  const read = await readWorkbook(await filledTemplate(data, edit));
  expect(read.issues).toEqual([]);
  return validateImport(read.sheets, TODAY);
}

const codes = (issues: ImportIssue[]) => issues.map((i) => `${i.sheet}:${i.row}:${i.column}:${i.code}`);

const clone = (): Filled => JSON.parse(JSON.stringify(SAMPLE));

describe('cell parsing', () => {
  it('reads dates typed the Egyptian way, ISO, as Excel dates and serials', () => {
    expect(P.date('31/12/2015')).toBe('2015-12-31');
    expect(P.date('٣١/١٢/٢٠١٥')).toBe('2015-12-31');
    expect(P.date('2015-12-31')).toBe('2015-12-31');
    expect(P.date(new Date(Date.UTC(2015, 11, 31)))).toBe('2015-12-31');
    expect(P.date(42369)).toBe('2015-12-31');
    expect(P.date('31/02/2015')).toBeNull();
    expect(P.date('next week')).toBeNull();
  });

  it('reads times in 24 hours, AM/PM, Arabic and as Excel times', () => {
    expect(P.time('17:00')).toBe('17:00');
    expect(P.time('5:30 PM')).toBe('17:30');
    expect(P.time('5:30 م')).toBe('17:30');
    expect(P.time('9 ص')).toBe('09:00');
    expect(P.time('12:00 am')).toBe('00:00');
    expect(P.time(0.75)).toBe('18:00');
    expect(P.time(new Date(Date.UTC(1899, 11, 30, 16, 15)))).toBe('16:15');
    expect(P.time('17')).toBeNull();
    expect(P.time('25:00')).toBeNull();
  });

  it('reads phones as stored, keeping a 0 Excel dropped', () => {
    expect(P.phone('01012345678')).toBe('+201012345678');
    expect(P.phone(1012345678)).toBe('+201012345678');
    expect(P.phone('٠١٠١٢٣٤٥٦٧٨')).toBe('+201012345678');
    expect(P.phone('call me')).toBeNull();
  });

  it('reads days in both languages, any separator', () => {
    expect(P.days('Saturday, Monday').days).toEqual(['SATURDAY', 'MONDAY']);
    expect(P.days('السبت والاثنين و الأربعاء').days).toEqual(['SATURDAY', 'MONDAY', 'WEDNESDAY']);
    expect(P.days('sat mon').days).toEqual(['SATURDAY', 'MONDAY']);
    expect(P.days('Sat, Funday')).toMatchObject({ unknown: ['Funday'] });
    expect(P.days('Sat, Saturday').repeated).toBe(true);
  });

  it('reads amounts with Arabic digits, commas and currency', () => {
    expect(P.number('1,250.50')).toBe(1250.5);
    expect(P.number('٥٠٠ ج.م')).toBe(500);
    expect(P.number('abc')).toBeNull();
  });
});

describe('the template', () => {
  it('reads back what was filled, in either language, into what the import creates', async () => {
    const { plan, issues } = await check(SAMPLE);
    expect(issues).toEqual([]);
    expect(summarize(plan)).toEqual({
      plans: 2,
      levels: 4,
      captains: 2,
      groups: 2,
      trainees: 4,
      parentAccounts: 3,
      activeSubscriptions: 2,
      endedSubscriptions: 1,
      withoutSubscription: 1,
      amountPaid: 1000,
      amountDue: 700,
    });

    const [salma, omar, laila, youssef] = plan.trainees;
    // 8 sessions, 5 left → 3 attended; 30 days from 1 Nov; 300 of 500 paid.
    expect(salma.subscription).toMatchObject({
      levelName: 'Beginner',
      startDate: '2026-11-01',
      endDate: '2026-12-01',
      totalSessions: 8,
      attendedSessions: 3,
      amountPaid: 300,
      amountDue: 200,
      paymentStatus: 'PARTIAL',
      status: 'ACTIVE',
    });
    // Started 1 Sep, 30 days: ended before today, so it arrives ended.
    expect(omar.subscription).toMatchObject({ endDate: '2026-10-01', status: 'EXPIRED', paymentStatus: 'UNPAID', amountDue: 500 });
    // Calendar-month plan: ends on the last day of its month; fully paid.
    expect(laila.subscription).toMatchObject({ endDate: '2026-11-30', status: 'ACTIVE', paymentStatus: 'PAID', amountDue: 0 });
    expect(youssef.subscription).toBeNull();

    // Siblings: one parent account, both rows; phones stored normalized.
    expect(plan.accounts[0]).toEqual({ phone: '+201033333333', name: 'Ali Hassan', rows: [2, 3] });
    expect(plan.captains[1]).toMatchObject({ paySet: false, payrollType: 'HOURS', hourlyRate: null });
    expect(plan.captains[0]).toMatchObject({ paySet: true, hourlyRate: 150 });
    expect(plan.groups[1]).toMatchObject({ startTime: '17:30', scheduleDays: ['SATURDAY', 'MONDAY'] });
  });

  it('finds tabs and columns by name, in any order and either language', async () => {
    const buf = await filledTemplate(SAMPLE, (wb) => {
      const ws = wb.getWorksheet(sheetName(SHEETS[3]))!;
      ws.name = 'المتدربون';
      ws.getCell(1, 1).value = 'Trainee name';
    });
    const read = await readWorkbook(buf);
    expect(read.issues).toEqual([]);
    expect(read.sheets.trainees).toHaveLength(4);
  });

  it('still reads templates handed out before the currency left the headers', async () => {
    const buf = await filledTemplate(SAMPLE, (wb) => {
      wb.getWorksheet(sheetName(SHEETS[0]))!.getCell(1, 3).value = 'Price (EGP) / السعر (ج.م) *';
    });
    const read = await readWorkbook(buf);
    expect(read.issues).toEqual([]);
    expect(read.sheets.plans[0].cells.price).toBe(500);
  });

  it('reports a missing tab or column instead of guessing', async () => {
    const buf = await filledTemplate(SAMPLE, (wb) => {
      wb.removeWorksheet(wb.getWorksheet(sheetName(SHEETS[1]))!.id);
      wb.getWorksheet(sheetName(SHEETS[3]))!.getCell(1, 2).value = 'Birthday';
    });
    const read = await readWorkbook(buf);
    expect(read.issues.map((i) => i.code).sort()).toEqual(['column.missing', 'sheet.missing']);
  });

  it('rejects a file that is not a workbook', async () => {
    const read = await readWorkbook(Buffer.from('PK\x03\x04 not really a zip'));
    expect(read.issues.map((i) => i.code)).toEqual(['file.unreadable']);
  });
});

describe('checks', () => {
  it('names the exact cell of each problem in a row', async () => {
    const data = clone();
    Object.assign(data.trainees![3], { dateOfBirth: '31/02/2015', parentPhone: '0101', parentId: '123', medical: '' });
    const { issues, plan } = await check(data);
    expect(codes(issues)).toEqual([
      'trainees:5:dateOfBirth:cell.date',
      'trainees:5:parentPhone:cell.phone',
      'trainees:5:parentId:cell.tooShort',
      'trainees:5:medical:cell.required',
    ]);
    expect(plan.trainees).toHaveLength(3);
  });

  it('checks references across tabs without cascading', async () => {
    const data = clone();
    data.groups![0].captain = 'Captain Nobody';
    data.plans![1].price = 'free'; // the plan exists but has its own error
    const { issues } = await check(data);
    expect(codes(issues)).toEqual(
      expect.arrayContaining(['plans:3:price:cell.money', 'groups:2:captain:group.unknownCaptain'])
    );
    // No "unknown plan" for the group whose plan only has a price error.
    expect(codes(issues).some((c) => c.includes('unknownPlan'))).toBe(false);
  });

  it('checks a trainee level belongs to the group plan, sessions and amount fit the plan', async () => {
    const data = clone();
    Object.assign(data.trainees![0], { level: 'Expert', sessionsLeft: 9, amountPaid: 600 });
    const { issues } = await check(data);
    expect(codes(issues)).toEqual([
      'trainees:2:level:trainee.unknownLevel',
      'trainees:2:sessionsLeft:trainee.sessionsLeftTooMany',
      'trainees:2:amountPaid:trainee.paidTooMuch',
    ]);
    expect(issueText(issues[0]).en).toContain('Beginner، Intermediate');
  });

  it('wants all four subscription columns or none', async () => {
    const data = clone();
    delete data.trainees![0].startDate;
    data.trainees![3].amountPaid = 100;
    const { issues } = await check(data);
    expect(codes(issues)).toEqual([
      'trainees:2:startDate:trainee.subscriptionIncomplete',
      'trainees:5:amountPaid:trainee.paidWithoutSubscription',
    ]);
  });

  it('keeps siblings on one parent and phones on one person', async () => {
    const data = clone();
    data.trainees![1].parentName = 'Someone Else';
    data.trainees![2].parentPhone = '01011111111'; // captain Hany's number
    data.captains![1].phone = '01011111111';
    const { issues } = await check(data);
    expect(codes(issues)).toEqual([
      'captains:3:phone:phone.captainTwice',
      'trainees:3:parentName:trainee.parentNameMismatch',
      'trainees:4:parentPhone:phone.captainAndParent',
    ]);
  });

  it('keeps a group within its maximum, counting only current subscriptions', async () => {
    const data = clone();
    data.groups![0].maxTrainees = 1;
    data.trainees![1].startDate = '10/11/2026'; // Omar's subscription is now current too
    const { issues } = await check(data);
    expect(codes(issues)).toEqual(['groups:2:maxTrainees:group.overCapacity']);
  });

  it('refuses a start date after today and a birth date that is not past', async () => {
    const data = clone();
    data.trainees![0].startDate = '01/12/2026';
    data.trainees![3].dateOfBirth = '01/12/2026';
    const { issues } = await check(data);
    expect(codes(issues)).toEqual(['trainees:2:startDate:cell.dateNotFuture', 'trainees:5:dateOfBirth:cell.datePast']);
  });

  it('needs the rate of a chosen pay type, and the number of days of a days plan', async () => {
    const data = clone();
    delete data.captains![0].hourlyRate;
    delete data.plans![0].periodDays;
    data.plans![1].periodDays = 30;
    const { issues } = await check(data);
    expect(codes(issues)).toEqual([
      'plans:2:periodDays:plan.periodDaysRequired',
      'plans:3:periodDays:plan.periodDaysNotUsed',
      'captains:2:hourlyRate:captain.rateMissing',
    ]);
  });

  it('finds duplicates', async () => {
    const data = clone();
    data.groups!.push({ ...data.groups![0] });
    data.trainees!.push({ ...data.trainees![0] });
    const { issues } = await check(data);
    expect(codes(issues)).toEqual(['groups:4:name:group.duplicate', 'trainees:6:name:trainee.duplicate']);
  });

  it('every message has both languages', () => {
    const sample = issueText({ code: 'trainee.unknownLevel', params: { level: 'x', plan: 'y', levels: 'z' } });
    expect(sample.en).toMatch(/plan "y"/);
    expect(sample.ar).toMatch(/باقة "y"/);
  });
});

describe('the marked-up file', () => {
  it('tints each problem cell, notes the fix and lists everything first', async () => {
    const data = clone();
    data.trainees![0].parentPhone = 'abc';
    const file = await filledTemplate(data);
    const read = await readWorkbook(file);
    const { issues } = validateImport(read.sheets, TODAY);
    const marked = new ExcelJS.Workbook();
    await marked.xlsx.load((await markUpErrors(file, issues)) as unknown as ArrayBuffer);

    expect(marked.worksheets[0].name).toBe('Errors - الأخطاء');
    expect(marked.worksheets[0].getRow(2).getCell(4).text).toContain('phone number');
    const cell = marked.getWorksheet(sheetName(SHEETS[3]))!.getCell('D2');
    expect(String(cell.note ? (typeof cell.note === 'string' ? cell.note : JSON.stringify(cell.note)) : '')).toContain('01012345678');
    expect((cell.fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFFDECEA');
    // The academy's data is untouched.
    expect(cell.value).toBe('abc');
  });
});

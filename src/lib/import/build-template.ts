/**
 * The downloadable import template (.xlsx), built from template.ts.
 *
 *   - An Instructions tab, in both languages, with an example of every column.
 *   - One tab per kind of record, headers in both languages, required ones
 *     marked "*" and tinted.
 *   - Dropdowns: a group's captain and plan come from the Captains and Plans
 *     tabs, a trainee's group from the Groups tab, so the academy can only name
 *     records that exist in the file.
 *   - Phone and ID columns are text, so Excel keeps the leading 0 of 010…
 *
 * Server-only (exceljs).
 */
import ExcelJS from 'exceljs';
import { APP_NAME } from '@/lib/config/brand';
import { brandArgb } from '@/lib/config/brand-colors';
import {
  SHEETS,
  PAY_TYPE_OPTIONS,
  PERIOD_OPTIONS,
  headerLabel,
  optionLabel,
  sheetDef,
  sheetName,
  type ColumnDef,
  type SheetKey,
} from './template';

/** Rows the dropdowns and formats cover. Well above any academy's size. */
const ROWS = 2000;

const colLetter = (index: number) => {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const quoted = (key: SheetKey) => `'${sheetName(sheetDef(key))}'`;

/** The first column (names) of another tab, for a dropdown. */
const namesOf = (key: SheetKey) => `${quoted(key)}!$A$2:$A$${ROWS + 1}`;

function listFormula(sheet: SheetKey, c: ColumnDef): string | null {
  if (c.type === 'period') return `"${Object.values(PERIOD_OPTIONS).map(optionLabel).join(',')}"`;
  if (c.type === 'payType') return `"${Object.values(PAY_TYPE_OPTIONS).map(optionLabel).join(',')}"`;
  if (sheet === 'groups' && c.key === 'captain') return namesOf('captains');
  if (sheet === 'groups' && c.key === 'plan') return namesOf('plans');
  if (sheet === 'trainees' && c.key === 'group') return namesOf('groups');
  return null;
}

/**
 * exceljs supports range data validations ("B2:B2001") at runtime, written as
 * one rule, but its typings leave `dataValidations` off Worksheet.
 */
const withValidations = (ws: ExcelJS.Worksheet) =>
  ws as unknown as { dataValidations: { add(range: string, rule: ExcelJS.DataValidation): void } };

const NUM_FMT: Partial<Record<ColumnDef['type'], string>> = {
  phone: '@',
  text: '@',
  days: '@',
  levels: '@',
  date: 'dd/mm/yyyy',
  time: 'hh:mm',
  money: '0.00',
};

const INSTRUCTIONS: Array<[string, string]> = [
  ['How to fill this file', 'طريقة ملء هذا الملف'],
  [
    'Fill the tabs from left to right: Plans, Captains, Groups, then Trainees. Each tab uses names from the ones before it.',
    'املأ الصفحات بالترتيب: الباقات، ثم الكباتن، ثم المجموعات، ثم المتدربين. كل صفحة تستخدم أسماء من الصفحات السابقة.',
  ],
  [
    'Columns marked * are required. Keep the first row (the headers) and the tab names as they are.',
    'الأعمدة المعلّمة بـ * مطلوبة. لا تغيّر الصف الأول (العناوين) ولا أسماء الصفحات.',
  ],
  ['Plans', 'الباقات'],
  [
    'One row per plan. Period: "Days from start" lasts the number of days you enter; "Calendar month" ends at the end of the month it starts in. Levels: their names separated by commas, e.g. Beginner, Intermediate, Advanced.',
    'صف لكل باقة. المدة: "أيام من تاريخ البدء" تستمر عدد الأيام الذي تكتبه، و"شهر ميلادي" تنتهي بنهاية الشهر الذي تبدأ فيه. المستويات: أسماؤها مفصولة بفاصلة، مثل: مبتدئ، متوسط، متقدم.',
  ],
  ['Captains', 'الكباتن'],
  [
    'One row per captain, each with their own mobile number. Days: e.g. Saturday, Monday, Wednesday. Pay can stay empty and be set later from the captain\'s page.',
    'صف لكل كابتن، ولكل كابتن رقم موبايل خاص به. الأيام مثل: السبت، الاثنين، الأربعاء. يمكن ترك الأجر فارغًا وتحديده لاحقًا من صفحة الكابتن.',
  ],
  ['Groups', 'المجموعات'],
  [
    'Pick the captain and the plan from the lists. Start time like 17:00. Session length in minutes, e.g. 60.',
    'اختر الكابتن والباقة من القوائم. وقت البدء مثل 17:00. مدة الحصة بالدقائق، مثل 60.',
  ],
  ['Trainees', 'المتدربون'],
  [
    'One row per trainee. Brothers and sisters: write the same parent name and phone on each of their rows; they share one parent login.',
    'صف لكل متدرب. الإخوة: اكتب نفس اسم ولي الأمر ورقم هاتفه في صف كل منهم؛ يكون لهم حساب دخول واحد.',
  ],
  [
    'Current subscription: the group, the level (one of the group plan\'s levels), the date it started and how many sessions are left. Leave all four empty for a trainee without a subscription. A subscription that has ended is fine: the academy renews it in the system.',
    'الاشتراك الحالي: المجموعة، والمستوى (من مستويات باقة المجموعة)، وتاريخ بدايته، وعدد الحصص المتبقية. اترك الأربعة فارغة للمتدرب بدون اشتراك. لا مشكلة في اشتراك منتهٍ: تجدده الأكاديمية من النظام.',
  ],
  [
    'Amount paid: what the parent has paid for the current subscription so far. The rest shows as an outstanding balance.',
    'المبلغ المدفوع: ما دفعه ولي الأمر حتى الآن للاشتراك الحالي. يظهر الباقي كمبلغ مستحق.',
  ],
  [
    'Dates: day/month/year, e.g. 31/12/2015. Phones: mobile numbers as you dial them at home (e.g. 01012345678), or with the country code (+966…).',
    'التواريخ: يوم/شهر/سنة، مثل 31/12/2015. الهواتف: رقم الموبايل كما يُطلب محليًا (مثل 01012345678)، أو بمفتاح الدولة (+966…).',
  ],
];

export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = APP_NAME;
  wb.created = new Date();

  // Instructions
  const help = wb.addWorksheet(sheetName({ en: 'Instructions', ar: 'التعليمات' }));
  help.columns = [{ width: 90 }, { width: 90 }];
  for (const [en, ar] of INSTRUCTIONS) {
    const row = help.addRow([en, ar]);
    const isTitle = en.length < 30;
    row.eachCell((cell, n) => {
      cell.alignment = { wrapText: true, vertical: 'top', horizontal: n === 2 ? 'right' : 'left', readingOrder: n === 2 ? 'rtl' : 'ltr' };
      if (isTitle) cell.font = { bold: true, size: 13, color: { argb: brandArgb('deep-sea') } };
    });
  }

  for (const sheet of SHEETS) {
    const ws = wb.addWorksheet(sheetName(sheet), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = sheet.columns.map((c) => ({ key: c.key, width: c.width, style: NUM_FMT[c.type] ? { numFmt: NUM_FMT[c.type] } : {} }));
    const header = ws.getRow(1);
    sheet.columns.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = headerLabel(c);
      cell.font = { bold: true, color: { argb: c.required ? brandArgb('white') : brandArgb('midnight') } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required ? brandArgb('deep-sea') : brandArgb('mist') } };
      cell.alignment = { wrapText: true, vertical: 'middle' };
      cell.numFmt = '@';
    });
    header.height = 36;

    sheet.columns.forEach((c, i) => {
      const formula = listFormula(sheet.key, c);
      if (!formula) return;
      const letter = colLetter(i);
      withValidations(ws).dataValidations.add(`${letter}2:${letter}${ROWS + 1}`, {
        type: 'list',
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Choose from the list / اختر من القائمة',
        error: 'Pick a value from the list. / اختر قيمة من القائمة.',
      });
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const TEMPLATE_FILE_NAME = `${APP_NAME.toLowerCase()}-import-template.xlsx`;

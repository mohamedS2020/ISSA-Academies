/**
 * The academy data-import template: one definition of every tab and column.
 *
 * The downloadable workbook (build-template.ts), the reader (read.ts) and the
 * error messages all come from this file, so the three can never disagree. The
 * template is bilingual: every tab and header carries its English and Arabic
 * name ("Trainee name / اسم المتدرب"), and the reader accepts a header written
 * either way.
 *
 * Client-safe: no server imports.
 */

export type SheetKey = 'plans' | 'captains' | 'groups' | 'trainees';

export type ColumnType =
  | 'text'
  | 'phone' // normalised by src/lib/phone.ts, as everywhere else
  | 'int'
  | 'money'
  | 'percent'
  | 'date' // an Excel date, or typed as 31/12/2026 or 2026-12-31
  | 'time' // 17:00, 5:00 PM, 5:00 م, or an Excel time
  | 'days' // weekday names, Arabic or English, comma separated
  | 'period' // one of PERIOD_OPTIONS
  | 'payType' // one of PAY_TYPE_OPTIONS
  | 'levels'; // level names, comma separated

export interface ColumnDef {
  key: string;
  en: string;
  ar: string;
  required: boolean;
  type: ColumnType;
  /** Excel column width, in characters. */
  width: number;
}

export interface SheetDef {
  key: SheetKey;
  en: string;
  ar: string;
  columns: ColumnDef[];
}

const col = (key: string, en: string, ar: string, type: ColumnType, required: boolean, width = 22): ColumnDef => ({
  key,
  en,
  ar,
  type,
  required,
  width,
});

/** Choices for a plan's period. Matched on either language's half. */
export const PERIOD_OPTIONS = {
  FROM_SUBSCRIPTION_DATE: { en: 'Days from start', ar: 'أيام من تاريخ البدء' },
  FROM_MONTH_START: { en: 'Calendar month', ar: 'شهر ميلادي' },
} as const;

export const PAY_TYPE_OPTIONS = {
  HOURS: { en: 'Hourly', ar: 'بالساعة' },
  SALARY_PERCENTAGE: { en: 'Salary + percentage', ar: 'راتب + نسبة' },
} as const;

/** The text shown for a choice in a dropdown: "English / عربي". */
export const optionLabel = (o: { en: string; ar: string }) => `${o.en} / ${o.ar}`;

/** In the order the import creates them: each tab refers to the ones before it. */
export const SHEETS: SheetDef[] = [
  {
    key: 'plans',
    en: 'Plans',
    ar: 'الباقات',
    columns: [
      col('name', 'Plan name', 'اسم الباقة', 'text', true, 26),
      col('sessions', 'Sessions per subscription', 'عدد الحصص في الاشتراك', 'int', true),
      col('price', 'Price (EGP)', 'السعر (ج.م)', 'money', true, 16),
      col('period', 'Period', 'مدة الاشتراك', 'period', true, 34),
      col('periodDays', 'Number of days', 'عدد الأيام', 'int', false, 16),
      col('absences', 'Allowed absences', 'الغيابات المسموحة', 'int', true),
      col('retakeDays', 'Days to make up absences', 'أيام تعويض الغياب', 'int', true),
      col('levels', 'Levels (comma separated)', 'المستويات (مفصولة بفاصلة)', 'levels', true, 40),
    ],
  },
  {
    key: 'captains',
    en: 'Captains',
    ar: 'الكباتن',
    columns: [
      col('name', 'Captain name', 'اسم الكابتن', 'text', true, 26),
      col('phone', 'Phone', 'رقم الهاتف', 'phone', true, 18),
      col('days', 'Attending days', 'أيام الحضور', 'days', true, 34),
      col('specialization', 'Specialization', 'التخصص', 'text', false),
      col('payType', 'Pay type', 'نوع الأجر', 'payType', false, 30),
      col('hourlyRate', 'Hourly rate', 'سعر الساعة', 'money', false, 16),
      col('baseSalary', 'Base salary', 'الراتب الأساسي', 'money', false, 16),
      col('percentage', 'Percentage (%)', 'النسبة (%)', 'percent', false, 16),
    ],
  },
  {
    key: 'groups',
    en: 'Groups',
    ar: 'المجموعات',
    columns: [
      col('name', 'Group name', 'اسم المجموعة', 'text', true, 26),
      col('captain', 'Captain', 'الكابتن', 'text', true, 26),
      col('plan', 'Plan', 'الباقة', 'text', true, 26),
      col('days', 'Training days', 'أيام التمرين', 'days', true, 34),
      col('startTime', 'Start time', 'وقت البدء', 'time', true, 16),
      col('duration', 'Session length (minutes)', 'مدة الحصة (دقيقة)', 'int', true),
      col('minTrainees', 'Minimum trainees', 'أقل عدد متدربين', 'int', true),
      col('maxTrainees', 'Maximum trainees', 'أقصى عدد متدربين', 'int', true),
    ],
  },
  {
    key: 'trainees',
    en: 'Trainees',
    ar: 'المتدربون',
    columns: [
      col('name', 'Trainee name', 'اسم المتدرب', 'text', true, 26),
      col('dateOfBirth', 'Date of birth', 'تاريخ الميلاد', 'date', true, 16),
      col('parentName', 'Parent name', 'اسم ولي الأمر', 'text', true, 26),
      col('parentPhone', 'Parent phone', 'هاتف ولي الأمر', 'phone', true, 18),
      col('whatsapp', 'WhatsApp', 'رقم الواتساب', 'phone', true, 18),
      col('parentId', 'Parent ID number', 'الرقم القومي لولي الأمر', 'text', true),
      col('medical', 'Medical condition', 'الحالة الصحية', 'text', true, 26),
      col('group', 'Group', 'المجموعة', 'text', false, 26),
      col('level', 'Level', 'المستوى', 'text', false, 18),
      col('startDate', 'Subscription start date', 'تاريخ بداية الاشتراك', 'date', false),
      col('sessionsLeft', 'Sessions left', 'الحصص المتبقية', 'int', false, 16),
      col('amountPaid', 'Amount paid (EGP)', 'المبلغ المدفوع (ج.م)', 'money', false, 18),
    ],
  },
];

export const sheetDef = (key: SheetKey): SheetDef => SHEETS.find((s) => s.key === key)!;

/** The tab's name in the workbook (Excel allows 31 characters, no "/"). */
export const sheetName = (s: { en: string; ar: string }) => `${s.en} - ${s.ar}`;

/** A column's header cell. Required columns end with " *". */
export const headerLabel = (c: ColumnDef) => `${c.en} / ${c.ar}${c.required ? ' *' : ''}`;

/** The subscription columns of a trainee row: all filled, or all empty. */
export const SUBSCRIPTION_COLUMNS = ['group', 'level', 'startDate', 'sessionsLeft'] as const;

/** Upper bounds, checked before anything is read. */
export const IMPORT_LIMITS = {
  /** Bytes. */
  maxFileSize: 5 * 1024 * 1024,
  /** Data rows over all tabs. */
  maxRows: 5000,
};

export type Weekday = 'SATURDAY' | 'SUNDAY' | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY';

/** Weekday names the reader accepts, per DayOfWeek. Arabic with and without hamza. */
export const DAY_NAMES: Record<Weekday, string[]> = {
  SATURDAY: ['saturday', 'sat', 'السبت', 'سبت'],
  SUNDAY: ['sunday', 'sun', 'الأحد', 'الاحد', 'احد', 'أحد'],
  MONDAY: ['monday', 'mon', 'الإثنين', 'الاثنين', 'الأثنين', 'اثنين', 'إثنين'],
  TUESDAY: ['tuesday', 'tue', 'tues', 'الثلاثاء', 'ثلاثاء', 'الثلاثا'],
  WEDNESDAY: ['wednesday', 'wed', 'الأربعاء', 'الاربعاء', 'اربعاء', 'أربعاء', 'الاربعا'],
  THURSDAY: ['thursday', 'thu', 'thur', 'thurs', 'الخميس', 'خميس'],
  FRIDAY: ['friday', 'fri', 'الجمعة', 'الجمعه', 'جمعة', 'جمعه'],
};

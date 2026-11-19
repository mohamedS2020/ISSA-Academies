/**
 * Every problem the import can report, in English and Arabic.
 *
 * The super admin reads them on the check screen; the academy reads them in
 * the marked-up copy of its own file, so each message names the fix in plain
 * words, never a code. Client-safe.
 */

export type IssueParams = Record<string, string | number>;

type Text = (p: IssueParams) => { en: string; ar: string };

const MESSAGES = {
  // The file as a whole
  'file.tooLarge': () => ({ en: 'The file is larger than 5 MB.', ar: 'حجم الملف أكبر من 5 ميجابايت.' }),
  'file.notXlsx': () => ({
    en: 'Upload an Excel file (.xlsx) made from the template.',
    ar: 'ارفع ملف إكسل (.xlsx) من القالب.',
  }),
  'file.unreadable': () => ({
    en: "The file couldn't be read. Save it again as .xlsx and retry.",
    ar: 'تعذّرت قراءة الملف. احفظه مرة أخرى بصيغة ‎.xlsx وحاول مجددًا.',
  }),
  'file.tooManyRows': (p) => ({
    en: `The file has more than ${p.max} rows. Split it into smaller files.`,
    ar: `الملف به أكثر من ${p.max} صف. قسّمه إلى ملفات أصغر.`,
  }),
  'file.empty': () => ({ en: 'The file has no data rows.', ar: 'الملف لا يحتوي على بيانات.' }),
  'sheet.missing': (p) => ({
    en: `The "${p.sheet}" tab is missing. Use the template without renaming its tabs.`,
    ar: `صفحة "${p.sheet}" غير موجودة. استخدم القالب دون تغيير أسماء صفحاته.`,
  }),
  'column.missing': (p) => ({
    en: `The "${p.column}" column is missing from the "${p.sheet}" tab.`,
    ar: `عمود "${p.column}" غير موجود في صفحة "${p.sheet}".`,
  }),

  // One cell
  'cell.required': () => ({ en: 'Required. Fill this cell.', ar: 'مطلوب. املأ هذه الخانة.' }),
  'cell.phone': () => ({
    en: 'Not a valid phone number. Write it like 01012345678.',
    ar: 'رقم هاتف غير صحيح. اكتبه مثل 01012345678.',
  }),
  'cell.int': () => ({ en: 'Enter a whole number.', ar: 'أدخل رقمًا صحيحًا.' }),
  'cell.intMin': (p) => ({ en: `Enter ${p.min} or more.`, ar: `أدخل ${p.min} أو أكثر.` }),
  'cell.intMax': (p) => ({ en: `Enter ${p.max} or less.`, ar: `أدخل ${p.max} أو أقل.` }),
  'cell.money': () => ({ en: 'Enter an amount in numbers.', ar: 'أدخل المبلغ بالأرقام.' }),
  'cell.moneyPositive': () => ({ en: 'Enter an amount above 0.', ar: 'أدخل مبلغًا أكبر من صفر.' }),
  'cell.percent': () => ({ en: 'Enter a percentage from 0 to 100.', ar: 'أدخل نسبة من 0 إلى 100.' }),
  'cell.date': () => ({
    en: 'Not a date. Write it as day/month/year, e.g. 31/12/2015.',
    ar: 'ليس تاريخًا. اكتبه يوم/شهر/سنة، مثال: 31/12/2015.',
  }),
  'cell.datePast': () => ({ en: 'Must be a date in the past.', ar: 'يجب أن يكون تاريخًا سابقًا.' }),
  'cell.dateNotFuture': () => ({
    en: "Can't be after today. Enter when the current subscription started.",
    ar: 'لا يمكن أن يكون بعد اليوم. أدخل تاريخ بداية الاشتراك الحالي.',
  }),
  'cell.time': () => ({
    en: 'Not a time. Write it as 17:00 or 5:00 PM.',
    ar: 'ليس وقتًا. اكتبه 17:00 أو 5:00 م.',
  }),
  'cell.days': (p) => ({
    en: `"${p.value}" isn't a day of the week. Write days like: Saturday, Monday.`,
    ar: `"${p.value}" ليس يومًا من أيام الأسبوع. اكتب الأيام مثل: السبت، الاثنين.`,
  }),
  'cell.daysRepeated': () => ({ en: 'A day is written twice.', ar: 'يوم مكرر.' }),
  'cell.period': () => ({ en: 'Choose a period from the list.', ar: 'اختر المدة من القائمة.' }),
  'cell.payType': () => ({ en: 'Choose a pay type from the list.', ar: 'اختر نوع الأجر من القائمة.' }),
  'cell.tooShort': (p) => ({ en: `Too short: at least ${p.min} characters.`, ar: `قصير جدًا: ${p.min} أحرف على الأقل.` }),
  'cell.tooLong': (p) => ({ en: `Too long: at most ${p.max} characters.`, ar: `طويل جدًا: ${p.max} حرفًا على الأكثر.` }),

  // Plans
  'plan.duplicate': (p) => ({ en: `Plan "${p.name}" is listed twice.`, ar: `الباقة "${p.name}" مكررة.` }),
  'plan.periodDaysRequired': () => ({
    en: 'Enter the number of days for a "days from start" plan.',
    ar: 'أدخل عدد الأيام لباقة "أيام من تاريخ البدء".',
  }),
  'plan.periodDaysNotUsed': () => ({
    en: 'Leave empty for a calendar-month plan.',
    ar: 'اتركه فارغًا لباقة الشهر الميلادي.',
  }),
  'plan.levelDuplicate': (p) => ({ en: `Level "${p.name}" is listed twice.`, ar: `المستوى "${p.name}" مكرر.` }),

  // Captains
  'captain.duplicate': (p) => ({
    en: `Captain "${p.name}" is listed twice. Give each captain a distinct name.`,
    ar: `الكابتن "${p.name}" مكرر. اكتب لكل كابتن اسمًا مختلفًا.`,
  }),
  'captain.rateMissing': () => ({
    en: 'Fill this for the chosen pay type, or leave the pay type empty to set pay later.',
    ar: 'املأ هذه الخانة لنوع الأجر المختار، أو اترك نوع الأجر فارغًا لتحديده لاحقًا.',
  }),

  // Groups
  'group.duplicate': (p) => ({ en: `Group "${p.name}" is listed twice.`, ar: `المجموعة "${p.name}" مكررة.` }),
  'group.unknownCaptain': (p) => ({
    en: `No captain named "${p.name}" on the Captains tab.`,
    ar: `لا يوجد كابتن باسم "${p.name}" في صفحة الكباتن.`,
  }),
  'group.unknownPlan': (p) => ({
    en: `No plan named "${p.name}" on the Plans tab.`,
    ar: `لا توجد باقة باسم "${p.name}" في صفحة الباقات.`,
  }),
  'group.maxBelowMin': () => ({
    en: "The maximum can't be below the minimum.",
    ar: 'لا يمكن أن يكون الحد الأقصى أقل من الحد الأدنى.',
  }),
  'group.overCapacity': (p) => ({
    en: `Group "${p.name}" has ${p.count} trainees with a current subscription, but its maximum is ${p.max}.`,
    ar: `المجموعة "${p.name}" بها ${p.count} متدربًا باشتراك ساري، والحد الأقصى ${p.max}.`,
  }),

  // Trainees
  'trainee.subscriptionIncomplete': () => ({
    en: 'Fill all subscription columns (group, level, start date, sessions left), or leave them all empty.',
    ar: 'املأ كل خانات الاشتراك (المجموعة، المستوى، تاريخ البداية، الحصص المتبقية) أو اتركها كلها فارغة.',
  }),
  'trainee.paidWithoutSubscription': () => ({
    en: 'An amount paid needs a subscription on the same row.',
    ar: 'المبلغ المدفوع يحتاج إلى اشتراك في نفس الصف.',
  }),
  'trainee.unknownGroup': (p) => ({
    en: `No group named "${p.name}" on the Groups tab.`,
    ar: `لا توجد مجموعة باسم "${p.name}" في صفحة المجموعات.`,
  }),
  'trainee.unknownLevel': (p) => ({
    en: `"${p.level}" isn't a level of plan "${p.plan}". Its levels: ${p.levels}.`,
    ar: `"${p.level}" ليس من مستويات باقة "${p.plan}". مستوياتها: ${p.levels}.`,
  }),
  'trainee.sessionsLeftTooMany': (p) => ({
    en: `The plan has ${p.max} sessions, so at most ${p.max} can be left.`,
    ar: `الباقة بها ${p.max} حصص، فلا يمكن أن يتبقى أكثر من ${p.max}.`,
  }),
  'trainee.paidTooMuch': (p) => ({
    en: `More than the plan's price (${p.price}).`,
    ar: `أكثر من سعر الباقة (${p.price}).`,
  }),
  'trainee.parentNameMismatch': (p) => ({
    en: `This parent phone is on row ${p.row} with another parent name ("${p.name}"). Siblings share one parent: use the same name.`,
    ar: `هاتف ولي الأمر هذا موجود في الصف ${p.row} باسم آخر ("${p.name}"). الإخوة لهم ولي أمر واحد: استخدم نفس الاسم.`,
  }),
  'trainee.duplicate': (p) => ({
    en: `Same trainee and parent phone as row ${p.row}.`,
    ar: `نفس المتدرب وهاتف ولي الأمر في الصف ${p.row}.`,
  }),

  // Phones across the file and the academy
  'phone.captainTwice': (p) => ({
    en: `Same phone as the captain on row ${p.row}. Each captain needs their own number.`,
    ar: `نفس رقم الكابتن في الصف ${p.row}. لكل كابتن رقم خاص به.`,
  }),
  'phone.captainAndParent': (p) => ({
    en: `This is also captain "${p.name}"'s phone. One number can sign in to only one account.`,
    ar: `هذا أيضًا رقم الكابتن "${p.name}". الرقم الواحد يدخل حسابًا واحدًا فقط.`,
  }),
  'phone.inUse': () => ({
    en: 'This phone already signs in to an account in this academy.',
    ar: 'هذا الرقم مسجّل بالفعل لحساب في هذه الأكاديمية.',
  }),

  // The branch
  'branch.notEmpty': () => ({
    en: 'This branch already has data. Import only into a new, empty branch.',
    ar: 'هذا الفرع به بيانات بالفعل. الاستيراد متاح فقط لفرع جديد فارغ.',
  }),
} satisfies Record<string, Text>;

export type IssueCode = keyof typeof MESSAGES;

/** One problem: where it is (tab, row, column) and what is wrong. */
export interface ImportIssue {
  code: IssueCode;
  params?: IssueParams;
  sheet?: string; // SheetKey
  /** The Excel row number, as the academy sees it. */
  row?: number;
  /** The column key (template.ts). */
  column?: string;
}

export function issueText(issue: Pick<ImportIssue, 'code' | 'params'>): { en: string; ar: string } {
  return (MESSAGES[issue.code] as Text)(issue.params ?? {});
}

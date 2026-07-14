/**
 * ISSA — Report Export Service
 *
 * One shared PDF layout (react-pdf) and one shared Excel builder (exceljs),
 * reused across all four report types. Callers (the /api/reports route)
 * shape each report's result into the generic ExportMeta format below.
 *
 * ⚠️ Excel formula-injection defense-in-depth: any string cell value
 *    starting with =, +, -, or @ is prefixed with a literal quote so
 *    spreadsheet apps render it as text instead of evaluating it as a
 *    formula when the file is opened.
 */

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import ExcelJS from 'exceljs';

// ─── Shared Types ───────────────────────────────────────────

export interface ExportColumn {
  key: string;
  label: string;
}

export interface ExportSummaryItem {
  label: string;
  value: string | number;
}

export interface ExportSection {
  title: string;
  columns: ExportColumn[];
  rows: Record<string, string | number>[];
}

export interface ExportMeta {
  title: string;
  branchName?: string;
  dateRangeLabel?: string;
  summary?: ExportSummaryItem[];
  /** Extra labelled tables rendered before the main table (e.g. the per-plan
   *  income breakdown on the financial report). */
  sections?: ExportSection[];
  columns: ExportColumn[];
  rows: Record<string, string | number>[];
}

// ─── PDF Export ─────────────────────────────────────────────

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  title: { fontSize: 18, marginBottom: 4, fontWeight: 700 },
  subtitle: { fontSize: 10, color: '#555555', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  summaryItem: {
    border: '1pt solid #dddddd',
    borderRadius: 4,
    padding: 8,
    minWidth: 110,
    marginRight: 10,
    marginBottom: 10,
  },
  summaryLabel: { fontSize: 8, color: '#777777' },
  summaryValue: { fontSize: 13, fontWeight: 700, marginTop: 2 },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderBottom: '1pt solid #cbd5e1',
  },
  tableRow: { flexDirection: 'row', borderBottom: '0.5pt solid #e2e8f0' },
  tableCell: { flex: 1, padding: 4, fontSize: 9 },
  tableHeaderCell: { flex: 1, padding: 4, fontSize: 9, fontWeight: 700 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 10, marginBottom: 4 },
});

function ReportDocument({ meta }: { meta: ExportMeta }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{meta.title}</Text>
        {(meta.branchName || meta.dateRangeLabel) && (
          <Text style={styles.subtitle}>
            {[meta.branchName, meta.dateRangeLabel].filter(Boolean).join(' — ')}
          </Text>
        )}

        {meta.summary && meta.summary.length > 0 && (
          <View style={styles.summaryRow}>
            {meta.summary.map((s) => (
              <View key={s.label} style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>{s.label}</Text>
                <Text style={styles.summaryValue}>{String(s.value)}</Text>
              </View>
            ))}
          </View>
        )}

        {meta.sections?.map((section, si) => (
          <View key={si}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.tableHeaderRow}>
              {section.columns.map((c) => (
                <Text key={c.key} style={styles.tableHeaderCell}>{c.label}</Text>
              ))}
            </View>
            {section.rows.map((row, i) => (
              <View key={i} style={styles.tableRow}>
                {section.columns.map((c) => (
                  <Text key={c.key} style={styles.tableCell}>{String(row[c.key] ?? '')}</Text>
                ))}
              </View>
            ))}
          </View>
        ))}

        {meta.sections && meta.sections.length > 0 && meta.rows.length > 0 && (
          <Text style={styles.sectionTitle}>Details</Text>
        )}

        <View style={styles.tableHeaderRow}>
          {meta.columns.map((c) => (
            <Text key={c.key} style={styles.tableHeaderCell}>
              {c.label}
            </Text>
          ))}
        </View>
        {meta.rows.map((row, i) => (
          <View key={i} style={styles.tableRow}>
            {meta.columns.map((c) => (
              <Text key={c.key} style={styles.tableCell}>
                {String(row[c.key] ?? '')}
              </Text>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function exportReportToPdf(meta: ExportMeta): Promise<Buffer> {
  return renderToBuffer(<ReportDocument meta={meta} />);
}

// ─── Single Receipt PDF ─────────────────────────────────────
//
// A dedicated single-document layout — distinct from the tabular
// ReportDocument above. Used by both the staff finance/receipts page
// and the trainee portal (same function, ownership-checked differently
// per caller — see portal.service.ts::getOwnReceiptForDownload).

export interface ReceiptPdfData {
  receiptNumber: string;
  amount: number | string;
  paymentMethod?: string | null;
  description: string | null;
  issuedAt: Date | string;
  branch: { name: string; code: string };
  trainee: { name: string; systemCode: string; user: { name: string; phoneNumber: string } };
  subscription: {
    plan: { name: string };
    level: { name: string };
    paymentStatus: string;
    amountPaid: number | string;
    amountDue: number | string;
  };
}

// Human-readable labels for the PaymentMethod enum.
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  INSTAPAY: 'InstaPay',
  CASH: 'Cash',
  EWALLET: 'E-wallet',
};

const receiptStyles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica' },
  branchName: { fontSize: 16, fontWeight: 700 },
  branchCode: { fontSize: 9, color: '#777777', marginTop: 2, marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  receiptNumber: { fontSize: 11, color: '#555555', marginBottom: 24, fontFamily: 'Courier' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottom: '0.5pt solid #e2e8f0',
    paddingVertical: 8,
  },
  rowLabel: { color: '#777777' },
  rowValue: { fontWeight: 700 },
  amountBox: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: { fontSize: 11, color: '#555555' },
  amountValue: { fontSize: 22, fontWeight: 700 },
  description: { marginTop: 16, fontSize: 9, color: '#777777' },
});

function ReceiptDocument({ receipt }: { receipt: ReceiptPdfData }) {
  const issuedAtStr =
    receipt.issuedAt instanceof Date
      ? receipt.issuedAt.toISOString().slice(0, 10)
      : String(receipt.issuedAt).slice(0, 10);

  return (
    <Document>
      <Page size="A4" style={receiptStyles.page}>
        <Text style={receiptStyles.branchName}>{receipt.branch.name}</Text>
        <Text style={receiptStyles.branchCode}>Branch Code: {receipt.branch.code}</Text>

        <Text style={receiptStyles.title}>Payment Receipt</Text>
        <Text style={receiptStyles.receiptNumber}>
          {receipt.receiptNumber} — {issuedAtStr}
        </Text>

        <View style={receiptStyles.row}>
          <Text style={receiptStyles.rowLabel}>Trainee</Text>
          <Text style={receiptStyles.rowValue}>{receipt.trainee.name}</Text>
        </View>
        <View style={receiptStyles.row}>
          <Text style={receiptStyles.rowLabel}>System Code</Text>
          <Text style={receiptStyles.rowValue}>{receipt.trainee.systemCode}</Text>
        </View>
        <View style={receiptStyles.row}>
          <Text style={receiptStyles.rowLabel}>Phone</Text>
          <Text style={receiptStyles.rowValue}>{receipt.trainee.user.phoneNumber}</Text>
        </View>
        <View style={receiptStyles.row}>
          <Text style={receiptStyles.rowLabel}>Plan</Text>
          <Text style={receiptStyles.rowValue}>
            {receipt.subscription.plan.name} / {receipt.subscription.level.name}
          </Text>
        </View>
        <View style={receiptStyles.row}>
          <Text style={receiptStyles.rowLabel}>Payment Status</Text>
          <Text style={receiptStyles.rowValue}>{receipt.subscription.paymentStatus}</Text>
        </View>
        <View style={receiptStyles.row}>
          <Text style={receiptStyles.rowLabel}>Total Paid / Due</Text>
          <Text style={receiptStyles.rowValue}>
            {String(receipt.subscription.amountPaid)} / {String(receipt.subscription.amountDue)}
          </Text>
        </View>
        {receipt.paymentMethod && (
          <View style={receiptStyles.row}>
            <Text style={receiptStyles.rowLabel}>Payment Method</Text>
            <Text style={receiptStyles.rowValue}>
              {PAYMENT_METHOD_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod}
            </Text>
          </View>
        )}

        <View style={receiptStyles.amountBox}>
          <Text style={receiptStyles.amountLabel}>This Receipt</Text>
          <Text style={receiptStyles.amountValue}>{String(receipt.amount)}</Text>
        </View>

        {receipt.description && (
          <Text style={receiptStyles.description}>{receipt.description}</Text>
        )}
      </Page>
    </Document>
  );
}

export async function exportReceiptToPdf(receipt: ReceiptPdfData): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument receipt={receipt} />);
}

// ─── Excel Export ───────────────────────────────────────────

function sanitizeCell(value: string | number): string | number {
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

export async function exportReportToExcel(meta: ExportMeta): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(meta.title.slice(0, 31)); // Excel sheet names cap at 31 chars

  sheet.addRow([meta.title]).font = { bold: true, size: 14 };
  if (meta.branchName || meta.dateRangeLabel) {
    sheet.addRow([[meta.branchName, meta.dateRangeLabel].filter(Boolean).join(' — ')]);
  }
  sheet.addRow([]);

  if (meta.summary && meta.summary.length > 0) {
    for (const s of meta.summary) {
      sheet.addRow([s.label, sanitizeCell(s.value)]);
    }
    sheet.addRow([]);
  }

  if (meta.sections) {
    for (const section of meta.sections) {
      const titleRow = sheet.addRow([section.title]);
      titleRow.font = { bold: true, size: 12 };
      const secHeader = sheet.addRow(section.columns.map((c) => c.label));
      secHeader.font = { bold: true };
      for (const row of section.rows) {
        sheet.addRow(section.columns.map((c) => sanitizeCell(row[c.key] ?? '')));
      }
      sheet.addRow([]);
    }
  }

  const headerRow = sheet.addRow(meta.columns.map((c) => c.label));
  headerRow.font = { bold: true };

  for (const row of meta.rows) {
    sheet.addRow(meta.columns.map((c) => sanitizeCell(row[c.key] ?? '')));
  }

  sheet.columns.forEach((col) => {
    col.width = 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

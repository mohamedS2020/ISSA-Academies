/**
 * App text, in both languages (hardening plan §48).
 *
 * 1. The app's message files have the same keys and the same placeholders in
 *    English and Arabic, so no screen falls back to a key or loses a value.
 * 2. Screens already translated stay translated: no English typed straight into
 *    them. Visible text, the attributes people read (placeholder, title,
 *    aria-label, alt), table headers, and the messages shown in toasts, errors
 *    and confirmations all come from the message files. Add a screen to
 *    TRANSLATED once its text is moved there.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const TRANSLATED = [
  'src/app/[locale]/(dashboard)/dashboard/page.tsx',
  'src/app/[locale]/(dashboard)/captains/page.tsx',
  'src/app/[locale]/(dashboard)/trainees/page.tsx',
  'src/app/[locale]/(dashboard)/trainees/[id]/page.tsx',
  'src/app/[locale]/(dashboard)/groups/page.tsx',
  'src/app/[locale]/(dashboard)/groups/[id]/page.tsx',
  'src/app/[locale]/(dashboard)/schedule/page.tsx',
  'src/app/[locale]/(dashboard)/attendance/page.tsx',
  'src/app/[locale]/(dashboard)/finance/page.tsx',
  'src/app/[locale]/(dashboard)/finance/receipts/page.tsx',
  'src/app/[locale]/(dashboard)/finance/payroll/page.tsx',
  'src/app/[locale]/(dashboard)/reports/page.tsx',
  'src/app/[locale]/(portal)/layout.tsx',
  'src/app/[locale]/(portal)/portal/page.tsx',
  'src/components/layout/header.tsx',
  'src/components/layout/sidebar.tsx',
  'src/components/rating/feedback-panel.tsx',
];

const ATTRIBUTES = new Set(['placeholder', 'title', 'aria-label', 'alt']);
// Calls whose string argument is shown to the person.
const SHOWN = /^(toast\.(success|error|warning|info)|setPaymentError|setFormError|setError|confirm|alert)$/;
const PROPERTIES = new Set(['header', 'label']);

// The language switch shows the other language's code (AR / EN) in both languages.
const LANGUAGE_CODES = new Set(['AR', 'EN']);
const hasLatin = (text: string) =>
  !LANGUAGE_CODES.has(text.trim()) && /[A-Za-z]/.test(text.replace(/&[a-z]+;/g, ''));

function textOf(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/** Hard-coded English in some TSX source, as "file:line: text" entries. */
function scan(file: string, code: string): string[] {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const report = (node: ts.Node, text: string) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    found.push(`${file}:${line + 1}: ${JSON.stringify(text.trim().replace(/\s+/g, ' '))}`);
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && hasLatin(node.getText())) report(node, node.getText());
    if (ts.isJsxAttribute(node) && ATTRIBUTES.has(node.name.getText()) && node.initializer) {
      const text = textOf(node.initializer);
      if (text && hasLatin(text)) report(node, text);
    }
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && node.arguments?.length) {
      const callee = node.expression.getText();
      if (SHOWN.test(callee) || (ts.isNewExpression(node) && callee === 'Error')) {
        for (const arg of node.arguments) {
          // `new Error(server message || fallback)`: only the literal fallback is ours.
          const literals = ts.isBinaryExpression(arg) ? [arg.left, arg.right] : [arg];
          for (const candidate of literals) {
            const text = textOf(candidate);
            if (text && hasLatin(text)) report(candidate, text);
          }
        }
      }
    }
    if (ts.isPropertyAssignment(node) && PROPERTIES.has(node.name.getText())) {
      const text = textOf(node.initializer);
      if (text && hasLatin(text)) report(node, text);
    }
    // Text chosen in JSX: {cond ? 'Renew' : 'Enroll'}.
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const parts = ts.isConditionalExpression(node.expression)
        ? [node.expression.whenTrue, node.expression.whenFalse]
        : [node.expression];
      for (const part of parts) {
        const text = textOf(part);
        if (text && hasLatin(text)) report(part, text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const hardcodedText = (file: string) => scan(file, readFileSync(path.join(process.cwd(), file), 'utf8'));

/**
 * Phone numbers and date-times shown without dir="ltr". Inside an Arabic line
 * their neutral characters take the line's direction: "+201000000102" shows as
 * "201000000102+" and "27/10/2026, 17:00" as "17:00 ,27/10/2026". The element
 * that shows one needs dir="ltr".
 */
function unisolatedNumbers(file: string, code: string): string[] {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const isDateTime = (node: ts.Node) =>
    (ts.isPropertyAccessExpression(node) && node.name.text === 'scheduledAtLocal') ||
    // A phone number (not a form's error message for that field).
    (ts.isPropertyAccessExpression(node) &&
      (node.name.text === 'phoneNumber' || node.name.text === 'whatsappNumber') &&
      node.expression.getText() !== 'errors') ||
    (ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'toLocaleString' &&
      ts.isNewExpression(node.expression.expression) &&
      node.expression.expression.expression.getText() === 'Date');
  const hasLtr = (element: ts.JsxElement) =>
    element.openingElement.attributes.properties.some(
      (a) => ts.isJsxAttribute(a) && a.name.getText() === 'dir' && !!a.initializer && textOf(a.initializer) === 'ltr',
    );
  const passesThrough = (up: ts.Node, value: ts.Node) =>
    ts.isParenthesizedExpression(up) ||
    (ts.isConditionalExpression(up) && up.condition !== value) ||
    (ts.isBinaryExpression(up) &&
      (up.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || up.operatorToken.kind === ts.SyntaxKind.BarBarToken));
  const visit = (node: ts.Node) => {
    if (isDateTime(node)) {
      // Follow the value to the {…} that shows it. Only ?:, ?? and || pass it on
      // unchanged; a .split() or a condition means it is worked on, not shown.
      let value: ts.Node = node;
      let up = node.parent;
      while (passesThrough(up, value)) {
        value = up;
        up = up.parent;
      }
      const shownIn = ts.isJsxExpression(up) && (ts.isJsxElement(up.parent) || ts.isJsxFragment(up.parent)) ? up.parent : null;
      if (shownIn && !(ts.isJsxElement(shownIn) && hasLtr(shownIn))) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        found.push(`${file}:${line + 1}: ${node.getText()}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const screens = () =>
  ['src/app', 'src/components'].flatMap((dir) =>
    (readdirSync(path.join(process.cwd(), dir), { recursive: true }) as string[])
      .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
      .map((f) => path.join(dir, f).split(path.sep).join('/')),
  );

/** Every leaf key, with the names of the values it takes ({name}, {count, plural …}). */
function shape(value: Json, prefix = ''): string[] {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value)
      .sort()
      .flatMap((key) => shape(value[key], prefix ? `${prefix}.${key}` : key));
  }
  const names = typeof value === 'string' ? [...new Set([...value.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]))].sort() : [];
  return [`${prefix}${names.length ? ` {${names.join(',')}}` : ''}`];
}

describe('app text', () => {
  it('has the same keys and placeholders in English and Arabic', () => {
    expect(shape(ar as Json)).toEqual(shape(en as Json));
  });

  it('has no hard-coded English on the translated screens', () => {
    expect(TRANSLATED.flatMap(hardcodedText)).toEqual([]);
  });

  it('finds each kind of hard-coded English (so the check above is not vacuous)', () => {
    const sample = [
      'export function Probe({ t, ok }: { t: (k: string) => string; ok: boolean }) {',
      "  toast.error('Payment failed');",
      "  if (!ok) throw new Error(data.error?.message || 'Load failed');",
      "  const columns = [{ key: 'name', header: 'Name' }, { key: 'x', header: t('x') }];",
      '  return (',
      '    <div title="Close menu" className="flex">',
      "      Saved <b>{t('done')}</b> {ok ? 'Paid' : t('unpaid')} &times;",
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    expect(scan('probe.tsx', sample).map((entry) => entry.split(': ').slice(1).join(': '))).toEqual([
      '"Payment failed"',
      '"Load failed"',
      '"Name"',
      '"Close menu"',
      '"Saved"',
      '"Paid"',
    ]);
  });

  it('shows every phone number and date-time left to right, so Arabic lines keep their order', () => {
    expect(screens().flatMap((file) => unisolatedNumbers(file, readFileSync(path.join(process.cwd(), file), 'utf8')))).toEqual([]);
  });

  it('finds a phone number or date-time without dir="ltr" (so the check above is not vacuous)', () => {
    const sample = [
      'export function Probe({ s, u, at, ok, errors }: { s: { scheduledAtLocal: string }; u: { phoneNumber: string }; at: string; ok: boolean; errors: { phoneNumber?: string } }) {',
      "  const time = s.scheduledAtLocal.split(', ')[1];",
      '  return (',
      '    <div title={s.scheduledAtLocal}>',
      '      <p>{s.scheduledAtLocal}</p>',
      '      <span dir="ltr">{s.scheduledAtLocal}</span>',
      '      <p>{ok ? new Date(at).toLocaleString() : time}</p>',
      '      <p>{ok ? <span dir="ltr">{new Date(at).toLocaleString()}</span> : null}</p>',
      '      <p>{new Date(at).toLocaleDateString()}</p>',
      '      <td>{u.phoneNumber}</td>',
      '      <td dir="ltr">{u.phoneNumber}</td>',
      '      <p>{errors.phoneNumber}</p>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    expect(unisolatedNumbers('probe.tsx', sample).map((entry) => entry.split(': ').slice(1).join(': '))).toEqual([
      's.scheduledAtLocal',
      'new Date(at).toLocaleString()',
      'u.phoneNumber',
    ]);
  });
});

import Image from 'next/image';
import type { Locale } from '@/lib/i18n/config';
import { getLandingMessages, type LandingTranslator } from '@/lib/i18n/landing';
import { whatsappUrl } from '@/lib/config/marketing';
import { DemoForm, type DemoFormLabels } from './demo-form';
import { IconWhatsApp } from './icons';
import { Words } from './motion/words';

export function CtaSection({ t, locale }: { t: LandingTranslator; locale: Locale }) {
  // Whole groups of strings (options, error messages) come straight from the
  // message file; the translator only returns single strings and lists.
  const form = getLandingMessages(locale).cta.form;
  const labels: DemoFormLabels = {
    title: t('cta.form.title'),
    name: t('cta.form.name'),
    academy: t('cta.form.academy'),
    phone: t('cta.form.phone'),
    branches: t('cta.form.branches'),
    branchOptions: {
      '1': t('cta.form.branchOptions.one'),
      '2-5': t('cta.form.branchOptions.twoToFive'),
      '6+': t('cta.form.branchOptions.sixPlus'),
    },
    sport: t('cta.form.sport'),
    sportOptions: form.sportOptions,
    submit: t('cta.form.submit'),
    note: t('cta.form.note'),
    honeypot: t('cta.form.honeypot'),
    sending: t('cta.form.sending'),
    // `{name}` is filled in by the form once it knows who submitted.
    successTitle: t.raw('cta.form.successTitle') as string,
    successText: t('cta.form.successText'),
    errors: form.errors,
  };

  return (
    <section id="demo" className="section cta-section" aria-labelledby="cta-h">
      <div className="container">
        <div className="cta-band">
          <div className="cta-copy">
            <span className="eyebrow" style={{ color: 'var(--lagoon-300)' }}>
              {t('cta.eyebrow')}
            </span>
            <h2 id="cta-h" className="h2" style={{ marginTop: '.75rem' }}>
              <Words text={t('cta.title')} />
            </h2>
            <p className="lead">{t('cta.lead')}</p>
            <p className="cta-or">{t('cta.or')}</p>
            <a
              className="btn btn-outline-light btn-lg btn-whatsapp"
              href={whatsappUrl}
              target="_blank"
              rel="noopener"
            >
              <IconWhatsApp /> {t('cta.whatsapp')}
            </a>
          </div>
          <DemoForm locale={locale} labels={labels} />
          <Image className="deco" src="/assets/img/symbol-white.svg" alt="" width={280} height={326} unoptimized />
        </div>
      </div>
    </section>
  );
}

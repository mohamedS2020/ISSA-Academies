import type { ReactNode } from 'react';
import type { LandingTranslator } from '@/lib/i18n/landing';
import { IconChart, IconFamily, IconLock, IconShield, IconWhistle } from './icons';

const ROLE_CHIP_ICONS: ReactNode[] = [<IconChart key="o" />, <IconShield key="m" />, <IconWhistle key="c" />, <IconFamily key="p" />];

export function WhySection({ t }: { t: LandingTranslator }) {
  const chips = t.raw('why.roles.chips') as string[];
  const months = t.raw('why.money.months') as string[];
  const sampleData = t('a11y.sampleData');

  return (
    <section id="why" className="section why" aria-labelledby="why-h">
      <div className="container">
        <div className="section-head center reveal">
          <span className="eyebrow">{t('why.eyebrow')}</span>
          <h2 id="why-h" className="h2">
            {t('why.title')}
          </h2>
        </div>
        <div className="bento">
          <article className="tile tile-portals reveal">
            <p className="tile-num">{t('why.roles.number')}</p>
            <p className="tile-lead">{t('why.roles.lead')}</p>
            <div className="portal-chips" aria-hidden="true">
              {chips.map((chip, index) => (
                <span key={chip} title={chip}>
                  {ROLE_CHIP_ICONS[index]}
                </span>
              ))}
            </div>
          </article>
          <article className="tile tile-brand reveal reveal-delay-1">
            <h3>{t('why.brand.title')}</h3>
            <p className="url-pill" dir="ltr">
              <IconLock />
              <span>
                <b>{t('why.brand.slug')}</b>
                {t('why.brand.domain')}
              </span>
            </p>
            <p className="muted">{t('why.brand.text')}</p>
          </article>
          <article className="tile tile-money reveal">
            <div className="tile-money-copy">
              <h3>{t('why.money.title')}</h3>
              <p className="muted">{t('why.money.text')}</p>
            </div>
            <figure className="ui chart-card" aria-label={sampleData}>
              <div className="ui-row">
                <p className="ui-sub">{t('why.money.chartLabel')}</p>
                <span className="pill pill-info">{sampleData}</span>
              </div>
              <p className="ui-big" style={{ marginTop: '.35rem' }}>
                {t('why.money.amount')}
              </p>
              <svg className="spark" viewBox="0 0 300 110" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  {/* Colours via style, not attributes: var() in SVG presentation
                      attributes is not reliable across browsers. */}
                  <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" style={{ stopColor: 'var(--lagoon)', stopOpacity: 0.22 }} />
                    <stop offset="1" style={{ stopColor: 'var(--lagoon)', stopOpacity: 0 }} />
                  </linearGradient>
                </defs>
                <path d="M0 92 L60 74 L120 70 L180 52 L240 44 L300 20 L300 110 L0 110Z" fill="url(#sg)" />
                <path
                  d="M0 92 L60 74 L120 70 L180 52 L240 44 L300 20"
                  fill="none"
                  style={{ stroke: 'var(--lagoon)' }}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="months">
                {months.map((month) => (
                  <span key={month}>{month}</span>
                ))}
              </div>
            </figure>
          </article>
          <article className="tile tile-data reveal reveal-delay-1">
            <span className="icon-tile">
              <IconShield />
            </span>
            <h3>{t('why.data.title')}</h3>
            <p className="muted">{t('why.data.text')}</p>
          </article>
          <article className="tile tile-lang reveal reveal-delay-2">
            <p className="lang-demo" aria-hidden="true">
              <span lang="ar">ع</span>
              <span>A</span>
            </p>
            <h3>{t('why.lang.title')}</h3>
            <p className="muted">{t('why.lang.text')}</p>
          </article>
        </div>
      </div>
    </section>
  );
}

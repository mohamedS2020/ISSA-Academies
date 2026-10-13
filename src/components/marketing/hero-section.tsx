import type { LandingTranslator } from '@/lib/i18n/landing';
import { whatsappUrl } from '@/lib/config/marketing';
import { IconArrow, IconCalendarCheck, IconCheck, IconWhatsApp } from './icons';
import { HERO_AVATARS, HERO_COLLECTIONS } from './sample-data';

export function HeroSection({ t }: { t: LandingTranslator }) {
  const sports = t.raw('hero.sports') as string[];
  const sampleData = t('a11y.sampleData');

  return (
    <section className="hero" aria-labelledby="hero-h">
      <div className="hero-blade" aria-hidden="true" />
      <div className="container hero-grid">
        <div className="hero-copy">
          <span className="eyebrow reveal">{t('hero.eyebrow')}</span>
          <h1 id="hero-h" className="h1 reveal reveal-delay-1">
            <span className="h1-line">{t('hero.titleLine1')}</span>
            <span className="h1-line accent">{t('hero.titleLine2')}</span>
          </h1>
          <p className="lead reveal reveal-delay-2">{t('hero.lead')}</p>
          <div className="hero-actions reveal reveal-delay-3">
            <a className="btn btn-primary btn-lg" href="#demo">
              {t('hero.bookDemo')} <IconArrow />
            </a>
            <a className="btn btn-ghost btn-lg btn-whatsapp" href={whatsappUrl} target="_blank" rel="noopener">
              <IconWhatsApp /> {t('hero.whatsapp')}
            </a>
          </div>
          <div className="sports-wrap reveal">
            <p className="sports-label">{t('hero.sportsLabel')}</p>
            <ul className="sports">
              {sports.map((sport) => (
                <li key={sport}>
                  <span>{sport}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="hero-visual reveal reveal-delay-2" role="img" aria-label={sampleData}>
          <div className="ui ui-att">
            <div className="ui-row">
              <div>
                <p className="ui-title">{t('hero.attendance.title')}</p>
                <p className="ui-sub">{t('hero.attendance.group')}</p>
              </div>
              <span className="icon-tile">
                <IconCalendarCheck />
              </span>
            </div>
            <p className="ui-big" style={{ marginTop: '1.1rem' }}>
              {t('hero.attendance.count')} <span className="ui-sub">{t('hero.attendance.present')}</span>
            </p>
            <div className="bar" style={{ marginTop: '.75rem' }}>
              <span style={{ width: '90%' }} />
            </div>
            <div className="ui-row" style={{ marginTop: '1rem' }}>
              <div className="avatars">
                {HERO_AVATARS.map((avatar) => (
                  <span
                    key={avatar.label}
                    className="avatar"
                    style={avatar.background ? { background: avatar.background } : undefined}
                  >
                    {avatar.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="ui ui-pay">
            <p className="ui-sub" style={{ color: 'var(--lagoon-200)' }}>
              {t('hero.collections.label')}
            </p>
            <p className="ui-big" style={{ marginTop: '.4rem' }}>
              {t('hero.collections.amount')}
            </p>
            <p className="ui-sub" style={{ color: 'var(--ya-on-deepsea-muted)', marginTop: '.2rem' }}>
              {t('hero.collections.paidShare')}
            </p>
            <ul className="pay-rows">
              <li>
                <span className="dot dot-ok" />
                {t('hero.collections.paid')}
                <b>{HERO_COLLECTIONS.paid}</b>
              </li>
              <li>
                <span className="dot dot-warn" />
                {t('hero.collections.dueThisWeek')}
                <b>{HERO_COLLECTIONS.dueThisWeek}</b>
              </li>
              <li>
                <span className="dot dot-warn" />
                {t('hero.collections.balanceDue')}
                <b>{HERO_COLLECTIONS.balanceDue}</b>
              </li>
            </ul>
          </div>

          <div className="ui ui-toast">
            <span className="check">
              <IconCheck />
            </span>
            <div>
              <p className="ui-title" style={{ fontSize: '.8rem' }}>
                {t('hero.toast.title')}
              </p>
              <p className="ui-sub">{t('hero.toast.time')}</p>
            </div>
          </div>
          <p className="sample-note">{sampleData}</p>
        </div>
      </div>
    </section>
  );
}

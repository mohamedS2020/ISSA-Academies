import type { CSSProperties } from 'react';
import type { LandingTranslator } from '@/lib/i18n/landing';
import { whatsappUrl } from '@/lib/config/marketing';
import { IconArrow, IconCalendarCheck, IconCheck, IconWhatsApp } from './icons';
import { HERO_AVATARS, HERO_COLLECTIONS, avatarClass } from './sample-data';
import { heroTiming } from './motion/hero-timing';
import { wordCount } from './motion/split-words';
import { Words } from './motion/words';

export function HeroSection({ t }: { t: LandingTranslator }) {
  const sports = t.raw('hero.sports') as string[];
  const sampleData = t('a11y.sampleData');
  const titleLine1 = t('hero.titleLine1');
  const titleLine2 = t('hero.titleLine2');
  const timing = heroTiming(wordCount(titleLine1), wordCount(titleLine2));

  return (
    <section className="hero" aria-labelledby="hero-h" style={timing.style as CSSProperties}>
      <div className="hero-blade" aria-hidden="true" />
      <div className="container hero-grid">
        <div className="hero-copy">
          <span className="eyebrow">{t('hero.eyebrow')}</span>
          <h1 id="hero-h" className="h1">
            <span className="h1-line">
              <Words text={titleLine1} />
            </span>
            <span className="h1-line accent">
              <Words text={titleLine2} start={timing.line2Start} />
            </span>
          </h1>
          <p className="lead">{t('hero.lead')}</p>
          <div className="hero-actions">
            <a className="btn btn-primary btn-lg" href="#demo">
              {t('hero.bookDemo')} <IconArrow />
            </a>
            <a className="btn btn-ghost btn-lg btn-whatsapp" href={whatsappUrl} target="_blank" rel="noopener">
              <IconWhatsApp /> {t('hero.whatsapp')}
            </a>
          </div>
          <div className="sports-wrap">
            <p className="sports-label">{t('hero.sportsLabel')}</p>
            <ul className="sports">
              {sports.map((sport, index) => (
                <li key={sport} style={{ '--i': index } as CSSProperties}>
                  <span>{sport}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="hero-visual" role="img" aria-label={sampleData}>
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
              <span data-count>{t('hero.attendance.count')}</span>{' '}
              <span className="ui-sub">{t('hero.attendance.present')}</span>
            </p>
            <div className="bar" style={{ marginTop: '.75rem' }}>
              <span style={{ width: '90%' }} />
            </div>
            <div className="ui-row" style={{ marginTop: '1rem' }}>
              <div className="avatars">
                {HERO_AVATARS.map((avatar) => (
                  <span key={avatar.label} className={avatarClass(avatar.tone)}>
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
              <span data-count>{t('hero.collections.amount')}</span>
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

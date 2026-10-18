import Image from 'next/image';
import type { Locale } from '@/lib/i18n/config';
import type { LandingTranslator } from '@/lib/i18n/landing';
import { MARKETING, hrefOrHash, landingPath, whatsappUrl } from '@/lib/config/marketing';
import { IconFacebook, IconInstagram, IconLinkedIn, IconWhatsApp } from './icons';
import { LOGOS } from './logos';

export function SiteFooter({
  t,
  locale,
  otherLocale,
  otherLanguageLabel,
}: {
  t: LandingTranslator;
  locale: Locale;
  otherLocale: Locale;
  otherLanguageLabel: string;
}) {
  const logo = LOGOS[locale];
  // Built at deploy time; a static page can't know the visitor's year anyway.
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Image src={logo.src} alt={logo.alt} width={logo.footerWidth} height={32} unoptimized />
            <p>{t('footer.tagline')}</p>
          </div>
          <div>
            <h4>{t('footer.product')}</h4>
            <ul>
              <li>
                <a href="#platform">{t('footer.productLinks.platform')}</a>
              </li>
              <li>
                <a href="#roles">{t('footer.productLinks.roles')}</a>
              </li>
              <li>
                <a href="#pricing">{t('footer.productLinks.pricing')}</a>
              </li>
              <li>
                <a href="#faq">{t('footer.productLinks.faq')}</a>
              </li>
            </ul>
          </div>
          <div>
            <h4>{t('footer.company')}</h4>
            <ul>
              <li>
                <a href={MARKETING.footerLinks.about}>{t('footer.companyLinks.about')}</a>
              </li>
              <li>
                <a href={MARKETING.footerLinks.contact}>{t('footer.companyLinks.contact')}</a>
              </li>
              <li>
                <a href={MARKETING.footerLinks.privacy}>{t('footer.companyLinks.privacy')}</a>
              </li>
              <li>
                <a href={MARKETING.footerLinks.terms}>{t('footer.companyLinks.terms')}</a>
              </li>
            </ul>
          </div>
          <div className="footer-contact">
            <h4>{t('footer.getInTouch')}</h4>
            <ul>
              <li>
                <a href={whatsappUrl}>{t('footer.whatsapp')}</a>
              </li>
              <li>
                <a href={`mailto:${MARKETING.email}`}>{MARKETING.email}</a>
              </li>
            </ul>
          </div>
          <div className="footer-social">
            <a href={hrefOrHash(MARKETING.social.instagram)} aria-label={t('footer.social.instagram')}>
              <IconInstagram />
            </a>
            <a href={hrefOrHash(MARKETING.social.facebook)} aria-label={t('footer.social.facebook')}>
              <IconFacebook />
            </a>
            <a href={hrefOrHash(MARKETING.social.linkedin)} aria-label={t('footer.social.linkedin')}>
              <IconLinkedIn />
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>{t('footer.copyright', { year })}</span>
          <a href={landingPath(otherLocale)} hrefLang={otherLocale} lang={otherLocale}>
            {otherLanguageLabel}
          </a>
        </div>
      </div>
    </footer>
  );
}

export function WhatsAppFloat({ label }: { label: string }) {
  return (
    <a className="wa-float" href={whatsappUrl} aria-label={label} target="_blank" rel="noopener">
      <IconWhatsApp />
    </a>
  );
}

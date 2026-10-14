import type { ReactNode } from 'react';
import type { LandingTranslator } from '@/lib/i18n/landing';
import { IconBuilding, IconCalendarCheck, IconReceipt, IconWallet } from './icons';

const FEATURE_ICONS: ReactNode[] = [
  <IconBuilding key="branches" />,
  <IconCalendarCheck key="attendance" />,
  <IconReceipt key="subscriptions" />,
  <IconWallet key="finance" />,
];

export function PlatformSection({ t }: { t: LandingTranslator }) {
  const features = t.raw('platform.features') as { title: string; text: string }[];

  return (
    <section id="platform" className="platform" aria-labelledby="platform-h">
      <div className="container">
        <div className="platform-card">
          <div className="platform-head">
            <div>
              <span className="eyebrow">{t('platform.eyebrow')}</span>
              <h2 id="platform-h" className="h2" style={{ marginTop: '.75rem' }}>
                {t('platform.title')}
              </h2>
            </div>
            <p className="muted">{t('platform.lead')}</p>
          </div>
          <ul className="features4">
            {features.map((feature, index) => (
              <li key={feature.title}>
                <span className="icon-tile">{FEATURE_ICONS[index]}</span>
                <h3>{feature.title}</h3>
                <p className="muted">{feature.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

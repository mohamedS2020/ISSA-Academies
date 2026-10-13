import type { ReactNode } from 'react';
import type { LandingTranslator } from '@/lib/i18n/landing';
import { IconBuilding, IconCalendarCheck, IconReceipt, IconWallet } from './icons';

const FEATURES: { icon: ReactNode; delay: string }[] = [
  { icon: <IconBuilding />, delay: 'reveal-delay-1' },
  { icon: <IconCalendarCheck />, delay: 'reveal-delay-2' },
  { icon: <IconReceipt />, delay: 'reveal-delay-3' },
  { icon: <IconWallet />, delay: 'reveal-delay-3' },
];

export function PlatformSection({ t }: { t: LandingTranslator }) {
  const features = t.raw('platform.features') as { title: string; text: string }[];

  return (
    <section id="platform" className="platform" aria-labelledby="platform-h">
      <div className="container">
        <div className="platform-card reveal">
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
              <li key={feature.title} className={`reveal ${FEATURES[index].delay}`}>
                <span className="icon-tile">{FEATURES[index].icon}</span>
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

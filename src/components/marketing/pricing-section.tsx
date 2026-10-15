import type { Locale } from '@/lib/i18n/config';
import type { LandingTranslator } from '@/lib/i18n/landing';
import { MARKETING } from '@/lib/config/marketing';
import { IconArrow, IconCheck } from './icons';
import { Words } from './motion/words';

type PlanKey = keyof typeof MARKETING.prices;

function Plan({
  t,
  locale,
  plan,
  featured,
}: {
  t: LandingTranslator;
  locale: Locale;
  plan: PlanKey;
  featured: boolean;
}) {
  const features = t.raw(`pricing.plans.${plan}.features`) as string[];
  return (
    <article className={featured ? 'plan plan-featured' : 'plan'}>
      <div>
        <h4 className="h3">{t(`pricing.plans.${plan}.name`)}</h4>
        <p className={featured ? undefined : 'muted'} style={{ marginTop: '.35rem' }}>
          {t(`pricing.plans.${plan}.for`)}
        </p>
      </div>
      <ul>
        {features.map((feature) => (
          <li key={feature}>
            <IconCheck />
            {feature}
          </li>
        ))}
      </ul>
      <p className="price">
        {t('pricing.price', { price: MARKETING.prices[plan][locale] })} <small>{t('pricing.perMonth')}</small>
      </p>
      <a className={featured ? 'btn btn-lagoon' : 'btn btn-dark'} href="#demo">
        {t('pricing.bookDemo')} <IconArrow />
      </a>
    </article>
  );
}

export function PricingSection({ t, locale }: { t: LandingTranslator; locale: Locale }) {
  const facts = t.raw('pricing.facts') as { value: string; label: string }[];

  return (
    <section id="pricing" className="section pricing" aria-labelledby="found-h">
      <div className="container">
        <div className="section-head center reveal">
          <span className="eyebrow">{t('pricing.eyebrow')}</span>
          <h2 id="found-h" className="h2">
            {t('pricing.title')}
          </h2>
          <p className="lead">{t('pricing.lead')}</p>
        </div>
        <ul className="facts">
          {facts.map((fact) => (
            <li key={fact.value}>
              <strong>
                <Words text={fact.value} />
              </strong>
              <span>
                <Words text={fact.label} />
              </span>
            </li>
          ))}
        </ul>
        <p className="eyebrow center plans-label reveal">{t('pricing.label')}</p>
        <h3 className="sr-only">{t('pricing.srTitle')}</h3>
        <div className="plans">
          <Plan t={t} locale={locale} plan="starter" featured={false} />
          <Plan t={t} locale={locale} plan="pro" featured />
        </div>
        <p className="plan-note center reveal">{t('pricing.note')}</p>
      </div>
    </section>
  );
}

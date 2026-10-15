import type { LandingTranslator } from '@/lib/i18n/landing';

export function FaqSection({ t }: { t: LandingTranslator }) {
  const items = t.raw('faq.items') as { q: string; a: string }[];

  return (
    <section id="faq" className="section faq-section" aria-labelledby="faq-h">
      <div className="container">
        <div className="section-head center reveal">
          <span className="eyebrow">{t('faq.eyebrow')}</span>
          <h2 id="faq-h" className="h2">
            {t('faq.title')}
          </h2>
        </div>
        <div className="faq reveal">
          {items.map((item, index) => (
            <details key={item.q} open={index === 0}>
              <summary>{item.q}</summary>
              <p className="answer">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

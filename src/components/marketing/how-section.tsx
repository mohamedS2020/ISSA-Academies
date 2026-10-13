import type { LandingTranslator } from '@/lib/i18n/landing';

const DELAYS = ['reveal-delay-1', 'reveal-delay-2', 'reveal-delay-3'];

export function HowSection({ t }: { t: LandingTranslator }) {
  const steps = t.raw('how.steps') as { title: string; text: string }[];

  return (
    <section id="how" className="section how on-dark" aria-labelledby="how-h">
      <div className="container">
        <div className="section-head reveal">
          <span className="eyebrow">{t('how.eyebrow')}</span>
          <h2 id="how-h" className="h2">
            {t('how.title')}
          </h2>
        </div>
        <ol className="steps" style={{ marginTop: '3rem' }}>
          {steps.map((step, index) => (
            <li key={step.title} className={`step reveal ${DELAYS[index]}`}>
              <span className="step-num" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

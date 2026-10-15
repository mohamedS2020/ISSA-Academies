import type { LandingTranslator } from '@/lib/i18n/landing';

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
        <div className="steps-track">
          {/* The line that connects the steps as you scroll. Decorative, and
              only shown when the animation runs. */}
          <span className="steps-rail" aria-hidden="true">
            <span className="steps-rail-fill" />
          </span>
          <ol className="steps" style={{ marginTop: '3rem' }}>
            {steps.map((step, index) => (
              <li key={step.title} className="step">
                <span className="step-num" aria-hidden="true">
                  {index + 1}
                </span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

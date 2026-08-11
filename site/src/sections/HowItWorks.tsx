import { useI18n } from '../i18n/I18nProvider';
import { RevealOnScroll } from '../components/ui/RevealOnScroll';
import { StepCard } from '../components/ui/StepCard';
import './HowItWorks.css';

export function HowItWorks() {
  const { t } = useI18n();

  const steps = [
    { number: '01', titleKey: 'howItWorks.step1.title', bodyKey: 'howItWorks.step1.body' },
    { number: '02', titleKey: 'howItWorks.step2.title', bodyKey: 'howItWorks.step2.body' },
    { number: '03', titleKey: 'howItWorks.step3.title', bodyKey: 'howItWorks.step3.body' },
    { number: '04', titleKey: 'howItWorks.step4.title', bodyKey: 'howItWorks.step4.body' },
  ];

  return (
    <section id="como-funciona" className="section how-it-works">
      <div className="container">
        <RevealOnScroll>
          <span className="eyebrow">{t('howItWorks.eyebrow')}</span>
          <h2 className="section-title">{t('howItWorks.title')}</h2>
        </RevealOnScroll>

        <div className="how-it-works-grid">
          {steps.map((s, i) => (
            <RevealOnScroll key={s.number} delay={i * 0.08}>
              <StepCard number={s.number} title={t(s.titleKey)} body={t(s.bodyKey)} />
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}

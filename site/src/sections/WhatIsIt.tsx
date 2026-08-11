import { useI18n } from '../i18n/I18nProvider';
import { RevealOnScroll } from '../components/ui/RevealOnScroll';
import './WhatIsIt.css';

export function WhatIsIt() {
  const { t } = useI18n();

  return (
    <section id="o-que-e" className="section what-is-it">
      <div className="container">
        <RevealOnScroll>
          <span className="eyebrow">{t('whatIsIt.eyebrow')}</span>
          <h2 className="section-title">{t('whatIsIt.title')}</h2>
          <p className="section-body">{t('whatIsIt.body')}</p>
        </RevealOnScroll>
      </div>
    </section>
  );
}

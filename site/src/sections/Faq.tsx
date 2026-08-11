import { useI18n } from '../i18n/I18nProvider';
import { RevealOnScroll } from '../components/ui/RevealOnScroll';
import { FaqItem } from '../components/ui/FaqItem';
import './Faq.css';

const FAQ_KEYS = ['faq.q1', 'faq.qOpenSource', 'faq.q2', 'faq.q3', 'faq.q4', 'faq.q5', 'faq.q6', 'faq.q7'];

export function Faq() {
  const { t } = useI18n();

  return (
    <section className="section faq">
      <div className="container faq-container">
        <RevealOnScroll>
          <span className="eyebrow">{t('faq.eyebrow')}</span>
          <h2 className="section-title">{t('faq.title')}</h2>
        </RevealOnScroll>

        <RevealOnScroll delay={0.1} className="faq-list">
          {FAQ_KEYS.map((key) => (
            <FaqItem key={key} question={t(`${key}.question`)} answer={t(`${key}.answer`)} />
          ))}
        </RevealOnScroll>
      </div>
    </section>
  );
}

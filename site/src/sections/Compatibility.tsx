import { useI18n } from '../i18n/I18nProvider';
import { RevealOnScroll } from '../components/ui/RevealOnScroll';
import { IconWindows, IconServer, IconPhone } from '../components/ui/icons';
import './Compatibility.css';

export function Compatibility() {
  const { t } = useI18n();

  const items = [
    { icon: <IconWindows />, titleKey: 'compatibility.os.title', bodyKey: 'compatibility.os.body' },
    { icon: <IconServer />, titleKey: 'compatibility.network.title', bodyKey: 'compatibility.network.body' },
    { icon: <IconPhone />, titleKey: 'compatibility.cast.title', bodyKey: 'compatibility.cast.body' },
  ];

  return (
    <section className="section compatibility">
      <div className="container">
        <RevealOnScroll>
          <span className="eyebrow">{t('compatibility.eyebrow')}</span>
          <h2 className="section-title">{t('compatibility.title')}</h2>
        </RevealOnScroll>

        <div className="compatibility-grid">
          {items.map((item, i) => (
            <RevealOnScroll key={item.titleKey} delay={i * 0.08} className="compatibility-item">
              <div className="compatibility-icon">{item.icon}</div>
              <div>
                <h3>{t(item.titleKey)}</h3>
                <p>{t(item.bodyKey)}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}

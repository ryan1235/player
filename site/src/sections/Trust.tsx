import { useI18n } from '../i18n/I18nProvider';
import { RevealOnScroll } from '../components/ui/RevealOnScroll';
import { FeatureCard } from '../components/ui/FeatureCard';
import { DownloadStrip } from '../components/ui/DownloadStrip';
import { IconNoAds, IconShieldCheck, IconHome, IconCpu, IconCode } from '../components/ui/icons';
import './Trust.css';

export function Trust() {
  const { t } = useI18n();

  const points = [
    { icon: <IconCode />, titleKey: 'trust.pointOpenSource.title', bodyKey: 'trust.pointOpenSource.body' },
    { icon: <IconNoAds />, titleKey: 'trust.point1.title', bodyKey: 'trust.point1.body' },
    { icon: <IconShieldCheck />, titleKey: 'trust.point2.title', bodyKey: 'trust.point2.body' },
    { icon: <IconHome />, titleKey: 'trust.point3.title', bodyKey: 'trust.point3.body' },
    { icon: <IconCpu />, titleKey: 'trust.point4.title', bodyKey: 'trust.point4.body' },
  ];

  return (
    <section className="section trust">
      <div className="container">
        <RevealOnScroll className="trust-header">
          <span className="eyebrow">{t('trust.eyebrow')}</span>
          <h2 className="section-title">{t('trust.title')}</h2>
        </RevealOnScroll>

        <div className="trust-grid">
          {points.map((p, i) => (
            <RevealOnScroll key={p.titleKey} delay={i * 0.06}>
              <FeatureCard icon={p.icon} title={t(p.titleKey)} body={t(p.bodyKey)} />
            </RevealOnScroll>
          ))}
        </div>

        <RevealOnScroll delay={0.2} className="trust-download-strip">
          <DownloadStrip />
        </RevealOnScroll>
      </div>
    </section>
  );
}

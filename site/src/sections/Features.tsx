import { useI18n } from '../i18n/I18nProvider';
import { RevealOnScroll } from '../components/ui/RevealOnScroll';
import { FeatureCard } from '../components/ui/FeatureCard';
import { IconPlay, IconWifi, IconCast, IconLive, IconHistory, IconSubtitles } from '../components/ui/icons';
import './Features.css';

export function Features() {
  const { t } = useI18n();

  const features = [
    { icon: <IconPlay />, titleKey: 'features.local.title', bodyKey: 'features.local.body' },
    { icon: <IconWifi />, titleKey: 'features.dlna.title', bodyKey: 'features.dlna.body' },
    { icon: <IconCast />, titleKey: 'features.cast.title', bodyKey: 'features.cast.body' },
    { icon: <IconLive />, titleKey: 'features.live.title', bodyKey: 'features.live.body' },
    { icon: <IconHistory />, titleKey: 'features.resume.title', bodyKey: 'features.resume.body' },
    { icon: <IconSubtitles />, titleKey: 'features.audio.title', bodyKey: 'features.audio.body' },
  ];

  return (
    <section id="recursos" className="section features">
      <div className="container">
        <RevealOnScroll>
          <span className="eyebrow">{t('features.eyebrow')}</span>
          <h2 className="section-title">{t('features.title')}</h2>
        </RevealOnScroll>

        <div className="features-grid">
          {features.map((f, i) => (
            <RevealOnScroll key={f.titleKey} delay={i * 0.06}>
              <FeatureCard icon={f.icon} title={t(f.titleKey)} body={t(f.bodyKey)} />
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}

import { useI18n } from '../i18n/I18nProvider';
import { RevealOnScroll } from '../components/ui/RevealOnScroll';
import { DownloadButton } from '../components/ui/DownloadButton';
import { StepCard } from '../components/ui/StepCard';
import { IconWindows, IconDownload, IconAlertTriangle, IconCheckCircle } from '../components/ui/icons';
import { SceneCanvas } from '../components/three/SceneCanvas';
import { SceneLights } from '../components/three/SceneLights';
import { DownloadObject } from '../components/three/DownloadObject';
import { ParticleField } from '../components/three/ParticleField';
import { siteConfig } from '../config/site.config';
import { formatBytes } from '../utils/formatBytes';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useInView } from '../hooks/useInView';
import { PARTICLE_COUNT, usePerformanceTier } from '../hooks/usePerformanceTier';
import './DownloadFinal.css';

export function DownloadFinal() {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const tier = usePerformanceTier();
  const { ref, inView } = useInView<HTMLDivElement>();
  const hasGithub = !!siteConfig.links.github;

  return (
    <section id="download" ref={ref} className="section download-final">
      <div className="download-final-canvas-wrap">
        {inView && (
          <SceneCanvas camera={{ position: [0, 0, 7.5], fov: 42 }}>
            <fog attach="fog" args={['#eef1f7', 8, 15]} />
            <SceneLights />
            <DownloadObject scale={0.85} position={[0, 0.1, -1.5]} />
            <ParticleField count={reducedMotion ? 0 : PARTICLE_COUNT[tier]} radius={5} />
          </SceneCanvas>
        )}
      </div>

      <div className="container download-final-inner">
        <RevealOnScroll className="download-final-header">
          <span className="eyebrow">{t('download.eyebrow')}</span>
          <h2 className="section-title">{t('download.title')}</h2>
          <p className="section-body">{t('download.subtitle')}</p>
        </RevealOnScroll>

        <RevealOnScroll delay={0.1} className="download-card">
          <div className="download-card-header">
            <img src="/icon.png" alt="" width={56} height={56} />
            <div className="download-card-heading">
              <h3>{t('download.cardTitle')}</h3>
              <p>{t('download.cardSubtitle')}</p>
            </div>
            <span className="version-badge">v{siteConfig.version}</span>
          </div>

          <div className="download-card-meta">
            <div className="meta-item">
              <IconWindows size={16} />
              <span>{siteConfig.requirements.os}</span>
            </div>
            <div className="meta-item">
              <IconDownload size={16} />
              <span>{formatBytes(siteConfig.installerSizeBytes)}</span>
            </div>
            {siteConfig.mpvBundled && (
              <div className="meta-item meta-item-text">
                <IconCheckCircle size={16} />
                <span>{t('common.mpvBundled')}</span>
              </div>
            )}
          </div>

          <div className="download-card-cta">
            <DownloadButton />
            {hasGithub ? (
              <a href={siteConfig.links.github!} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                {t('download.githubButton')}
              </a>
            ) : (
              <button type="button" className="btn btn-secondary btn-disabled" disabled>
                {t('download.githubSoon')}
              </button>
            )}
          </div>

          {!siteConfig.links.releaseDownloadWindows && <p className="download-card-note">{t('download.notPublished')}</p>}
        </RevealOnScroll>

        <RevealOnScroll delay={0.18} className="install-steps">
          <span className="eyebrow install-steps-eyebrow">{t('download.steps.eyebrow')}</span>
          <div className="install-steps-grid">
            <StepCard number="01" title={t('download.steps.step1.title')} body={t('download.steps.step1.body')} />
            <StepCard number="02" title={t('download.steps.step2.title')} body={t('download.steps.step2.body')} />
            <StepCard number="03" title={t('download.steps.step3.title')} body={t('download.steps.step3.body')} />
          </div>
        </RevealOnScroll>

        {!siteConfig.installerSigned && (
          <RevealOnScroll delay={0.24} className="unsigned-note">
            <IconAlertTriangle size={20} />
            <div>
              <strong>{t('download.unsigned.title')}</strong>
              <p>{t('download.unsigned.body')}</p>
            </div>
          </RevealOnScroll>
        )}
      </div>
    </section>
  );
}

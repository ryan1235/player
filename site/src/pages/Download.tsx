import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { RevealOnScroll } from '../components/ui/RevealOnScroll';
import { StepCard } from '../components/ui/StepCard';
import {
  IconWindows,
  IconDownload,
  IconShieldCheck,
  IconAlertTriangle,
  IconCode,
  IconCheckCircle,
} from '../components/ui/icons';
import { SceneCanvas } from '../components/three/SceneCanvas';
import { SceneLights } from '../components/three/SceneLights';
import { DownloadObject } from '../components/three/DownloadObject';
import { CertificateShield3D } from '../components/three/CertificateShield3D';
import { ParticleField } from '../components/three/ParticleField';
import { siteConfig } from '../config/site.config';
import { formatBytes } from '../utils/formatBytes';
import { useI18n } from '../i18n/I18nProvider';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useInView } from '../hooks/useInView';
import { PARTICLE_COUNT, usePerformanceTier } from '../hooks/usePerformanceTier';
import './Download.css';

export function Download() {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const tier = usePerformanceTier();
  const heroCanvas = useInView<HTMLDivElement>();
  const certCanvas = useInView<HTMLDivElement>();
  const [accepted, setAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const href = siteConfig.links.releaseDownloadWindows;

  return (
    <>
      <Navbar />
      <main className="download-page">
        <section className="section download-hero">
          <div ref={heroCanvas.ref} className="download-hero-canvas-wrap">
            {heroCanvas.inView && (
              <SceneCanvas camera={{ position: [0, 0, 7.5], fov: 42 }}>
                <fog attach="fog" args={['#eef1f7', 8, 15]} />
                <SceneLights />
                <DownloadObject scale={0.9} position={[0, 0.1, -1]} />
                <ParticleField count={reducedMotion ? 0 : PARTICLE_COUNT[tier]} radius={5} />
              </SceneCanvas>
            )}
          </div>

          <div className="container download-hero-inner">
            <RevealOnScroll>
              <Link to="/" className="back-link">
                {t('downloadPage.backToHome')}
              </Link>
              <span className="eyebrow">{t('downloadPage.eyebrow')}</span>
              <h1 className="section-title">{t('downloadPage.title')}</h1>
              <p className="section-body">{t('downloadPage.subtitle')}</p>
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

              <div className="terms-block">
                <label className="terms-checkbox">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  <span>{t('download.terms.checkboxLabel')}</span>
                </label>
                <button
                  type="button"
                  className="terms-toggle"
                  onClick={() => setTermsOpen((v) => !v)}
                  aria-expanded={termsOpen}
                >
                  {termsOpen ? t('download.terms.hide') : t('download.terms.show')}
                </button>
                <AnimatePresence initial={false}>
                  {termsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="terms-body-wrap"
                    >
                      <div className="terms-body">{t('download.terms.body')}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="download-card-cta">
                {!href ? (
                  <button type="button" className="btn btn-primary btn-disabled" disabled>
                    {t('download.buttonSoon')}
                  </button>
                ) : (
                  <a
                    href={href}
                    download
                    className={`btn btn-primary ${accepted ? '' : 'btn-disabled'}`}
                    aria-disabled={!accepted}
                    title={accepted ? undefined : t('download.terms.checkboxHint')}
                    onClick={(e) => {
                      if (!accepted) e.preventDefault();
                    }}
                  >
                    {t('download.button')}
                  </a>
                )}
              </div>

              {!href && <p className="download-card-note">{t('download.notPublished')}</p>}
              {href && <p className="download-card-note">{t('download.terms.acceptedNote')}</p>}
            </RevealOnScroll>
          </div>
        </section>

        <section className="section certificate-section">
          <div className="container certificate-inner">
            <RevealOnScroll className="certificate-copy">
              <span className="eyebrow">{t('download.certificate.eyebrow')}</span>
              <h2 className="section-title">{t('download.certificate.title')}</h2>
              <p className="section-body">{t('download.certificate.intro')}</p>

              <div className="certificate-explain-grid">
                <div className="explain-card">
                  <IconShieldCheck size={22} />
                  <h3>{t('download.certificate.whatIsIt.title')}</h3>
                  <p>{t('download.certificate.whatIsIt.body')}</p>
                </div>
                <div className="explain-card">
                  <IconCode size={22} />
                  <h3>{t('download.certificate.whyMissing.title')}</h3>
                  <p>{t('download.certificate.whyMissing.body')}</p>
                </div>
                <div className="explain-card">
                  <IconAlertTriangle size={22} />
                  <h3>{t('download.certificate.smartscreen.title')}</h3>
                  <p>{t('download.certificate.smartscreen.body')}</p>
                </div>
              </div>

              <p className="certificate-not-virus">
                <IconCheckCircle size={18} />
                {t('download.certificate.notVirus')}
              </p>
            </RevealOnScroll>

            <RevealOnScroll delay={0.12} className="certificate-visual">
              <div ref={certCanvas.ref} className="certificate-canvas-wrap">
                {certCanvas.inView && (
                  <SceneCanvas camera={{ position: [0, 0, 6], fov: 40 }}>
                    <SceneLights />
                    <CertificateShield3D scale={1.15} />
                  </SceneCanvas>
                )}
              </div>

              <div className="smartscreen-mockup">
                <div className="smartscreen-mockup-titlebar">
                  <IconWindows size={16} />
                  <span>{t('download.certificate.dialogTitle')}</span>
                </div>
                <div className="smartscreen-mockup-body">
                  <p>{t('download.certificate.dialogAppName')}</p>
                  <p className="muted">{t('download.certificate.dialogPublisher')}</p>
                </div>
                <div className="smartscreen-mockup-steps">
                  <div className="smartscreen-step">
                    <span className="step-index">1</span>
                    <div>
                      <strong>{t('download.certificate.step1Label')}</strong>
                      <p>{t('download.certificate.step1Hint')}</p>
                    </div>
                  </div>
                  <div className="smartscreen-step">
                    <span className="step-index">2</span>
                    <div>
                      <strong>{t('download.certificate.step2Label')}</strong>
                      <p>{t('download.certificate.step2Hint')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </RevealOnScroll>
          </div>
        </section>

        <section className="section install-steps-section">
          <div className="container">
            <RevealOnScroll className="install-steps-header">
              <span className="eyebrow">{t('download.steps.eyebrow')}</span>
            </RevealOnScroll>
            <RevealOnScroll delay={0.1} className="install-steps-grid">
              <StepCard number="01" title={t('download.steps.step1.title')} body={t('download.steps.step1.body')} />
              <StepCard number="02" title={t('download.steps.step2.title')} body={t('download.steps.step2.body')} />
              <StepCard number="03" title={t('download.steps.step3.title')} body={t('download.steps.step3.body')} />
            </RevealOnScroll>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

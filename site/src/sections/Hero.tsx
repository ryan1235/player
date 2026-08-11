import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { SceneCanvas } from '../components/three/SceneCanvas';
import { HeroScene } from '../components/three/HeroScene';
import { DownloadButton } from '../components/ui/DownloadButton';
import { IconNoAds, IconShieldCheck, IconHome, IconCode } from '../components/ui/icons';
import { useI18n } from '../i18n/I18nProvider';
import { useReducedMotion } from '../hooks/useReducedMotion';
import './Hero.css';

export function Hero() {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const sectionRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  const sceneOpacity = useTransform(scrollYProgress, [0, 0.75, 1], [1, 0.35, 0]);
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -60]);

  return (
    <section id="inicio" ref={sectionRef} className="hero">
      <motion.div className="hero-canvas-wrap" style={{ opacity: sceneOpacity, scale: sceneScale }}>
        <SceneCanvas camera={{ position: [0, 0.4, 8.5], fov: 42 }} className="hero-canvas">
          <HeroScene reducedMotion={reducedMotion} />
        </SceneCanvas>
      </motion.div>

      <div className="hero-vignette" aria-hidden="true" />

      <motion.div className="hero-content container" style={{ opacity: contentOpacity, y: contentY }}>
        <motion.p
          className="hero-kicker"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {t('whatIsIt.eyebrow')}
        </motion.p>

        <motion.h1
          className="hero-title"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <span>{t('hero.titleLine1')}</span>
          <span className="hero-title-accent">{t('hero.titleLine2')}</span>
        </motion.h1>

        <motion.p
          className="hero-subtitle"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          {t('hero.subtitle')}
        </motion.p>

        <motion.div
          className="hero-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <DownloadButton label={t('hero.ctaPrimary')} />
          <a
            href="/#o-que-e"
            className="btn btn-secondary"
            onClick={(e) => {
              // HashRouter usa o fragmento da URL como rota — um href="#id"
              // puro navegaria pra rota "/o-que-e" em vez de rolar. O Hero
              // so renderiza na home, entao aqui basta rolar direto.
              e.preventDefault();
              document.getElementById('o-que-e')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            {t('hero.ctaSecondary')}
          </a>
        </motion.div>

        <motion.div
          className="hero-trust-row"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.68, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <span><IconNoAds size={15} /> {t('hero.trust.noAds')}</span>
          <span><IconShieldCheck size={15} /> {t('hero.trust.noTelemetry')}</span>
          <span><IconHome size={15} /> {t('hero.trust.local')}</span>
          <span><IconCode size={15} /> {t('hero.trust.openSource')}</span>
        </motion.div>
      </motion.div>

      <motion.div
        className="hero-scroll-hint"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.8 }}
        style={{ opacity: contentOpacity }}
      >
        <span>{t('hero.scrollHint')}</span>
        <div className="hero-scroll-line" />
      </motion.div>
    </section>
  );
}

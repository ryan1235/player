import { useI18n } from '../i18n/I18nProvider';
import { RevealOnScroll } from '../components/ui/RevealOnScroll';
import { SceneCanvas } from '../components/three/SceneCanvas';
import { DlnaSceneContent } from '../components/three/DlnaSceneContent';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useInView } from '../hooks/useInView';
import { PARTICLE_COUNT, usePerformanceTier } from '../hooks/usePerformanceTier';
import './DlnaScene.css';

export function DlnaScene() {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const tier = usePerformanceTier();
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section className="section dlna-scene-section">
      <div className="container dlna-scene-grid">
        <RevealOnScroll className="dlna-scene-copy">
          <span className="eyebrow">{t('dlnaScene.eyebrow')}</span>
          <h2 className="section-title">{t('dlnaScene.title')}</h2>
          <p className="section-body">{t('dlnaScene.body')}</p>
        </RevealOnScroll>

        <div ref={ref} className="dlna-scene-canvas-wrap">
          {inView && (
            <SceneCanvas camera={{ position: [0, 0.1, 8.5], fov: 40 }}>
              <DlnaSceneContent reducedMotion={reducedMotion} particleCount={reducedMotion ? 0 : Math.round(PARTICLE_COUNT[tier] * 0.7)} />
            </SceneCanvas>
          )}
        </div>
      </div>
    </section>
  );
}

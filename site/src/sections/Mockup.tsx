import { useI18n } from '../i18n/I18nProvider';
import { RevealOnScroll } from '../components/ui/RevealOnScroll';
import { ContactShadows } from '@react-three/drei';
import { SceneCanvas } from '../components/three/SceneCanvas';
import { SceneLights } from '../components/three/SceneLights';
import { Laptop3D } from '../components/three/Laptop3D';
import { ParticleField } from '../components/three/ParticleField';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useInView } from '../hooks/useInView';
import { PARTICLE_COUNT, usePerformanceTier } from '../hooks/usePerformanceTier';
import './Mockup.css';

export function Mockup() {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const tier = usePerformanceTier();
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section className="section mockup-section">
      <div ref={ref} className="mockup-canvas-wrap">
        {inView && (
          <SceneCanvas camera={{ position: [0, 0.3, 6.6], fov: 38 }}>
            <fog attach="fog" args={['#eef1f7', 8, 15]} />
            <SceneLights />
            <Laptop3D position={[0, -1.3, 0]} scale={1.7} rotation={[0, -0.28, 0]} float={!reducedMotion} />
            <ParticleField count={reducedMotion ? 0 : Math.round(PARTICLE_COUNT[tier] * 0.5)} radius={5} />
            <ContactShadows position={[0, -2.35, 0]} opacity={0.3} scale={10} blur={2.4} far={3} color="#1a1d2e" />
          </SceneCanvas>
        )}
      </div>

      <div className="container mockup-copy">
        <RevealOnScroll>
          <span className="eyebrow">{t('mockup.eyebrow')}</span>
          <h2 className="section-title">{t('mockup.title')}</h2>
          <p className="section-body">{t('mockup.body')}</p>
        </RevealOnScroll>
      </div>
    </section>
  );
}

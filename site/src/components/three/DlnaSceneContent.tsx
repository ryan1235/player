import { ContactShadows, Html } from '@react-three/drei';
import { PlayerNode } from './PlayerNode';
import { TV3D } from './TV3D';
import { Server3D } from './Server3D';
import { Phone3D } from './Phone3D';
import { ConnectionLine } from './ConnectionLine';
import { ParticleField } from './ParticleField';
import { SceneLights } from './SceneLights';
import { useI18n } from '../../i18n/I18nProvider';

interface DlnaSceneContentProps {
  reducedMotion: boolean;
  particleCount: number;
}

const APP_POS: [number, number, number] = [0, 0.3, 0];
const PC_POS: [number, number, number] = [-2.7, 1.1, -0.4];
const SERVER_POS: [number, number, number] = [2.6, 1.1, -0.6];
const DEVICE_POS: [number, number, number] = [0, -1.5, 1.1];

function NodeLabel({ position, text }: { position: [number, number, number]; text: string }) {
  return (
    <group position={position}>
      <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: '#f3f4f7',
            background: 'rgba(10,11,15,0.75)',
            padding: '4px 9px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.1)',
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </div>
      </Html>
    </group>
  );
}

export function DlnaSceneContent({ reducedMotion, particleCount }: DlnaSceneContentProps) {
  const { t } = useI18n();

  return (
    <group>
      <fog attach="fog" args={['#eef1f7', 9, 17]} />
      <SceneLights />

      <PlayerNode position={APP_POS} scale={1} float={!reducedMotion} />
      <NodeLabel position={[APP_POS[0], APP_POS[1] - 0.55, APP_POS[2]]} text={t('dlnaScene.app')} />

      <TV3D position={PC_POS} scale={0.5} rotation={[0, 0.4, 0]} float={!reducedMotion} />
      <NodeLabel position={[PC_POS[0], PC_POS[1] - 0.75, PC_POS[2]]} text={t('dlnaScene.pc')} />

      <Server3D position={SERVER_POS} scale={1.05} rotation={[0, -0.5, 0]} float={!reducedMotion} />
      <NodeLabel position={[SERVER_POS[0], SERVER_POS[1] - 0.55, SERVER_POS[2]]} text={t('dlnaScene.server')} />

      <Phone3D position={DEVICE_POS} scale={1.1} rotation={[0, 0.3, 0]} float={!reducedMotion} />
      <NodeLabel position={[DEVICE_POS[0], DEVICE_POS[1] - 0.85, DEVICE_POS[2]]} text={t('dlnaScene.device')} />

      <ConnectionLine from={APP_POS} to={PC_POS} animate={!reducedMotion} />
      <ConnectionLine from={APP_POS} to={SERVER_POS} animate={!reducedMotion} />
      <ConnectionLine from={APP_POS} to={DEVICE_POS} animate={!reducedMotion} />

      <ParticleField count={particleCount} radius={6} />

      <ContactShadows position={[0, -2.15, 0]} opacity={0.28} scale={11} blur={2.4} far={3} color="#1a1d2e" />
    </group>
  );
}

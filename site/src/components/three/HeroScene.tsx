import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import type { Group } from 'three';
import { SceneLights } from './SceneLights';
import { Laptop3D } from './Laptop3D';
import { TV3D } from './TV3D';
import { Phone3D } from './Phone3D';
import { MediaDisc } from './MediaDisc';
import { ConnectionLine } from './ConnectionLine';
import { ParticleField } from './ParticleField';
import { PARTICLE_COUNT, usePerformanceTier } from '../../hooks/usePerformanceTier';

interface HeroSceneProps {
  reducedMotion: boolean;
}

// Composicao toda deslocada pra direita: o headline/CTA ocupam a coluna
// esquerda (ver Hero.css), entao nenhum objeto deve invadir x < ~0.8 — foi
// exatamente essa invasao que deixava o texto ilegivel antes.
const LAPTOP_POS: [number, number, number] = [2.0, -0.5, 0.2];
const PHONE_POS: [number, number, number] = [4.3, 1.3, -1.4];
const TV_POS: [number, number, number] = [4.6, -1.7, -2.8];
const DISC_A_POS: [number, number, number] = [3.3, -1.7, 1.1];
const DISC_B_POS: [number, number, number] = [5.1, 0.4, -0.6];

export function HeroScene({ reducedMotion }: HeroSceneProps) {
  const tier = usePerformanceTier();
  const rig = useRef<Group>(null);
  const { pointer } = useThree();

  useFrame(() => {
    if (!rig.current || reducedMotion) return;
    // Parallax discreto acompanhando o mouse — nao um cursor extravagante,
    // so a cena inteira reagindo levemente.
    rig.current.rotation.y += (pointer.x * 0.1 - rig.current.rotation.y) * 0.04;
    rig.current.rotation.x += (-pointer.y * 0.06 - rig.current.rotation.x) * 0.04;
  });

  return (
    <group ref={rig}>
      <fog attach="fog" args={['#eef1f7', 10, 20]} />
      <SceneLights />

      <Laptop3D position={LAPTOP_POS} rotation={[0, -0.4, 0]} scale={1.3} float={!reducedMotion} />
      <Phone3D position={PHONE_POS} scale={1.15} rotation={[0, -0.3, 0]} float={!reducedMotion} />
      <TV3D position={TV_POS} rotation={[0, 0.5, 0]} scale={0.85} float={!reducedMotion} />
      <MediaDisc position={DISC_A_POS} color="#8b6cf0" scale={0.9} float={!reducedMotion} />
      <MediaDisc position={DISC_B_POS} color="#5b7cfa" scale={0.55} float={!reducedMotion} />

      <ConnectionLine from={LAPTOP_POS} to={PHONE_POS} animate={!reducedMotion} />
      <ConnectionLine from={LAPTOP_POS} to={TV_POS} animate={!reducedMotion} />

      <ParticleField count={reducedMotion ? 0 : PARTICLE_COUNT[tier]} radius={7} position={[2, 0, -1]} />

      <ContactShadows position={[1.6, -2.05, 0]} opacity={0.32} scale={12} blur={2.6} far={3} color="#1a1d2e" />
    </group>
  );
}

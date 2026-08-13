import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import type { Mesh } from 'three';

interface DownloadObjectProps {
  position?: [number, number, number];
  scale?: number;
  reducedMotion?: boolean;
}

// Objeto central da secao de download final: um icosaedro facetado com
// pulso emissivo lento, representando o pacote/instalador do app "pronto
// pra ser baixado" sem ilustrar um arquivo literal.
export function DownloadObject({ position = [0, 0, 0], scale = 1, reducedMotion = false }: DownloadObjectProps) {
  const coreRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (reducedMotion || !coreRef.current) return;
    const pulse = 0.4 + Math.sin(clock.elapsedTime * 1.2) * 0.12;
    const mat = coreRef.current.material as import('three').MeshStandardMaterial;
    mat.emissiveIntensity = pulse;
  });

  const content = (
    <group position={position} scale={scale}>
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          color="#5b7cfa"
          emissive="#5b7cfa"
          emissiveIntensity={0.4}
          roughness={0.15}
          metalness={0.75}
          flatShading
        />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[1.22, 0]} />
        <meshBasicMaterial color="#8b6cf0" transparent opacity={0.06} wireframe />
      </mesh>
    </group>
  );

  // Mesmo tratamento que ParticleField/CertificateShield3D ja recebem: sem
  // isso, quem tem "reduzir movimento" ligado no SO ainda via um objeto
  // rotacionando/pulsando sem parar na pagina de Download.
  if (reducedMotion) return content;
  return (
    <Float speed={0.8} rotationIntensity={0.6} floatIntensity={0.7}>
      {content}
    </Float>
  );
}

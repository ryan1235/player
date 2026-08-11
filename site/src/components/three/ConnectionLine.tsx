import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

interface ConnectionLineProps {
  from: [number, number, number];
  to: [number, number, number];
  color?: string;
  pulseColor?: string;
  animate?: boolean;
}

// Linha 3D entre dois pontos, com um pequeno "pulso" de luz percorrendo o
// trajeto — representa uma transmissao DLNA acontecendo, nao so um enfeite.
// Usa o componente Line do drei (evita o conflito de tipos do <line> nativo
// do R3F com o JSX <line> do SVG do React).
export function ConnectionLine({ from, to, color = '#c7cbdb', pulseColor = '#4f6df2', animate = true }: ConnectionLineProps) {
  const pulseRef = useRef<THREE.Mesh>(null);
  const t = useRef(Math.random());
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);

  useFrame((_, delta) => {
    if (!animate || !pulseRef.current) return;
    t.current = (t.current + delta * 0.35) % 1;
    pulseRef.current.position.lerpVectors(start, end, t.current);
    const mat = pulseRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.sin(t.current * Math.PI);
  });

  return (
    <group>
      <Line points={[from, to]} color={color} transparent opacity={0.8} lineWidth={1.4} />
      {animate && (
        <mesh ref={pulseRef}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshBasicMaterial color={pulseColor} transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}

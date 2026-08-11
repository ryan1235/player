import { Float, RoundedBox } from '@react-three/drei';

interface PlayerNodeProps {
  position: [number, number, number];
  scale?: number;
  float?: boolean;
}

// Painel compacto com botao de play emissivo — representa "o Aura Player"
// como no central de uma composicao (ex.: cena DLNA), consistente com a
// tela do Laptop3D em vez de um icosaedro sem relacao com o produto.
export function PlayerNode({ position, scale = 1, float = true }: PlayerNodeProps) {
  const content = (
    <group position={position} scale={scale}>
      <RoundedBox args={[1.05, 0.72, 0.1]} radius={0.09} smoothness={4}>
        <meshPhysicalMaterial color="#14161f" roughness={0.28} metalness={0.6} clearcoat={0.6} clearcoatRoughness={0.25} />
      </RoundedBox>
      <mesh position={[0, 0, 0.056]}>
        <circleGeometry args={[0.24, 32]} />
        <meshStandardMaterial color="#171a2b" emissive="#4f6df2" emissiveIntensity={0.75} roughness={0.2} />
      </mesh>
      <mesh position={[0.02, 0, 0.062]}>
        <circleGeometry args={[0.09, 3]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );

  if (!float) return content;
  return (
    <Float speed={1.2} rotationIntensity={0.4} floatIntensity={0.7}>
      {content}
    </Float>
  );
}

import { Float } from '@react-three/drei';

interface MediaDiscProps {
  position?: [number, number, number];
  color?: string;
  scale?: number;
  float?: boolean;
}

// Disco/anel fino representando "midia" de forma abstrata (nao um disco
// fisico literal) — usado como elemento orbitando o objeto principal do
// Hero e nas composicoes de recursos.
export function MediaDisc({ position = [0, 0, 0], color = '#8b6cf0', scale = 1, float = true }: MediaDiscProps) {
  const content = (
    <group position={position} scale={scale}>
      <mesh rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[0.5, 0.045, 16, 48]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh rotation={[Math.PI / 2.4, 0, 0]}>
        <circleGeometry args={[0.16, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
    </group>
  );

  if (!float) return content;
  return (
    <Float speed={1.6} rotationIntensity={1.1} floatIntensity={0.9}>
      {content}
    </Float>
  );
}

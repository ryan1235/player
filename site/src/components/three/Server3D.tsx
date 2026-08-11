import { Float, RoundedBox } from '@react-three/drei';

interface Server3DProps {
  position: [number, number, number];
  scale?: number;
  rotation?: [number, number, number];
  float?: boolean;
}

// NAS/servidor estilizado — corpo em bloco com "slots" horizontais e LEDs de
// atividade, silhueta reconhecivel como equipamento de rede.
export function Server3D({ position, scale = 1, rotation = [0, 0, 0], float = true }: Server3DProps) {
  const slots = [0.24, 0, -0.24];

  const content = (
    <group position={position} scale={scale} rotation={rotation}>
      <RoundedBox args={[0.9, 0.62, 0.62]} radius={0.06} smoothness={4}>
        <meshPhysicalMaterial color="#171a26" roughness={0.32} metalness={0.6} clearcoat={0.5} clearcoatRoughness={0.3} />
      </RoundedBox>
      {slots.map((y, i) => (
        <mesh key={i} position={[0, y, 0.315]}>
          <planeGeometry args={[0.74, 0.11]} />
          <meshStandardMaterial color="#0d0f16" roughness={0.6} metalness={0.2} />
        </mesh>
      ))}
      {slots.map((y, i) => (
        <mesh key={`led-${i}`} position={[0.32, y, 0.32]}>
          <circleGeometry args={[0.02, 16]} />
          <meshBasicMaterial color={i === 0 ? '#5fd68a' : '#5b7cfa'} transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );

  if (!float) return content;
  return (
    <Float speed={1.1} rotationIntensity={0.35} floatIntensity={0.6}>
      {content}
    </Float>
  );
}

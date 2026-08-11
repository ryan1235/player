import { Float, RoundedBox } from '@react-three/drei';

interface Phone3DProps {
  position: [number, number, number];
  scale?: number;
  rotation?: [number, number, number];
  float?: boolean;
}

// Celular estilizado — silhueta reconhecivel (corpo fino vertical + tela
// arredondada + notch simples), nao um icosaedro generico.
export function Phone3D({ position, scale = 1, rotation = [0, 0, 0], float = true }: Phone3DProps) {
  const content = (
    <group position={position} scale={scale} rotation={rotation}>
      <RoundedBox args={[0.62, 1.28, 0.08]} radius={0.1} smoothness={4}>
        <meshPhysicalMaterial color="#171a26" roughness={0.28} metalness={0.6} clearcoat={0.7} clearcoatRoughness={0.2} />
      </RoundedBox>
      <mesh position={[0, 0, 0.043]}>
        <planeGeometry args={[0.52, 1.14]} />
        <meshStandardMaterial color="#0d0f16" emissive="#4f6df2" emissiveIntensity={0.5} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.5, 0.048]}>
        <circleGeometry args={[0.05, 20]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, -0.02, 0.05]}>
        <ringGeometry args={[0.09, 0.115, 24]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.75} />
      </mesh>
      <mesh position={[0.028, -0.048, 0.05]} rotation={[0, 0, -0.9]}>
        <planeGeometry args={[0.09, 0.018]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
      </mesh>
    </group>
  );

  if (!float) return content;
  return (
    <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.85}>
      {content}
    </Float>
  );
}

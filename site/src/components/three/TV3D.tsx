import { Float, RoundedBox } from '@react-three/drei';

interface TV3DProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  float?: boolean;
}

// TV/monitor estilizado: moldura escura com verniz (clearcoat) + "tela"
// emissiva em accent — como fotografia de produto real contra fundo claro.
export function TV3D({ position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, float = true }: TV3DProps) {
  const content = (
    <group position={position} rotation={rotation} scale={scale}>
      {/* moldura */}
      <RoundedBox args={[2.2, 1.35, 0.08]} radius={0.045} smoothness={4} castShadow receiveShadow>
        <meshPhysicalMaterial color="#14161f" roughness={0.32} metalness={0.55} clearcoat={0.6} clearcoatRoughness={0.25} />
      </RoundedBox>
      {/* tela */}
      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[2.02, 1.18]} />
        <meshStandardMaterial color="#171a2b" emissive="#4f6df2" emissiveIntensity={0.6} roughness={0.2} metalness={0.1} />
      </mesh>
      {/* botao de play sutil no centro da tela */}
      <mesh position={[0, 0, 0.05]}>
        <circleGeometry args={[0.16, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
      </mesh>
      {/* pe */}
      <mesh position={[0, -0.85, -0.02]}>
        <cylinderGeometry args={[0.05, 0.14, 0.5, 12]} />
        <meshPhysicalMaterial color="#14161f" roughness={0.4} metalness={0.5} clearcoat={0.4} />
      </mesh>
      <RoundedBox args={[0.55, 0.06, 0.3]} radius={0.02} smoothness={2} position={[0, -1.12, -0.02]}>
        <meshPhysicalMaterial color="#14161f" roughness={0.4} metalness={0.5} clearcoat={0.4} />
      </RoundedBox>
    </group>
  );

  if (!float) return content;
  return (
    <Float speed={1} rotationIntensity={0.25} floatIntensity={0.6}>
      {content}
    </Float>
  );
}

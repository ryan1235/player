import { Sparkles } from '@react-three/drei';

interface ParticleFieldProps {
  count?: number;
  radius?: number;
  color?: string;
  size?: number;
  speed?: number;
  position?: [number, number, number];
}

// Camada fina de particulas — representa "dados trafegando pela rede", nao
// um efeito decorativo generico. Contagem baixa e cor proxima do accent do
// app pra ficar sutil, nao "site gamer".
export function ParticleField({
  count = 140,
  radius = 6,
  color = '#4f6df2',
  size = 1.1,
  speed = 0.25,
  position = [0, 0, 0],
}: ParticleFieldProps) {
  if (count <= 0) return null;
  return (
    <Sparkles
      count={count}
      scale={[radius, radius * 0.6, radius]}
      size={size}
      speed={speed}
      color={color}
      opacity={0.45}
      position={position}
      noise={1}
    />
  );
}

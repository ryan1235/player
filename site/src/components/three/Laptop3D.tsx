import { useMemo } from 'react';
import { Float, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

interface Laptop3DProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  float?: boolean;
}

// Gera, via canvas 2D, a tela do laptop como um PLAYER de video reconhecivel
// a qualquer escala: barra de titulo minima (nod a interface real do app,
// mesma paleta bg #0b0d12 / accent #5b7cfa), botao de play grande e barra de
// progresso — em vez de tentar recriar a UI inteira em miniatura (ilegivel
// a essa escala e some visualmente).
function drawPlayerScreen(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 640;
  const ctx = canvas.getContext('2d')!;

  // fundo com leve vinheta radial pra dar profundidade
  const bg = ctx.createRadialGradient(512, 300, 80, 512, 320, 620);
  bg.addColorStop(0, '#161a26');
  bg.addColorStop(1, '#0a0b10');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // barra de titulo minima — nod a janela real do app, sem tentar ser legivel
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, 0, canvas.width, 54);
  const dot = ctx.createLinearGradient(24, 12, 54, 42);
  dot.addColorStop(0, '#5b7cfa');
  dot.addColorStop(1, '#8b6cf0');
  ctx.fillStyle = dot;
  ctx.beginPath();
  ctx.roundRect(24, 12, 30, 30, 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(68, 22, 150, 10);

  // botao de play central — anel de vidro + preenchimento em gradiente
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 - 10;
  const r = 92;

  const ringGrad = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.35);
  ringGrad.addColorStop(0, 'rgba(91,124,250,0.35)');
  ringGrad.addColorStop(1, 'rgba(91,124,250,0)');
  ctx.fillStyle = ringGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  const fillGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  fillGrad.addColorStop(0, '#5b7cfa');
  fillGrad.addColorStop(1, '#8b6cf0');
  ctx.fillStyle = fillGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  const triR = r * 0.42;
  ctx.moveTo(cx - triR * 0.55, cy - triR);
  ctx.lineTo(cx - triR * 0.55, cy + triR);
  ctx.lineTo(cx + triR * 1.05, cy);
  ctx.closePath();
  ctx.fill();

  // barra de progresso na parte inferior
  const barX = 90;
  const barY = 560;
  const barW = canvas.width - barX * 2;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, 6, 3);
  ctx.fill();

  const playedGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  playedGrad.addColorStop(0, '#5b7cfa');
  playedGrad.addColorStop(1, '#8b6cf0');
  ctx.fillStyle = playedGrad;
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW * 0.42, 6, 3);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(barX + barW * 0.42, barY + 3, 8, 0, Math.PI * 2);
  ctx.fill();

  // marcadores de tempo (blocos, nao texto — legivel como forma, nao ruido)
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(barX, barY + 22, 46, 8);
  ctx.fillRect(canvas.width - barX - 46, barY + 22, 46, 8);

  return canvas;
}

export function Laptop3D({ position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, float = true }: Laptop3DProps) {
  const texture = useMemo(() => {
    const tex = new THREE.CanvasTexture(drawPlayerScreen());
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  const content = (
    <group position={position} rotation={rotation} scale={scale}>
      {/* base */}
      <RoundedBox args={[2.6, 0.08, 1.7]} radius={0.04} smoothness={4} position={[0, -1.02, 0.35]} rotation={[-0.06, 0, 0]}>
        <meshPhysicalMaterial color="#14161f" roughness={0.35} metalness={0.65} clearcoat={0.55} clearcoatRoughness={0.25} />
      </RoundedBox>
      {/* tela (com dobradica na base) */}
      <group position={[0, -0.62, -0.42]} rotation={[-0.08, 0, 0]}>
        <RoundedBox args={[2.6, 1.62, 0.07]} radius={0.05} smoothness={4}>
          <meshPhysicalMaterial color="#181b26" roughness={0.3} metalness={0.55} clearcoat={0.55} clearcoatRoughness={0.25} />
        </RoundedBox>
        <mesh position={[0, 0, 0.045]}>
          <planeGeometry args={[2.42, 1.46]} />
          <meshStandardMaterial map={texture} roughness={0.3} metalness={0.05} emissive="#3d4a8a" emissiveIntensity={0.15} />
        </mesh>
      </group>
    </group>
  );

  if (!float) return content;
  return (
    <Float speed={0.9} rotationIntensity={0.3} floatIntensity={0.5}>
      {content}
    </Float>
  );
}

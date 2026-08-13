import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { Mesh } from 'three';

interface CertificateShield3DProps {
  position?: [number, number, number];
  scale?: number;
  float?: boolean;
  reducedMotion?: boolean;
}

// Escudo com um "X" flutuando na frente — pra secao de "o que e um
// certificado de assinatura de codigo" (pagina de Download). O X (nao um
// check) e proposital: o Aura Player NAO tem assinatura ainda, entao um
// escudo com check verde passaria a mensagem errada. O escudo em si continua
// solido/metalico (o app e seguro), so o selo de assinatura que falta.
function buildShieldShape(): THREE.Shape {
  const shape = new THREE.Shape();
  const w = 0.85;
  const topY = 1.05;
  shape.moveTo(-w, topY * 0.55);
  shape.bezierCurveTo(-w, topY, -w * 0.5, topY * 1.08, 0, topY * 1.15);
  shape.bezierCurveTo(w * 0.5, topY * 1.08, w, topY, w, topY * 0.55);
  shape.bezierCurveTo(w, -0.15, w * 0.55, -0.95, 0, -1.35);
  shape.bezierCurveTo(-w * 0.55, -0.95, -w, -0.15, -w, topY * 0.55);
  shape.closePath();
  return shape;
}

export function CertificateShield3D({ position = [0, 0, 0], scale = 1, float = true, reducedMotion = false }: CertificateShield3DProps) {
  const glowRef = useRef<Mesh>(null);

  const shieldGeometry = useMemo(() => {
    const shape = buildShieldShape();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.32,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 4,
      curveSegments: 24,
    });
    geo.center();
    return geo;
  }, []);

  useFrame(({ clock }) => {
    if (reducedMotion || !glowRef.current) return;
    const mat = glowRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.08 + Math.sin(clock.elapsedTime * 1.4) * 0.03;
  });

  const content = (
    <group position={position} scale={scale}>
      <mesh geometry={shieldGeometry} castShadow>
        <meshPhysicalMaterial
          color="#181b26"
          roughness={0.32}
          metalness={0.6}
          clearcoat={0.6}
          clearcoatRoughness={0.25}
        />
      </mesh>

      {/* halo sutil atras do escudo, mesma linguagem visual do DownloadObject */}
      <mesh ref={glowRef} position={[0, 0, -0.3]}>
        <circleGeometry args={[1.3, 40]} />
        <meshBasicMaterial color="#5b7cfa" transparent opacity={0.08} />
      </mesh>

      {/* "X" flutuando na frente: sinalizador de assinatura AUSENTE, nao um selo de aprovado */}
      <group position={[0, 0, 0.32]}>
        <RoundedBox args={[0.85, 0.16, 0.1]} radius={0.06} smoothness={4} rotation={[0, 0, Math.PI / 4]}>
          <meshStandardMaterial color="#f2a93b" emissive="#f2a93b" emissiveIntensity={0.35} roughness={0.3} metalness={0.4} />
        </RoundedBox>
        <RoundedBox args={[0.85, 0.16, 0.1]} radius={0.06} smoothness={4} rotation={[0, 0, -Math.PI / 4]}>
          <meshStandardMaterial color="#f2a93b" emissive="#f2a93b" emissiveIntensity={0.35} roughness={0.3} metalness={0.4} />
        </RoundedBox>
      </group>
    </group>
  );

  if (!float || reducedMotion) return content;
  return (
    <Float speed={0.85} rotationIntensity={0.35} floatIntensity={0.6}>
      {content}
    </Float>
  );
}

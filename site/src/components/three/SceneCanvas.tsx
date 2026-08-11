import { Suspense, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { DPR_CAP, usePerformanceTier } from '../../hooks/usePerformanceTier';

interface SceneCanvasProps {
  children: ReactNode;
  camera?: { position?: [number, number, number]; fov?: number };
  style?: React.CSSProperties;
  className?: string;
}

// Wrapper fino sobre <Canvas> do R3F: aplica o teto de DPR conforme a
// heuristica de performance do dispositivo e envolve em Suspense (drei/Html
// e outros helpers podem suspender). Compartilhado por todas as cenas do
// site pra nao duplicar essa configuracao em cada secao.
export function SceneCanvas({ children, camera, style, className }: SceneCanvasProps) {
  const tier = usePerformanceTier();

  return (
    <Canvas
      className={className}
      style={style}
      dpr={DPR_CAP[tier]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      // THREE limpa o frame com preto opaco por padrao mesmo com alpha:true
      // no contexto — sem isso o canvas pinta preto solido sobre o
      // conteudo HTML atras dele a cada frame.
      onCreated={({ gl }) => gl.setClearAlpha(0)}
      camera={{ position: camera?.position ?? [0, 0, 8], fov: camera?.fov ?? 45 }}
    >
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  );
}

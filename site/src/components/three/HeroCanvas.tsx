import { SceneCanvas } from './SceneCanvas';
import { HeroScene } from './HeroScene';

interface HeroCanvasProps {
  reducedMotion: boolean;
  className?: string;
  frameloop?: 'always' | 'never';
}

// Isolado num modulo proprio (com export default, exigido por React.lazy)
// so pra poder ser importado com import() dinamico em Hero.tsx — o Hero
// renderiza acima da dobra, sem estar atras de um useInView como as outras
// secoes 3D, entao sem isso o chunk de three.js/@react-three/fiber (~1MB)
// entrava no caminho critico da primeira renderizacao mesmo pro conteudo
// (titulo/CTA) que nao depende dele em nada.
export default function HeroCanvas({ reducedMotion, className, frameloop = 'always' }: HeroCanvasProps) {
  return (
    <SceneCanvas camera={{ position: [0, 0.4, 8.5], fov: 42 }} className={className} frameloop={frameloop}>
      <HeroScene reducedMotion={reducedMotion} />
    </SceneCanvas>
  );
}

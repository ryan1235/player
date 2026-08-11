import { useEffect, useState } from 'react';

export type PerfTier = 'high' | 'medium' | 'low';

// Heuristica simples e barata (sem benchmark real) pra decidir quanta coisa
// 3D mostrar: numero de nucleos de CPU + largura de tela + reduced-motion.
// Nao e cientifico, mas evita jogar centenas de particulas num celular fraco.
function detectTier(): PerfTier {
  if (typeof window === 'undefined') return 'medium';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return 'low';

  const cores = navigator.hardwareConcurrency || 4;
  const width = window.innerWidth;

  if (width < 640 || cores <= 2) return 'low';
  if (width < 1100 || cores <= 4) return 'medium';
  return 'high';
}

export function usePerformanceTier(): PerfTier {
  const [tier, setTier] = useState<PerfTier>(detectTier);

  useEffect(() => {
    const onResize = () => setTier(detectTier());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return tier;
}

export const PARTICLE_COUNT: Record<PerfTier, number> = {
  high: 260,
  medium: 130,
  low: 0,
};

export const DPR_CAP: Record<PerfTier, [number, number]> = {
  high: [1, 2],
  medium: [1, 1.5],
  low: [1, 1],
};

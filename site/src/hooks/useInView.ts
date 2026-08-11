import { useEffect, useRef, useState } from 'react';

// Monta conteudo pesado (canvas 3D) so quando a secao entra na viewport, e
// mantem montado depois disso (nao desmonta ao sair) — evita gastar GPU com
// cenas fora de tela sem ficar montando/desmontando o Canvas repetidamente.
export function useInView<T extends HTMLElement>(rootMargin = '200px') {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}

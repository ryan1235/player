import { useEffect, useRef, useState } from 'react';

// Monta conteudo pesado (canvas 3D) so quando a secao entra na viewport, e
// mantem montado depois disso (nao desmonta ao sair) — evita gastar GPU com
// cenas fora de tela sem ficar montando/desmontando o Canvas repetidamente.
//
// `isVisible`, diferente de `inView`, NAO e sticky — acompanha a secao
// entrando/saindo da tela continuamente. Sozinho `inView` so decide se monta
// o <Canvas>; sem `isVisible` cada Canvas montado ficava com seu loop de
// render (R3F frameloop="always" por padrao) rodando pra sempre depois da
// primeira vez que aparecia, mesmo ja rolado pra bem longe da tela — quem usa
// isso deve passar isVisible pro frameloop do SceneCanvas (ver Mockup.tsx,
// DlnaScene.tsx, DownloadFinal.tsx, pages/Download.tsx) pra pausar o loop sem
// desmontar o Canvas.
export function useInView<T extends HTMLElement>(rootMargin = '200px') {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        if (entry.isIntersecting) setInView(true);
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, inView, isVisible };
}

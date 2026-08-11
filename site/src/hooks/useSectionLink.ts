import { useNavigate, useLocation } from 'react-router-dom';

// Navegacao pra uma secao ancorada da home (#recursos, #como-funciona...).
// Com HashRouter o fragmento de URL (#...) e a propria ROTA — nao sobra
// espaco pra um segundo "#ancora" nativo do navegador funcionar junto, entao
// o scroll pra secao precisa ser feito manualmente via JS em vez de
// `href="#id"` puro. Quando ja estamos na home, so rola; vindo de outra
// pagina (/download, /suporte), navega pra home primeiro e rola assim que a
// secao existir no DOM.
export function useSectionLink() {
  const navigate = useNavigate();
  const location = useLocation();

  return (sectionId: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const scroll = () => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });

    if (location.pathname === '/') {
      scroll();
      return;
    }
    navigate('/');
    // A home precisa montar antes do elemento existir — tenta por um tempo
    // curto em vez de um unico setTimeout arbitrario que pode disparar cedo
    // demais em uma maquina lenta.
    let attempts = 0;
    const tryScroll = () => {
      attempts += 1;
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      } else if (attempts < 20) {
        requestAnimationFrame(tryScroll);
      }
    };
    requestAnimationFrame(tryScroll);
  };
}

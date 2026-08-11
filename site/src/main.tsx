import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from './i18n/I18nProvider';
import { App } from './App';
import { Download } from './pages/Download';
import { Support } from './pages/Support';
import './styles/global.css';

// HashRouter (URLs tipo /#/download) em vez de BrowserRouter: o site e
// hospedavel "em qualquer lugar" (ver README — GitHub Pages, Netlify,
// Vercel etc.) sem depender de regra de rewrite server-side pra rotas
// client-side. BrowserRouter exigiria essa configuracao especifica de cada
// host; HashRouter funciona em qualquer servidor estatico sem nenhuma
// config adicional.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/download" element={<Download />} />
          <Route path="/suporte" element={<Support />} />
        </Routes>
      </HashRouter>
    </I18nProvider>
  </StrictMode>
);

# Site do Aura Player

Landing page oficial do [Aura Player](../README.md) — projeto **isolado** dentro de `site/`, com `package.json` e `node_modules` próprios. Não interfere no app Electron.

## Rodar localmente

```bash
cd site
npm install
npm run dev
```

## Build de produção

```bash
npm run build
```

Gera `site/dist/` — arquivos estáticos, hospedáveis em qualquer lugar (GitHub Pages, Netlify, Vercel etc.).

## Configuração central

Todo dado real do produto (nome, versão, links, requisitos) fica em [`src/config/site.config.ts`](src/config/site.config.ts). Os campos `links.github`, `links.releaseDownloadWindows` e `links.documentation` começam `null` — a interface mostra um estado "em breve" honesto enquanto isso, em vez de um link falso. Preencha assim que existirem de verdade.

## Idiomas

Traduções em [`src/i18n/locales/pt-BR.json`](src/i18n/locales/pt-BR.json) e [`en-US.json`](src/i18n/locales/en-US.json) — chaves em paridade 1:1. Novo texto precisa entrar nos dois arquivos.

## Stack

Vite + React + TypeScript + [react-three-fiber](https://docs.pmnd.rs/react-three-fiber) + [drei](https://github.com/pmndrs/drei) + [Framer Motion](https://www.framer.com/motion/).

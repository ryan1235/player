// Configuracao central do site — dados reais extraidos do projeto do app
// (package.json, README.md, codigo-fonte de src/). Nada aqui e inventado:
// onde uma informacao real ainda nao existe (link do GitHub, pagina de
// releases publicada), o campo fica `null` e a UI trata isso mostrando um
// estado "em breve" em vez de um link falso — so trocar o valor aqui quando
// existir de verdade.

export const siteConfig = {
  appName: 'Aura Player',
  version: '1.0.0', // extraido de package.json (player/package.json)
  tagline: {
    pt: 'Sua mídia. Do seu jeito.',
    en: 'Your media. Your way.',
  },
  description: {
    pt: 'Um player de vídeo e Live HLS elegante, com navegação e recepção DLNA/UPnP para transmitir sua mídia aos dispositivos da sua rede.',
    en: 'An elegant video and Live HLS player, with DLNA/UPnP browsing and receiving to stream your media to devices on your network.',
  },
  developer: 'Ryan Luca',
  studio: {
    name: 'Archipixel',
    url: 'https://archipixel.com.br/',
  },

  // O projeto vai ser publicado como codigo aberto — o link do repositorio
  // ainda nao existe (preencha `links.github` quando publicar), mas a
  // intencao ja e real e vale comunicar no site.
  openSource: true,

  // Preencha quando o repositorio for criado e/ou um release publicado —
  // ate la a UI mostra "em breve" honestamente, sem link quebrado nem falso.
  links: {
    github: null as string | null,
    releaseDownloadWindows: null as string | null,
    documentation: null as string | null,
  },

  requirements: {
    os: 'Windows 10/11 (64-bit)',
    // README do app: precisa do mpv instalado e no PATH.
    dependency: 'mpv (winget install mpv.mpv)',
  },

  // Tamanho real do instalador NSIS gerado localmente (player/dist/Aura
  // Player Setup 1.0.0.exe, `npm run dist` no projeto do app) — nao e uma
  // estimativa. Atualize se rebuildar o instalador e o tamanho mudar.
  installerSizeBytes: 91917564,

  // O build do electron-builder atual nao tem certificado de assinatura de
  // codigo configurado (sem `certificateFile` em package.json > build) —
  // instalador roda, mas o Windows SmartScreen pode avisar. Documentado
  // honestamente na secao de Download em vez de escondido.
  installerSigned: false,

  // Extensoes de video suportadas pra reproducao local (mesmo filtro usado
  // pelo dialogo "Abrir arquivo" do app, main.js).
  supportedFormats: ['MP4', 'MKV', 'AVI', 'MOV', 'WebM', 'FLV', 'M4V', 'TS'],

  // Apps de celular citados no README como compativeis com o modo "Receber"
  // (o PC anunciado como MediaRenderer DLNA).
  compatibleCastApps: ['BubbleUPnP', 'VLC mobile', 'Transmitir para dispositivo (Windows)'],
} as const;

export type SiteConfig = typeof siteConfig;

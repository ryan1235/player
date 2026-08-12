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

  // O projeto vai ser publicado como codigo aberto — repositorio real
  // (ver links.github abaixo), publicado no GitHub.
  openSource: true,

  // Release v1.0.0 publicado de verdade — asset real, conferido na API do
  // GitHub antes de colar aqui (nao confirmado se foi via
  // .github/workflows/release.yml ou upload manual do build local).
  //
  // A partir da PROXIMA release (build gerado depois do artifactName fixo
  // "AuraPlayerSetup.exe" em package.json > build.nsis), da pra trocar essa
  // URL pela versao "latest" abaixo — ela sempre aponta pro asset da
  // release mais recente, sem precisar editar isso de novo a cada versao:
  //   https://github.com/ryan1235/player/releases/latest/download/AuraPlayerSetup.exe
  // v1.0.0 ainda usa o nome antigo (com versao no arquivo), entao por
  // enquanto o link fica fixo nela.
  links: {
    github: 'https://github.com/ryan1235/player' as string | null,
    releaseDownloadWindows: 'https://github.com/ryan1235/player/releases/download/v1.0.0/Aura.Player.Setup.1.0.0.exe' as string | null,
    documentation: null as string | null,
  },

  requirements: {
    os: 'Windows 10/11 (64-bit)',
  },

  // mpv agora vem EMBUTIDO no instalador (bin/mpv.exe, travado como unica
  // fonte em resolveMpvBinary() — ver src/mpv.js do app) — nao precisa mais
  // ser instalado separadamente. Mantido aqui em vez de hardcoded no JSX
  // porque e um fato sobre o produto, nao so texto de UI.
  mpvBundled: true,

  // Tamanho real do asset publicado no release v1.0.0 (conferido via API do
  // GitHub, nao e estimativa) — pode divergir por poucos bytes de um build
  // local por causa de timestamps do NSIS, sem significado pratico.
  // Atualize a cada novo release publicado.
  installerSizeBytes: 160360421,

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

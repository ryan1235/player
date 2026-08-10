# Player

Player de video simples em Electron, com navegacao de servidores DLNA/UPnP na rede local.

## O que ja funciona

- Abrir e reproduzir arquivos de video locais.
- Descobrir servidores DLNA (ex.: NAS, outro PC rodando Plex/Jellyfin/Windows Media Player com compartilhamento) via SSDP.
- Navegar pastas do servidor DLNA e reproduzir os arquivos direto pela URL do servidor.
- Controles basicos: play, pause, +-10s, stop, volume.
- **Modo "Receber"**: o PC aparece na rede como alvo de "Play To"/"Cast"/"Transmitir para dispositivo" (DLNA MediaRenderer). Ative na aba "Receber" — o app anuncia via SSDP e implementa os servicos AVTransport/RenderingControl/ConnectionManager, entao apps como BubbleUPnP, VLC mobile ou o proprio "Transmitir para dispositivo" do Windows devem conseguir mandar video pra ele.
- **Visual do player (uosc)**: a janela do mpv usa o script [uosc](https://github.com/tomasklaen/uosc) em vez da barra padrao — controles flutuantes minimalistas, com a cor de destaque combinando com o app (`mpv-config/script-opts/uosc.conf`). Se os arquivos do uosc nao estiverem presentes, o app cai de volta pra OSC padrao do mpv automaticamente.
- **Retomar de onde parou**: a posicao de reproducao e salva a cada ~8s (nao so ao fechar), em `watch-history.json` na pasta de dados do app. Ao abrir o mesmo arquivo/URL de novo, retoma automaticamente perto de onde parou (a nao ser que esteja nos ultimos ~8s do video). Isso cobre queda de energia/crash, nao so fechar normal. Limitacao: URLs de streaming com token de autenticacao que muda a cada sessao (ex.: apps de video mandando via cast) nao vao "bater" com o registro salvo, entao o resume so funciona de forma confiavel pra arquivos locais e URLs estaveis (ex.: seu proprio servidor DLNA).
- **Audio e legenda em PT-BR por padrao**: quando o arquivo tem faixa de audio ou legenda em portugues, o mpv seleciona automaticamente (prioridade `pt-br > pt > por > eng`).
- **Video embutido na propria janela do app**: o mpv renderiza dentro de uma aba "Player" da janela do Electron (via `--wid`, uma janela nativa invisivel posicionada exatamente sobre a area de video e sincronizada em tempo real com o layout). Ao abrir qualquer video — local, navegado no DLNA ou recebido via cast do celular — o app troca pra essa aba automaticamente.

## O que NAO esta implementado ainda

- **Espelhamento de tela tipo AirPlay** (como o 5KPlayer faz). Isso exige um protocolo separado (nao e DLNA) e normalmente depende de um binario externo tipo UxPlay. Nao foi incluido — se quiser isso, da pra integrar depois embutindo o UxPlay como processo filho.
- Eventing UPnP (GENA/SUBSCRIBE) so responde 200 mas nao envia notificacoes de mudanca de estado — apps que dependem disso podem levar alguns segundos a mais pra atualizar o status, mas os comandos (play/pause/seek/volume) funcionam.
- O Firewall do Windows pode pedir permissao na primeira vez que voce ativar o modo "Receber" (o app abre uma porta HTTP e escuta SSDP) — precisa permitir em redes privadas para outros dispositivos te acharem.
- O embed do video (`--wid`) e a parte mais nova e fragil do app. Se a janela de video nao acompanhar o app corretamente (ex.: ao mover/redimensionar/trocar de monitor), e o primeiro lugar a investigar.

## Pre-requisitos

Precisa do **mpv** instalado e no PATH. Instale com:

```bash
winget install mpv.mpv
```

Depois feche e reabra o terminal para o PATH atualizar.

## Como rodar

```bash
npm start
```

## Estrutura

```
src/
  main.js           processo principal do Electron, IPC handlers
  preload.js        ponte segura entre renderer e main
  mpv.js            controla o mpv externo via IPC (named pipe no Windows)
  dlna.js           descoberta SSDP + browse SOAP no ContentDirectory
  dlna-renderer.js  modo "Receber" (DLNA MediaRenderer / cast target)
  watch-history.js  persistencia de posicao de reproducao
  index.html        UI
  renderer.js       logica da UI
  styles.css        estilos
mpv-config/         config-dir dedicado do mpv (uosc + script-opts)
```

// Detecta se o stream atual e uma live observando o crescimento da
// propriedade "duration" do mpv ao longo do tempo — uma live tem a duracao
// avancando; um VOD tem duracao fixa. So decide "virou live"/"deixou de ser
// live" depois de ver o padrao se confirmar (evita falso positivo de uma
// unica oscilacao pontual).
//
// A "estabilidade" e medida em tempo real (ms desde o ultimo crescimento
// observado), NAO em contagem de ticks. Fontes como HLS crescem ~1s por
// tick, mas streams .ts brutos (IPTV) frequentemente reportam duration em
// rajadas — parada por alguns segundos, depois um pulo — e um contador de
// ticks fixo acaba caindo bem no meio desse padrao, fazendo a deteccao
// ligar/desligar sem parar. Um limite em tempo real da folga suficiente pra
// sobreviver a essas rajadas sem demorar demais pra perceber uma queda real.
class LiveDetector {
  constructor({ staleMs = 8000 } = {}) {
    this.lastDuration = null;
    this.lastGrowthAt = null;
    this._staleMs = staleMs;
  }

  reset() {
    this.lastDuration = null;
    this.lastGrowthAt = null;
  }

  // Chamado uma vez por tick com a duration atual do mpv. `currentlyLive` e
  // `locked` (modo live travado manualmente via toggleLiveMode) sao lidos do
  // estado do player. Retorna 'became-live', 'became-not-live' ou null.
  //
  // O rastreamento de lastDuration roda sempre que duration > 0, mesmo com
  // locked=true — so a DECISAO fica suspensa nesse caso. Suspender o
  // rastreamento junto faria o diff explodir num valor grande assim que o
  // modo fosse destravado (acumulando todo o crescimento do periodo
  // travado de uma vez).
  update(duration, currentlyLive, locked) {
    if (!(duration > 0)) return null;

    const diff = this.lastDuration !== null ? Math.abs(duration - this.lastDuration) : 0;
    const now = Date.now();
    let result = null;

    if (!locked) {
      if (diff > 0.01 && diff < 30) {
        this.lastGrowthAt = now;
        if (!currentlyLive) result = 'became-live';
      } else if (currentlyLive) {
        if (this.lastGrowthAt === null) this.lastGrowthAt = now;
        if (now - this.lastGrowthAt > this._staleMs) result = 'became-not-live';
      }
    }

    this.lastDuration = duration;
    return result;
  }

  // So pro log de debug (AURA_DEBUG_LIVE): ha quanto tempo a duration parou
  // de crescer.
  get msSinceGrowth() {
    return this.lastGrowthAt === null ? 0 : Date.now() - this.lastGrowthAt;
  }
}

module.exports = LiveDetector;

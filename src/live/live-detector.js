// Detecta se o stream atual e uma live observando o crescimento da
// propriedade "duration" do mpv ao longo do tempo — uma live tem a duracao
// avancando continuamente com o relogio; um VOD tem duracao fixa (com possiveis
// ajustes pontuais de demuxer/timestamp).
//
// So decide "virou live" apos confirmar crescimento sustentado em multiplas
// amostras (evitando falsos positivos em filmes/series onde a duracao varia
// milissegundos).
class LiveDetector {
  constructor({ staleMs = 8000, requiredGrowthSamples = 3 } = {}) {
    this.lastDuration = null;
    this.lastGrowthAt = null;
    this._staleMs = staleMs;
    this._requiredGrowthSamples = requiredGrowthSamples;
    this._growthHistory = [];
  }

  reset() {
    this.lastDuration = null;
    this.lastGrowthAt = null;
    this._growthHistory = [];
  }

  // Chamado a cada tick com a duration atual do mpv.
  // `currentlyLive`: se o player esta marcado como live no momento.
  // `locked`: se o usuario forcou o modo manualmente (toggleLiveMode).
  // `treatAsFinite`: se a midia e conhecida como finita (arquivo local, extensao VOD, URL de filme/serie).
  // Retorna 'became-live', 'became-not-live' ou null.
  update(duration, currentlyLive, locked, treatAsFinite = false) {
    if (locked) return null;

    if (treatAsFinite) {
      this._growthHistory = [];
      if (currentlyLive) return 'became-not-live';
      return null;
    }

    if (!(duration > 0)) return null;

    const now = Date.now();
    let result = null;

    if (this.lastDuration !== null) {
      const growth = duration - this.lastDuration;
      // Em transmissões ao vivo, a duração cresce para frente.
      // Ruídos de demuxer/timestamp (< 0.25s) ou variações negativas não contam como crescimento de live.
      const isMeaningfulGrowth = growth >= 0.25 && growth < 30;

      if (isMeaningfulGrowth) {
        this.lastGrowthAt = now;
        this._growthHistory.push({ time: now, duration });
        // Mantém apenas o histórico dos últimos 10 segundos
        this._growthHistory = this._growthHistory.filter((h) => now - h.time <= 10000);

        if (!currentlyLive) {
          // Exige confirmação de crescimento sustentado ao longo de pelo menos ~2.5s e múltiplas amostras
          if (this._growthHistory.length >= this._requiredGrowthSamples) {
            const first = this._growthHistory[0];
            const elapsedSecs = (now - first.time) / 1000;
            const totalGrowth = duration - first.duration;
            // A taxa de crescimento de uma live bate aproximadamente com o tempo real decorrido (0.4x a 3.0x)
            if (elapsedSecs >= 2.0 && totalGrowth >= 1.2 && (totalGrowth / elapsedSecs) >= 0.35 && (totalGrowth / elapsedSecs) <= 3.5) {
              result = 'became-live';
            }
          }
        }
      } else {
        // Duração parada ou variação insignificante/negativa
        if (currentlyLive) {
          if (this.lastGrowthAt === null) this.lastGrowthAt = now;
          if (now - this.lastGrowthAt > this._staleMs) {
            result = 'became-not-live';
            this._growthHistory = [];
          }
        } else {
          // Limpa histórico acumulado se ficou parado por mais de 3s
          if (now - (this.lastGrowthAt || 0) > 3000) {
            this._growthHistory = [];
          }
        }
      }
    } else {
      this.lastGrowthAt = now;
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

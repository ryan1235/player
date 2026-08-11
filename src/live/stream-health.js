// Maquina de estados central da saude do live: combina throughput, buffer e
// historico de stalls num score 0-100 e decide o estado atual. Existe pra
// que o sistema perceba a degradacao ANTES do buffer zerar (estado
// DEGRADING/CRITICAL), em vez de so descobrir que algo esta errado quando o
// mpv ja entrou em paused-for-cache (o que ate entao era o UNICO sinal usado
// no app inteiro).
//
// Estados:
//   HEALTHY    - tudo bem, nenhuma acao extra.
//   DEGRADING  - throughput/estabilidade pioraram; aumentar margem de buffer.
//   CRITICAL   - buffer perto de esgotar; priorizar recuperacao.
//   BUFFERING  - mpv de fato travou (paused-for-cache=true).
//   RECOVERING - saiu do stall, reconstruindo estabilidade antes de voltar a
//                HEALTHY (evita declarar "saudavel" 1 tick depois de um
//                stall e imediatamente cair de novo).
const HEALTHY_STREAK_NEEDED = 3;
const RECOVERING_STREAK_NEEDED = 4;

class StreamHealth {
  constructor() {
    this.state = 'HEALTHY';
    this.score = 100;
    this._healthyStreak = 0;
    this._recoveringStreak = 0;
  }

  reset() {
    this.state = 'HEALTHY';
    this.score = 100;
    this._healthyStreak = 0;
    this._recoveringStreak = 0;
  }

  // margin: throughput10s/bitrate (>1 sobra rede). stability: 0-1.
  // bufferFillRatio: cacheAmount/target (1 = buffer no alvo ou acima).
  // recentStallCount: janela de ~2min (BufferManager.recentStallCount).
  // isBuffering: paused-for-cache atual do mpv (sinal definitivo de stall).
  update({ margin, stability, bufferFillRatio, recentStallCount, isBuffering }) {
    const marginScore = clamp01(((margin ?? 1.5) - 0.9) / 1.6) * 100;
    const stabilityScore = clamp01(stability ?? 0.7) * 100;
    const fillScore = clamp01(bufferFillRatio ?? 1) * 100;
    const stallScore = Math.max(0, 100 - (recentStallCount || 0) * 20);

    const score = Math.round(
      marginScore * 0.35 + stabilityScore * 0.25 + fillScore * 0.25 + stallScore * 0.15
    );
    this.score = score;

    const prevState = this.state;

    if (isBuffering) {
      this.state = 'BUFFERING';
      this._healthyStreak = 0;
      this._recoveringStreak = 0;
    } else if (prevState === 'BUFFERING') {
      this.state = 'RECOVERING';
      this._recoveringStreak = 0;
    } else if (prevState === 'RECOVERING') {
      if (score >= 70) {
        this._recoveringStreak++;
        if (this._recoveringStreak >= RECOVERING_STREAK_NEEDED) {
          this.state = 'HEALTHY';
          this._healthyStreak = 0;
        }
      } else {
        this._recoveringStreak = 0;
        if (score < 40) this.state = 'CRITICAL';
      }
    } else if (score < 40) {
      this.state = 'CRITICAL';
      this._healthyStreak = 0;
    } else if (score < 70) {
      this.state = 'DEGRADING';
      this._healthyStreak = 0;
    } else {
      this._healthyStreak++;
      if (prevState !== 'HEALTHY' && this._healthyStreak < HEALTHY_STREAK_NEEDED) {
        // fica em DEGRADING ate confirmar melhora sustentada, evita
        // oscilar HEALTHY/DEGRADING a cada tick perto do limiar
        this.state = 'DEGRADING';
      } else {
        this.state = 'HEALTHY';
      }
    }

    return { score, state: this.state, changed: this.state !== prevState };
  }

  // Traducao pro pill simples que a UI ja usa (good/warning/danger).
  get liveHealthLabel() {
    switch (this.state) {
      case 'HEALTHY': return 'good';
      case 'DEGRADING': return 'warning';
      default: return 'danger';
    }
  }
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

module.exports = StreamHealth;

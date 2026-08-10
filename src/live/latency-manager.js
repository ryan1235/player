// Mantem o alvo de atraso (targetLiveDelay) atras da borda ao vivo e decide,
// a cada tick, se o player deve acelerar/desacelerar levemente (via
// mpv `speed`) pra convergir pra esse alvo, alem de reportar uma leitura de
// "saude" (liveHealth) pra UI. Nao aplica nenhum comando no mpv sozinho —
// so calcula; quem chama decide o que fazer com o resultado.
class LatencyManager {
  constructor({ jumpCooldownMs = 5000 } = {}) {
    this.targetLiveDelay = null;
    // Cooldown do salto de emergencia ("pulando pra ponta"): sem isso, uma
    // fonte onde o salto nao reduz o atraso de verdade (ex.: stream .ts bruto
    // sem indice seekable confiavel) dispara um seek novo a CADA tick,
    // indefinidamente, sem nunca resolver o problema. liveHealth continua
    // reportando 'danger' honestamente durante o cooldown — so a ACAO
    // (o comando de seek) fica em espera.
    this._jumpCooldownMs = jumpCooldownMs;
    this._lastJumpAt = 0;
  }

  reset(initial = 1.5) {
    this.targetLiveDelay = initial;
    this._lastJumpAt = 0;
  }

  // Chamado quando um stall é confirmado (RecoveryManager): aumenta a
  // margem de seguranca, capada em 15s.
  bumpOnStall() {
    this.targetLiveDelay = Math.min((this.targetLiveDelay || 1.5) + 2.0, 15.0);
    return this.targetLiveDelay;
  }

  // liveDelay: quao atras da borda o player esta (duration - position, ou
  // cacheTime como fallback). cacheAmount: quanto buffer de gordura existe
  // a frente da posicao atual. seekable: valor de "partially-seekable" do
  // mpv — streams .ts brutos de IPTV costumam vir como false, e ai um
  // comando de seek nao tem efeito confiavel. Retorna
  // { liveHealth, speed, seekJumpSecs }.
  computeTick({ liveDelay, cacheAmount, seekable = true }) {
    this.targetLiveDelay = this.targetLiveDelay || 3.0;

    if (cacheAmount < 2.0 && liveDelay > 5.0) {
      this.targetLiveDelay = Math.min(this.targetLiveDelay + 0.5, 12.0);
    } else if (cacheAmount >= 5.0) {
      this.targetLiveDelay = Math.max(this.targetLiveDelay - 0.5, 1.5);
    }

    const target = this.targetLiveDelay;

    if (liveDelay > target + 15) {
      if (!seekable) {
        // Sem seek confiavel, nao ha como "teleportar" pra borda — so resta
        // insistir no ajuste de velocidade, mesmo pra um atraso grande.
        return { liveHealth: 'danger', speed: 1.1, seekJumpSecs: 0 };
      }
      const now = Date.now();
      const canJump = now - this._lastJumpAt >= this._jumpCooldownMs;
      if (canJump) this._lastJumpAt = now;
      return { liveHealth: 'danger', speed: 1.0, seekJumpSecs: canJump ? Math.max(0, liveDelay - target) : 0 };
    }
    if (liveDelay > target + 2.0) {
      return { liveHealth: 'good', speed: 1.1, seekJumpSecs: 0 };
    }
    if (liveDelay < target - 0.5) {
      return { liveHealth: 'warning', speed: 0.95, seekJumpSecs: 0 };
    }
    return { liveHealth: 'good', speed: 1.0, seekJumpSecs: 0 };
  }
}

module.exports = LatencyManager;

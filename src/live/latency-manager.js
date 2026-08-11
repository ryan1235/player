// Mecanica de convergencia pra borda ao vivo: dado o alvo de buffer atual
// (calculado pelo BufferManager) e o atraso real, decide velocidade de
// reproducao (mpv `speed`) ou um salto de seek, em degraus (item 44 do
// pedido) em vez de um unico limiar "ou nada ou salta". So calcula — quem
// chama decide o que fazer com o resultado. Nao guarda mais o alvo de buffer
// (isso agora e responsabilidade do BufferManager) nem decide liveHealth
// (isso agora e responsabilidade do StreamHealth) — fica só com a mecanica
// de "como chegar no alvo".
//
// Faixas com HISTERESE: cada fronteira tem um limiar de ENTRADA (mais alto)
// e um de SAIDA (mais baixo) — enquanto `over` fica entre os dois, a faixa
// atual e mantida. Sem isso, um atraso oscilando bem em cima de um limiar
// unico (ex.: 1.4s/1.6s alternando a cada tick, comum com jitter normal de
// rede) fazia a velocidade — e os toasts que anunciam a mudanca — flicarem
// pra frente e pra tras a cada segundo ("margem de erro" pedida pelo
// usuario).
class LatencyManager {
  constructor({ jumpCooldownMs = 5000 } = {}) {
    // Cooldown do salto de emergencia ("pulando pra ponta"): sem isso, uma
    // fonte onde o salto nao reduz o atraso de verdade (ex.: stream .ts bruto
    // sem indice seekable confiavel) dispara um seek novo a CADA tick,
    // indefinidamente, sem nunca resolver o problema.
    this._jumpCooldownMs = jumpCooldownMs;
    this._lastJumpAt = 0;
    this._band = 'on-target';
  }

  reset() {
    this._lastJumpAt = 0;
    this._band = 'on-target';
  }

  // Decide a proxima faixa a partir da faixa ATUAL (nao so do valor de
  // `over`) — e exatamente isso que cria a zona-morta de histerese em cada
  // fronteira.
  _nextBand(over) {
    switch (this._band) {
      case 'ahead':
        return over > -1.0 ? 'on-target' : 'ahead';
      case 'on-target':
        if (over > 2.0) return 'gentle';
        if (over < -2.0) return 'ahead';
        return 'on-target';
      case 'gentle':
        if (over > 9.5) return 'firm';
        if (over < 1.0) return 'on-target';
        return 'gentle';
      case 'firm':
        if (over > 26.5) return 'big';
        if (over < 6.5) return 'gentle';
        return 'firm';
      case 'big':
        return over < 23.5 ? 'firm' : 'big';
      default:
        return 'on-target';
    }
  }

  // liveDelay: quao atras da borda o player esta (duration - position, ou
  // cacheTime como fallback). target: buffer-alvo atual em segundos (vindo
  // do BufferManager). seekable: "partially-seekable" do mpv — streams .ts
  // brutos de IPTV costumam vir como false, e ai um comando de seek nao tem
  // efeito confiavel. Retorna { speed, seekJumpSecs, tier } — `tier` e um id
  // estavel (nao um float de speed) pra quem chama detectar TRANSICOES de
  // faixa sem comparar numeros de ponto flutuante (usado pelos toasts do
  // Live Engine, ver mpv.js).
  computeTick({ liveDelay, target, seekable = true }) {
    const t = typeof target === 'number' && target > 0 ? target : 3.0;
    const delay = typeof liveDelay === 'number' ? liveDelay : t;
    const over = delay - t; // positivo = atrasado alem do alvo, negativo = adiantado

    this._band = this._nextBand(over);

    switch (this._band) {
      case 'ahead':
        return { speed: 0.97, seekJumpSecs: 0, tier: 'ahead' };
      case 'on-target':
        return { speed: 1.0, seekJumpSecs: 0, tier: 'on-target' };
      case 'gentle':
        return { speed: 1.03, seekJumpSecs: 0, tier: 'gentle' };
      case 'firm':
        return { speed: 1.08, seekJumpSecs: 0, tier: 'firm' };
      default: {
        // 'big': atraso grande — considerar salto controlado pra borda.
        if (!seekable) {
          // sem seek confiavel, so resta insistir no ajuste de velocidade
          // mesmo pra um atraso grande.
          return { speed: 1.1, seekJumpSecs: 0, tier: 'max-speed' };
        }
        const now = Date.now();
        const canJump = now - this._lastJumpAt >= this._jumpCooldownMs;
        if (canJump) this._lastJumpAt = now;
        return { speed: 1.0, seekJumpSecs: canJump ? Math.max(0, over) : 0, tier: 'jump' };
      }
    }
  }
}

module.exports = LatencyManager;

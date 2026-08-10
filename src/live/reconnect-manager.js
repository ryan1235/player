// Reconexao com backoff fixo (mesmo comportamento de antes: 3s entre
// tentativas, ate um numero maximo). Guarda a referencia do timer, entao
// quem usa isso PRECISA chamar cancel() quando o player for encerrado ou
// carregar um alvo novo — antes esse timer era um setTimeout anonimo,
// impossivel de cancelar.
class ReconnectManager {
  constructor({ maxAttempts, delayMs = 3000 }) {
    this.maxAttempts = maxAttempts;
    this.delayMs = delayMs;
    this.attempts = 0;
    this._timer = null;
  }

  get pending() {
    return !!this._timer;
  }

  get exhausted() {
    return this.attempts >= this.maxAttempts;
  }

  reset() {
    this.attempts = 0;
  }

  cancel() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  // Agenda uma tentativa (sem sobrepor uma ja pendente). onFire so roda
  // depois de delayMs, e so se canFire() ainda disser sim naquele momento.
  scheduleAttempt(canFire, onFire) {
    if (this.pending) return;
    this.attempts++;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (canFire()) onFire();
    }, this.delayMs);
  }
}

module.exports = ReconnectManager;

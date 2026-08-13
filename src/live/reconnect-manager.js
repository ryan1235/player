// Reconexao com backoff exponencial (item 18/19 do pedido de melhoria do
// live): a primeira queda tenta reconectar quase na hora (pode ter sido um
// glitch de 1 frame), e so a partir da segunda tentativa consecutiva o
// intervalo cresce (1s, 2s, 4s, 8s...) ate um teto — em vez do delay fixo de
// 3s de antes, que ou era rapido demais pra uma queda real (martelando a
// mesma reconexao fadada a falhar) ou lento demais pra um glitch transitorio.
// maxAttempts alto o suficiente pra so declarar ERRO depois de varios
// minutos tentando (antes desistia de vez em so 15s = 5 tentativas de 3s).
//
// Guarda a referencia do timer, entao quem usa isso PRECISA chamar cancel()
// quando o player for encerrado ou carregar um alvo novo.
class ReconnectManager {
  constructor({ maxAttempts = 40, baseDelayMs = 1000, maxDelayMs = 15000 } = {}) {
    this.maxAttempts = maxAttempts;
    this._baseDelayMs = baseDelayMs;
    this._maxDelayMs = maxDelayMs;
    this.attempts = 0;
    this._timer = null;
    this._scheduledAt = null;
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

  // n=1 (primeira tentativa depois da queda) -> 0ms (imediata).
  // n=2 -> baseDelayMs, n=3 -> baseDelayMs*2, ... capado em maxDelayMs.
  _delayForAttempt(n) {
    if (n <= 1) return 0;
    return Math.min(this._maxDelayMs, this._baseDelayMs * 2 ** (n - 2));
  }

  // Agenda uma tentativa (sem sobrepor uma ja pendente). onFire so roda
  // depois do delay calculado, e so se canFire() ainda disser sim naquele
  // momento.
  scheduleAttempt(canFire, onFire) {
    if (this.pending) return;
    this.attempts++;
    const delay = this._delayForAttempt(this.attempts);
    this._scheduledAt = Date.now();
    this._timer = setTimeout(() => {
      this._timer = null;
      if (canFire()) onFire();
    }, delay);
  }

  // Tempo restante ate a proxima tentativa disparar, nao o delay total
  // agendado — assim quem consome isso (status emitido a cada ~1s) consegue
  // mostrar uma contagem regressiva de verdade em vez de um numero fixo
  // parado no valor inicial pelo tempo todo que a tentativa fica pendente.
  get currentDelayMs() {
    if (!this.pending || this._scheduledAt === null) return 0;
    const total = this._delayForAttempt(this.attempts);
    const elapsed = Date.now() - this._scheduledAt;
    return Math.max(0, total - elapsed);
  }
}

module.exports = ReconnectManager;

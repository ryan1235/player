const logger = require('../services/logger');

// Auto-healing de stalls (buffer zerado / paused-for-cache=true). Reescrito
// pra resolver o ciclo trava->recupera->trava relatado: a versao anterior
// sempre retomava a reproducao 1.5s depois de pausar, sem checar se o buffer
// realmente se recompos — se a rede continuasse ruim, retomava direto num
// novo stall. Agora:
//   1. so considera retomar depois que o proprio mpv sinaliza que o cache
//      nao esta mais critico (buffering volta a false), OU um teto de
//      seguranca estoura (nunca fica pausado pra sempre);
//   2. exige que o buffer real (cacheAmount) tenha reconstruido pelo menos
//      metade do alvo atual antes de liberar;
//   3. registra o stall no BufferManager (que usa isso pra aumentar a
//      margem futura) e fica progressivamente mais paciente a cada stall
//      repetido numa janela curta — em vez de tentar retomar sempre no mesmo
//      ritmo mesmo quando a conexao claramente esta em loop.
class RecoveryManager {
  constructor({ command, bufferManager, minResumeMs = 1200, maxWaitMs = 8000 }) {
    this._command = command;
    this._bufferManager = bufferManager;
    this._minResumeMs = minResumeMs;
    this._maxWaitMs = maxWaitMs;
    this._wasBuffering = false;
    this._stallStartedAt = null;
  }

  get isRecovering() {
    return this._wasBuffering;
  }

  reset() {
    this._wasBuffering = false;
    this._stallStartedAt = null;
  }

  // Sem timers proprios (o resume e decidido a cada tick, nao por
  // setTimeout) — mantido por compatibilidade com quem chama isso em
  // stop()/quit().
  cancel() {}

  // Chamado a cada tick do loop de status. `snapshot` = { buffering,
  // cacheAmount, target }. `canResume()` e avaliada so no momento de
  // despausar de fato (o player pode ter saido do live, entrado em DVR ou
  // estar encerrando nesse meio tempo).
  onTick({ buffering, cacheAmount, target }, canResume) {
    if (buffering) {
      if (!this._wasBuffering) {
        this._wasBuffering = true;
        this._stallStartedAt = Date.now();
        this._bufferManager.registerStall();
        logger.recovery(
          `STALL DETECTED buffer=${(cacheAmount ?? 0).toFixed(1)}s alvo=${(target ?? 0).toFixed(1)}s stalls_recentes=${this._bufferManager.recentStallCount}`
        );
        this._command(['set_property', 'pause', true]).catch(() => {});
      }
      return;
    }

    if (!this._wasBuffering) return;

    const stallCount = this._bufferManager.recentStallCount;
    // Quanto mais stalls recentes, mais paciente antes de retomar — evita
    // resumir num ritmo fixo direto num loop quando a rede claramente esta
    // indo mal repetidamente.
    const patienceSteps = Math.min(stallCount, 4);
    const minResumeMs = this._minResumeMs + patienceSteps * 800;
    const maxWaitMs = this._maxWaitMs + patienceSteps * 1000;

    const elapsed = Date.now() - this._stallStartedAt;
    const rebuiltEnough = typeof cacheAmount === 'number' && typeof target === 'number' && target > 0
      ? cacheAmount >= Math.min(target * 0.5, 4)
      : true;
    const forceResume = elapsed >= maxWaitMs;

    if ((elapsed >= minResumeMs && rebuiltEnough) || forceResume) {
      this._wasBuffering = false;
      this._stallStartedAt = null;
      if (canResume()) {
        if (forceResume && !rebuiltEnough) {
          logger.recovery(`Retomando por teto de seguranca (${(maxWaitMs / 1000).toFixed(1)}s) sem buffer ideal reconstruido.`);
        }
        this._command(['set_property', 'pause', false]).catch(() => {});
      }
    }
  }
}

module.exports = RecoveryManager;

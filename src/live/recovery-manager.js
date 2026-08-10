const logger = require('../services/logger');

// Auto-healing: quando o buffer trava (paused-for-cache), forca uma pausa
// real de 1.5s pra acumular gordura antes de retomar, em vez de deixar o
// mpv oscilar pausa-play sozinho. So dispara uma vez por evento de stall
// (a borda "comecou a bufferizar"), nao a cada tick enquanto o buffering
// continua.
class RecoveryManager {
  constructor({ command, latencyManager, resumeDelayMs = 1500 }) {
    this._command = command;
    this._latency = latencyManager;
    this._resumeDelayMs = resumeDelayMs;
    this._wasBuffering = false;
    this._resumeTimer = null;
  }

  get isRecovering() {
    return this._wasBuffering;
  }

  reset() {
    this._wasBuffering = false;
    this.cancel();
  }

  cancel() {
    if (this._resumeTimer) {
      clearTimeout(this._resumeTimer);
      this._resumeTimer = null;
    }
  }

  // Chamado a cada tick com o `buffering` atual do mpv. `canResume` e uma
  // funcao avaliada so no momento de despausar (1.5s depois) — o player pode
  // ter saido do live, entrado em DVR ou estar encerrando nesse meio tempo.
  onTick(buffering, canResume) {
    if (buffering) {
      if (!this._wasBuffering) {
        this._wasBuffering = true;
        const target = this._latency.bumpOnStall();
        logger.recovery(`Travou! Aumentando alvo de buffer para ${target}s`);
        this._command(['set_property', 'pause', true]).catch(() => {});
        this._resumeTimer = setTimeout(() => {
          this._resumeTimer = null;
          if (canResume()) {
            this._command(['set_property', 'pause', false]).catch(() => {});
          }
        }, this._resumeDelayMs);
      }
    } else {
      this._wasBuffering = false;
    }
  }
}

module.exports = RecoveryManager;

// Monitor de throughput real da conexao, construido a partir do que o mpv
// expoe via IPC (nao existe acesso a bytes/sockets brutos nesse processo — o
// mpv/ffmpeg e quem fala HTTP de verdade). A cada tick do loop de status,
// quem chama passa o raw-input-rate atual (bytes/s) lido de
// demuxer-cache-state; aqui so acumulamos amostras com timestamp e derivamos
// medias moveis + estabilidade, em vez de reagir a uma unica leitura
// instantanea (que e ruidosa e pode mascarar uma queda real por 1-2 ticks).
class NetworkMonitor {
  constructor({ windowMs = 30000 } = {}) {
    this._windowMs = windowMs;
    this._samples = []; // { t, bps }
  }

  reset() {
    this._samples = [];
  }

  sample(rawBps) {
    if (typeof rawBps !== 'number' || !isFinite(rawBps) || rawBps < 0) return;
    const now = Date.now();
    this._samples.push({ t: now, bps: rawBps });
    const cutoff = now - this._windowMs;
    while (this._samples.length && this._samples[0].t < cutoff) this._samples.shift();
  }

  _windowed(ms) {
    const cutoff = Date.now() - ms;
    return this._samples.filter((s) => s.t >= cutoff);
  }

  _avg(list) {
    if (!list.length) return null;
    return list.reduce((a, s) => a + s.bps, 0) / list.length;
  }

  // { instantBps, avg3sBps, avg10sBps, avg30sBps, minRecentBps, stability,
  //   trend, hasData }. stability vai de 0 (rede violentamente instavel) a 1
  // (rede perfeitamente constante) — coeficiente de variacao invertido sobre
  // a janela de 10s, exatamente pra pegar o caso "media boa mas oscila muito"
  // descrito no pedido (20Mbps de media escondendo picos de 2-40Mbps).
  getStats() {
    if (!this._samples.length) {
      return {
        instantBps: 0, avg3sBps: 0, avg10sBps: 0, avg30sBps: 0,
        minRecentBps: 0, stability: 1, trend: 'unknown', hasData: false,
      };
    }
    const instantBps = this._samples[this._samples.length - 1].bps;
    const w3 = this._windowed(3000);
    const w10 = this._windowed(10000);
    const w30 = this._windowed(30000);

    const avg3sBps = this._avg(w3) ?? instantBps;
    const avg10sBps = this._avg(w10) ?? avg3sBps;
    const avg30sBps = this._avg(w30) ?? avg10sBps;

    const mean10 = avg10sBps;
    const variance = w10.length
      ? w10.reduce((a, s) => a + (s.bps - mean10) ** 2, 0) / w10.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const cov = mean10 > 0 ? stdDev / mean10 : 0;
    const stability = Math.max(0, Math.min(1, 1 - cov));
    const minRecentBps = w10.length ? Math.min(...w10.map((s) => s.bps)) : instantBps;

    let trend = 'stable';
    if (avg3sBps < avg10sBps * 0.7) trend = 'falling';
    else if (avg3sBps > avg10sBps * 1.3) trend = 'rising';

    return { instantBps, avg3sBps, avg10sBps, avg30sBps, minRecentBps, stability, trend, hasData: true };
  }
}

module.exports = NetworkMonitor;

// Calcula o buffer-alvo (targetLiveDelay) ideal a cada momento, a partir de
// margem throughput/bitrate + estabilidade da rede + historico recente de
// stalls — em vez do avanco/recuo fixo de 0.5s que o LatencyManager fazia
// sozinho olhando so o cacheAmount atual. Nao aplica nada no mpv, so calcula;
// o LatencyManager continua sendo quem decide speed/seek em cima do alvo
// devolvido aqui.
//
// Faixas (calibradas pra favorecer a MENOR latencia que ainda for segura,
// nunca o buffer maximo possivel — ver item 10/11 do pedido):
//   margem alta + rede estavel      -> ~2s   (baixa latencia)
//   margem boa  + rede razoavel     -> ~4.5s (balanceado)
//   margem apertada                 -> ~8s   (estavel)
//   margem ruim ou muito instavel   -> ~14s  (bem cauteloso)
// Sobre essa base, instabilidade e stalls recentes somam margem extra,
// decaindo sozinhos conforme saem da janela de historico.
//
// Perfis (Configurações > Ao Vivo): ajustam o piso/teto do alvo e um viés
// aditivo sobre o calculo acima — nao substituem a logica adaptativa, so
// deslocam a faixa em que ela pode operar. AUTO (piso 1.5s/teto 20s, sem
// vies) e o comportamento padrao/recomendado; os demais sao pra usuarios
// avancados que preferem sacrificar latencia por estabilidade ou vice-versa.
// 'custom' e tratado a parte (ver setProfile/computeTarget abaixo) porque os
// limites dependem do valor que o usuario digitou, nao sao fixos.
const PROFILES = {
  auto: { minTarget: 1.5, maxTarget: 20, bias: 0 },
  low: { minTarget: 1.0, maxTarget: 6, bias: -1.5 },
  balanced: { minTarget: 2.5, maxTarget: 12, bias: 0.5 },
  stable: { minTarget: 5.0, maxTarget: 20, bias: 4.0 },
};
const MIN_CUSTOM_TARGET_SECS = 1;
const MAX_CUSTOM_TARGET_SECS = 30;
const DEFAULT_CUSTOM_TARGET_SECS = 5;

// "Confianca" por historico de estabilidade: o calculo acima reage so ao
// tick atual (margem/estabilidade instantaneas), o que pode manter o alvo
// alto mesmo depois de MUITO tempo sem nenhum stall — uma leitura de margem
// apertada nao necessariamente significa risco real se a conexao vem
// segurando aquela margem ha 10+ minutos sem soluçar. Depois de um tempo
// minimo sem stall (CONFIDENCE_RAMP_START_MS), comeca a "testar" um alvo
// menor, reduzindo-o gradualmente (nunca de uma vez) ate um teto de desconto
// (CONFIDENCE_MAX_DISCOUNT) alcançado em CONFIDENCE_RAMP_FULL_MS. Qualquer
// stall novo zera o desconto na hora (registerStall rereseta o relogio) — a
// escalada de stallPenalty acima ja cuida de subir o alvo de volta.
const CONFIDENCE_RAMP_START_MS = 2 * 60 * 1000; // comeca a testar depois de 2min limpo
const CONFIDENCE_RAMP_FULL_MS = 12 * 60 * 1000; // desconto maximo com 12min limpo
const CONFIDENCE_MAX_DISCOUNT = 4.0; // segundos

class BufferManager {
  constructor({ minTarget = 1.5, maxTarget = 20, stallHistoryMs = 120000, profile = 'auto', customTargetSecs = DEFAULT_CUSTOM_TARGET_SECS } = {}) {
    this.minTarget = minTarget;
    this.maxTarget = maxTarget;
    this._bias = 0;
    this.profile = 'auto';
    this._customTargetSecs = clampCustomTarget(customTargetSecs);
    this._stallHistoryMs = stallHistoryMs;
    this._stallTimestamps = [];
    this._lastStallAt = null;
    this._sessionStartAt = Date.now();
    this._lastConfidenceDiscount = 0;
    if (profile !== 'auto') this.setProfile(profile);
  }

  // Troca o perfil em tempo real (o usuario pode mudar isso em Configuracoes
  // com uma live em andamento) — nao precisa de reset, o proximo tick de
  // computeTarget ja usa os novos limites.
  setProfile(profile) {
    if (profile === 'custom') {
      this.profile = 'custom';
      this._applyCustomBounds();
      return;
    }
    const p = PROFILES[profile] || PROFILES.auto;
    this.profile = PROFILES[profile] ? profile : 'auto';
    this.minTarget = p.minTarget;
    this.maxTarget = p.maxTarget;
    this._bias = p.bias;
  }

  // Latencia-alvo que o usuario pediu (Configuracoes > Ao Vivo > perfil
  // "Personalizado"). Nao e um teto rigido — e a "meta" ao redor da qual o
  // calculo de computeTarget converge quando a rede permite; se a rede
  // degradar, as penalidades normais (instabilidade/stall) ainda empurram o
  // alvo pra cima dentro do teto de seguranca, exatamente como nos outros
  // perfis. Pode ser chamado com ou sem o perfil 'custom' ativo (o valor
  // fica guardado pra quando o usuario trocar pra ele).
  setCustomTarget(secs) {
    this._customTargetSecs = clampCustomTarget(secs);
    if (this.profile === 'custom') this._applyCustomBounds();
  }

  _applyCustomBounds() {
    // Piso perto do valor pedido (nunca abaixo de MIN_CUSTOM_TARGET_SECS);
    // teto generoso e FIXO (nao ligado ao valor pedido) — e o que garante
    // que "tentar chegar" num numero baixo nao vira "nunca ter buffer o
    // bastante pra sobreviver a uma rede ruim". O teto e o mesmo do AUTO.
    this.minTarget = Math.max(MIN_CUSTOM_TARGET_SECS, this._customTargetSecs - 3);
    this.maxTarget = PROFILES.auto.maxTarget;
    this._bias = 0;
  }

  reset() {
    this._stallTimestamps = [];
    this._lastStallAt = null;
    this._sessionStartAt = Date.now();
    this._lastConfidenceDiscount = 0;
  }

  registerStall() {
    this._stallTimestamps.push(Date.now());
    this._lastStallAt = Date.now();
    this._pruneStalls();
  }

  // Ha quanto tempo (ms) a conexao esta sem nenhum stall — desde o ultimo
  // registerStall(), ou desde o inicio da sessao/reset() se nunca travou.
  get stableMs() {
    return Date.now() - (this._lastStallAt || this._sessionStartAt);
  }

  // Desconto atual (segundos) aplicado ao alvo por causa do historico limpo
  // — 0 antes de CONFIDENCE_RAMP_START_MS, rampa linear ate
  // CONFIDENCE_MAX_DISCOUNT em CONFIDENCE_RAMP_FULL_MS. Perfil STABLE nunca
  // "testa" — o usuario pediu explicitamente maxima cautela nesse perfil.
  get confidenceDiscount() {
    if (this.profile === 'stable') return 0;
    const stable = this.stableMs;
    if (stable < CONFIDENCE_RAMP_START_MS) return 0;
    const ramp = Math.min(1, (stable - CONFIDENCE_RAMP_START_MS) / (CONFIDENCE_RAMP_FULL_MS - CONFIDENCE_RAMP_START_MS));
    return ramp * CONFIDENCE_MAX_DISCOUNT;
  }

  _pruneStalls() {
    const cutoff = Date.now() - this._stallHistoryMs;
    while (this._stallTimestamps.length && this._stallTimestamps[0] < cutoff) {
      this._stallTimestamps.shift();
    }
  }

  get recentStallCount() {
    this._pruneStalls();
    return this._stallTimestamps.length;
  }

  // margin: quantas vezes o throughput medio (10s) excede o bitrate do
  // stream (>1 = sobra rede, <1 = rede insuficiente pro bitrate atual).
  // stability: 0-1 vindo do NetworkMonitor (1 = constante, 0 = instavel).
  computeTarget({ margin, stability }) {
    const m = typeof margin === 'number' && isFinite(margin) ? margin : 1.5;
    const s = typeof stability === 'number' && isFinite(stability) ? stability : 0.7;

    let base;
    if (this.profile === 'custom') {
      // Perfil personalizado: a meta E o valor que o usuario pediu, nao a
      // faixa automatica por margem/estabilidade — essas ainda entram como
      // penalidades ABAIXO, so a base muda.
      base = this._customTargetSecs;
    } else if (m >= 2.5 && s >= 0.85) base = 2.0;
    else if (m >= 1.6 && s >= 0.7) base = 4.5;
    else if (m >= 1.15) base = 8.0;
    else base = 14.0;

    const instabilityPenalty = (1 - s) * 8;
    const stallPenalty = Math.min(this.recentStallCount * 2.5, 8);
    const discount = this.confidenceDiscount;
    this._lastConfidenceDiscount = discount;

    const target = base + instabilityPenalty + stallPenalty + this._bias - discount;
    return Math.max(this.minTarget, Math.min(this.maxTarget, target));
  }
}

function clampCustomTarget(secs) {
  const n = typeof secs === 'number' && isFinite(secs) ? secs : DEFAULT_CUSTOM_TARGET_SECS;
  return Math.max(MIN_CUSTOM_TARGET_SECS, Math.min(MAX_CUSTOM_TARGET_SECS, n));
}

module.exports = BufferManager;

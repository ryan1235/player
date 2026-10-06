/**
 * @file subtitle-classifier.js
 * Sistema inteligente de classificação e priorização de legendas.
 * Identifica e diferencia legendas "Signs Only" (placas, letreiros, textos na tela),
 * "Signs & Songs", "Forced", "Foreign Parts", "HI / SDH", "Full / Normal", etc.
 */

/**
 * Tipos canônicos de classificação de legendas
 */
const SUBTITLE_TYPES = {
  SIGNS_ONLY: 'signs_only',
  SIGNS: 'signs',
  SIGNS_AND_SONGS: 'signs_and_songs',
  FORCED_SIGNS: 'forced_signs',
  FORCED: 'forced',
  FOREIGN_PARTS: 'foreign_parts',
  TEXT_ONLY: 'text_only',
  FULL: 'full',
  DIALOGUE_ONLY: 'dialogue_only',
  HI_SDH: 'hi_sdh',
  UNKNOWN: 'unknown',
};

/**
 * Rótulos legíveis para exibição na interface do usuário
 */
const CATEGORY_LABELS = {
  [SUBTITLE_TYPES.SIGNS_ONLY]: 'Signs Only',
  [SUBTITLE_TYPES.SIGNS]: 'Signs',
  [SUBTITLE_TYPES.SIGNS_AND_SONGS]: 'Signs & Songs',
  [SUBTITLE_TYPES.FORCED_SIGNS]: 'Forced Signs',
  [SUBTITLE_TYPES.FORCED]: 'Forced',
  [SUBTITLE_TYPES.FOREIGN_PARTS]: 'Foreign Parts',
  [SUBTITLE_TYPES.TEXT_ONLY]: 'Text Only',
  [SUBTITLE_TYPES.FULL]: 'Full / Normal',
  [SUBTITLE_TYPES.DIALOGUE_ONLY]: 'Dialogue Only',
  [SUBTITLE_TYPES.HI_SDH]: 'HI / SDH',
  [SUBTITLE_TYPES.UNKNOWN]: 'Unknown',
};

/**
 * Pesos padrão para ordenação (Signs Only e variantes no topo)
 */
const DEFAULT_PRIORITY_WEIGHTS = {
  [SUBTITLE_TYPES.SIGNS_ONLY]: 1000,
  [SUBTITLE_TYPES.SIGNS]: 900,
  [SUBTITLE_TYPES.FORCED_SIGNS]: 850,
  [SUBTITLE_TYPES.SIGNS_AND_SONGS]: 800,
  [SUBTITLE_TYPES.TEXT_ONLY]: 750,
  [SUBTITLE_TYPES.FORCED]: 600,
  [SUBTITLE_TYPES.FOREIGN_PARTS]: 550,
  [SUBTITLE_TYPES.FULL]: 400,
  [SUBTITLE_TYPES.UNKNOWN]: 200,
  [SUBTITLE_TYPES.DIALOGUE_ONLY]: 150,
  [SUBTITLE_TYPES.HI_SDH]: 100,
};

// Expressões regulares para detecção de áudio descritivo e acessibilidade (HI / SDH)
const SOUND_EFFECT_REGEX = /(?:\[\s*(?:m[uú]sica|music|som\b|barulho|passos|risos|laugh|choro|gasp|sigh|chuckle|applause|aplausos|grunhido|batida|porta|door|phone|telefone|explos[aã]o|sirene|alarme|gemido|sussurro|whisper|respira[cç][aã]o|tosse|cough|chorando|gritando|screams?|murmura|suspense|trilha sonora|som ambiente|ru[ií]do|[A-Z\s]{4,})\b.*?\]|\(\s*(?:m[uú]sica|music|som\b|barulho|passos|risos|laugh|choro|gasp|sigh|chuckle|applause|aplausos|grunhido|batida|porta|door|phone|telefone|explos[aã]o|sirene|alarme|gemido|sussurro|whisper|respira[cç][aã]o|tosse|cough|chorando|gritando|screams?|murmura|suspense|trilha sonora|som ambiente|ru[ií]do|[A-Z\s]{4,})\b.*?\)|[♪♫♩♬])/i;

// Marcadores e pronomes de diálogo em Português e Inglês
const DIALOGUE_MARKERS_REGEX = /\b(?:eu|voc[eê]|voc[eê]s|n[oó]s|ele|ela|eles|elas|meu|minha|meus|minhas|teu|tua|seu|sua|seus|suas|nosso|nossa|estou|est[aá]|estava|estavam|est[aã]o|vamos|quero|quer|querem|queria|acho|acha|acham|achei|sabe|sabem|sabia|olha|olhem|olhe|escuta|escute|escutem|espera|espere|obrigad[oa]|por favor|sim|n[aã]o|fui|vai|v[aã]o|vou|disse|disseram|falou|falaram|falei|pode|podem|posso|podia|ent[aã]o|tenho|tem|temos|tinha|tinham|faz|fazem|fazer|fiz|vejo|viu|viram|ver|comigo|contigo|conosco|i|you|he|she|we|they|me|my|your|our|their|i'm|i've|don't|can't|let's|look|listen|wait|please|thanks|yeah|yes|know|think|come on|tell|said)\b/i;

const DIALOGUE_DASH_REGEX = /^[-—–]\s+/m;

const SIGN_PREFIX_REGEX = /^\[?(?:placas?|letreiros?|textos?|cartaz|avisos?|t[ií]tulos?|livros?|mensag(?:em|ens)|telas?|signs?|texts?|screen)\b/i;

/**
 * Converte timestamp (HH:MM:SS,mmm ou MM:SS.mmm) para segundos
 */
function parseTimestampSec(ts) {
  if (!ts) return 0;
  const clean = ts.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(clean) || 0;
}

/**
 * Remove tags HTML e formatação ASS do texto da fala
 */
function cleanCueText(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]+\}/g, '')
    .trim();
}

/**
 * Faz o parse de arquivos SRT ou WebVTT
 */
function parseSrtOrVtt(contentStr) {
  const cues = [];
  const blocks = contentStr.trim().split(/\r?\n\s*\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    let arrowIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        arrowIndex = i;
        break;
      }
    }
    if (arrowIndex === -1) continue;
    const timeParts = lines[arrowIndex].split('-->');
    if (timeParts.length !== 2) continue;
    const startSec = parseTimestampSec(timeParts[0]);
    const endSec = parseTimestampSec(timeParts[1]);
    const rawText = lines.slice(arrowIndex + 1).join('\n');
    const cleaned = cleanCueText(rawText);
    if (!cleaned) continue;
    cues.push({ startSec, endSec, rawText, text: cleaned });
  }
  return cues;
}

/**
 * Faz o parse de arquivos ASS / SSA
 */
function parseAss(contentStr) {
  const cues = [];
  const lines = contentStr.split(/\r?\n/);
  let inEvents = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('[')) {
      inEvents = /^\[Events\]/i.test(trimmed);
      continue;
    }
    if (!inEvents) continue;

    if (/^Dialogue:\s*/i.test(trimmed)) {
      const rest = trimmed.replace(/^Dialogue:\s*/i, '');
      const parts = rest.split(',');
      if (parts.length >= 9) {
        const startSec = parseTimestampSec(parts[1]);
        const endSec = parseTimestampSec(parts[2]);
        const style = (parts[3] || '').trim().toLowerCase();
        const rawText = parts.slice(9).join(',');
        const cleaned = cleanCueText(rawText);
        if (!cleaned) continue;
        cues.push({ startSec, endSec, rawText, text: cleaned, style });
      }
    }
  }
  return cues;
}

/**
 * Faz o parse de qualquer conteúdo de legenda (SRT, VTT, ASS, Buffer ou String)
 */
function parseSubtitleContent(raw) {
  if (!raw) return null;
  const str = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  if (!str.trim()) return null;
  if (/\[Events\]/i.test(str) && /Format:\s*Layer/i.test(str)) {
    return parseAss(str);
  }
  return parseSrtOrVtt(str);
}

/**
 * 1ª Etapa: Classificação por Metadados, Título e Nome do Arquivo / Release
 */
function classifyByMetadata(input) {
  const rawText = [
    input.fileName,
    input.filename,
    input.title,
    input.release,
    input.name,
    input.tags,
    input.comments,
  ].filter(Boolean).join(' ');

  // Normaliza pontuações de separação comuns de release (. _ -) mantendo & e +
  const text = rawText.replace(/[\._\-]/g, ' ');

  // 1. Signs & Songs (Muito comum em animes)
  if (
    /\b(?:signs?\s*(?:&|\+|and|e)\s*songs?|songs?\s*(?:&|\+|and|e)\s*signs?|s&s)\b/i.test(text) ||
    /(?:\[|\()(?:\s*signs?\s*(?:&|\+|and|e)\s*songs?\s*|s&s)(?:\]|\))/i.test(text)
  ) {
    return {
      type: SUBTITLE_TYPES.SIGNS_AND_SONGS,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.SIGNS_AND_SONGS],
      confidence: 0.95,
      reason: 'Metadata/Nome indica Signs & Songs',
      source: 'metadata',
    };
  }

  // 2. Signs Only
  if (
    /\b(?:signs?\s*only|only\s*signs?|somente\s*placas?|apenas\s*placas?|apenas\s*textos?|textos?\s*na\s*tela)\b/i.test(text) ||
    /(?:\[|\()(?:\s*signs?\s*only|only\s*signs?|apenas\s*placas?|somente\s*placas?)(?:\]|\))/i.test(text)
  ) {
    return {
      type: SUBTITLE_TYPES.SIGNS_ONLY,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.SIGNS_ONLY],
      confidence: 0.96,
      reason: 'Metadata/Nome indica expressamente Signs Only',
      source: 'metadata',
    };
  }

  // 3. Forced Signs
  if (/\b(?:forced\s*signs?|signs?\s*forced|placas?\s*for[cç]adas?)\b/i.test(text)) {
    return {
      type: SUBTITLE_TYPES.FORCED_SIGNS,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.FORCED_SIGNS],
      confidence: 0.92,
      reason: 'Metadata/Nome indica Forced Signs',
      source: 'metadata',
    };
  }

  // 4. Text Only
  if (/\b(?:text\s*only|only\s*text|somente\s*texto|apenas\s*texto)\b/i.test(text)) {
    return {
      type: SUBTITLE_TYPES.TEXT_ONLY,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.TEXT_ONLY],
      confidence: 0.90,
      reason: 'Metadata/Nome indica Text Only',
      source: 'metadata',
    };
  }

  // 5. Foreign Parts
  if (
    input.foreign_parts_only === true ||
    input.foreignPartsOnly === true ||
    /\b(?:foreign\s*parts?(?:\s*only)?|foreign\s*languages?|partes\s*estrangeiras?)\b/i.test(text)
  ) {
    return {
      type: SUBTITLE_TYPES.FOREIGN_PARTS,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.FOREIGN_PARTS],
      confidence: 0.90,
      reason: 'Metadata/Nome indica Foreign Parts Only',
      source: 'metadata',
    };
  }

  // 6. Signs (Geral)
  if (
    /(?:\[|\(|\.|\b|_)(?:signs?|placas?)(?:\]|\)|\.|\b|_)/i.test(text) &&
    !/\b(?:designs?|assigns?|resigns?|signals?|signatures?)\b/i.test(text)
  ) {
    return {
      type: SUBTITLE_TYPES.SIGNS,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.SIGNS],
      confidence: 0.88,
      reason: 'Metadata/Nome contém identificador Signs',
      source: 'metadata',
    };
  }

  // 7. Forced
  if (/\b(?:forced|for[cç]ad[ao]s?)\b/i.test(text)) {
    return {
      type: SUBTITLE_TYPES.FORCED,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.FORCED],
      confidence: 0.85,
      reason: 'Metadata/Nome indica Forced',
      source: 'metadata',
    };
  }

  // 8. Dialogue Only
  if (/\b(?:dialogue\s*only|dialogues?\s*only|somente\s*di[aá]logos?|apenas\s*di[aá]logos?)\b/i.test(text)) {
    return {
      type: SUBTITLE_TYPES.DIALOGUE_ONLY,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.DIALOGUE_ONLY],
      confidence: 0.88,
      reason: 'Metadata/Nome indica Dialogue Only',
      source: 'metadata',
    };
  }

  // 9. HI / SDH
  if (
    input.hi === true ||
    input.hearing_impaired === true ||
    input.hearingImpaired === true ||
    /\b(?:hi|sdh|cc|hearing[ _-]impaired|surdos?|deficientes?[ _-]auditivos?)\b/i.test(text)
  ) {
    return {
      type: SUBTITLE_TYPES.HI_SDH,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.HI_SDH],
      confidence: 0.90,
      reason: 'Metadata/Nome indica acessibilidade para deficientes auditivos (HI/SDH)',
      source: 'metadata',
    };
  }

  // 10. Full / Normal
  if (/\b(?:full(?:\s*sub)?|completa|completo)\b/i.test(text)) {
    return {
      type: SUBTITLE_TYPES.FULL,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.FULL],
      confidence: 0.80,
      reason: 'Metadata/Nome indica Full / Completa',
      source: 'metadata',
    };
  }

  return null;
}

/**
 * 2ª Etapa: Classificação profunda por análise do conteúdo das falas (cues)
 */
function classifyByContent(cues, options = {}) {
  if (!Array.isArray(cues) || cues.length === 0) {
    return {
      type: SUBTITLE_TYPES.UNKNOWN,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.UNKNOWN],
      confidence: 0,
      reason: 'Conteúdo vazio ou sem blocos de tempo legíveis',
      source: 'content',
    };
  }

  const totalCues = cues.length;
  let dialogueCount = 0;
  let soundEffectCount = 0;
  let signCount = 0;
  let totalChars = 0;
  let totalWords = 0;

  for (const cue of cues) {
    const text = cue.text;
    totalChars += text.length;
    const words = text.split(/\s+/).filter(Boolean);
    totalWords += words.length;

    // 1. Estilo ASS explícito
    if (cue.style && /sign|title|osd|text/i.test(cue.style)) {
      signCount++;
      continue;
    }

    // 2. Descrição de som / Efeito sonoro / Acessibilidade (HI/SDH)
    if (SOUND_EFFECT_REGEX.test(text)) {
      soundEffectCount++;
      if (/^\[.*?\]$/s.test(text) || /^\(.*?\)$/s.test(text) || /^[♪♫♩♬]/.test(text)) {
        continue;
      }
    }

    // 3. Indicador de diálogo falado
    const isDashDialogue = DIALOGUE_DASH_REGEX.test(cue.rawText || text);
    const hasDialogueMarkers = DIALOGUE_MARKERS_REGEX.test(text);
    const hasConversationalPunct = /[?!]/.test(text) || /\.\.\./.test(text);

    if (isDashDialogue || (hasDialogueMarkers && (hasConversationalPunct || words.length >= 4))) {
      dialogueCount++;
      continue;
    }

    // 4. Indicador de placa / texto de tela
    const hasSignPrefix = SIGN_PREFIX_REGEX.test(text);
    const isShortNonDialogue = words.length <= 6 && text.length <= 45 && !hasDialogueMarkers && !isDashDialogue;

    if (hasSignPrefix || isShortNonDialogue) {
      signCount++;
    } else if (hasDialogueMarkers || words.length > 6) {
      dialogueCount++;
    }
  }

  const dialogueRatio = dialogueCount / totalCues;
  const soundRatio = soundEffectCount / totalCues;
  const signRatio = signCount / totalCues;
  const avgWordsPerCue = totalWords / totalCues;

  const firstStart = cues[0].startSec;
  const lastEnd = cues[cues.length - 1].endSec;
  const durationSec = (options.duration && options.duration > 0) ? options.duration : Math.max(60, lastEnd - firstStart);
  const durationMin = durationSec / 60;
  const cuesPerMinute = totalCues / durationMin;

  const details = {
    totalCues,
    dialogueCount,
    dialogueRatio: Math.round(dialogueRatio * 100) / 100,
    soundEffectCount,
    soundRatio: Math.round(soundRatio * 100) / 100,
    signCount,
    signRatio: Math.round(signRatio * 100) / 100,
    cuesPerMinute: Math.round(cuesPerMinute * 10) / 10,
    avgWordsPerCue: Math.round(avgWordsPerCue * 10) / 10,
  };

  // Regra A: HI / SDH
  if (soundRatio >= 0.15 || soundEffectCount >= 8 || (soundEffectCount >= 1 && totalCues <= 15 && soundRatio >= 0.2)) {
    const conf = Math.min(0.98, Math.max(0.70, 0.6 + soundRatio));
    return {
      type: SUBTITLE_TYPES.HI_SDH,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.HI_SDH],
      confidence: Math.round(conf * 100) / 100,
      reason: `Contém descrições frequentes de efeitos sonoros / acessibilidade (${soundEffectCount} ocorrências, ${(soundRatio * 100).toFixed(0)}% das falas)`,
      source: 'content',
      details,
    };
  }

  // Regra B: Signs Only
  // Poucas linhas OU densidade de falas baixa (< 2.5 falas/min), quase nenhum diálogo e predomínio de placas/textos
  if (
    (totalCues <= 60 || cuesPerMinute <= 2.5) &&
    dialogueRatio <= 0.12 &&
    soundRatio <= 0.08 &&
    signRatio >= 0.50
  ) {
    const conf = Math.min(0.96, Math.max(0.75, 0.7 + signRatio * 0.2 + (totalCues <= 30 ? 0.08 : 0)));
    return {
      type: SUBTITLE_TYPES.SIGNS_ONLY,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.SIGNS_ONLY],
      confidence: Math.round(conf * 100) / 100,
      reason: `Poucas linhas (${totalCues} falas), baixíssima densidade de diálogo (${(dialogueRatio * 100).toFixed(0)}%) e predominância de placas e letreiros (${(signRatio * 100).toFixed(0)}%)`,
      source: 'content',
      details,
    };
  }

  // Regra C: Full / Normal
  // Muitas falas (> 100) OU alta proporção de diálogos (>= 35%) OU alta densidade
  if (totalCues >= 100 || dialogueRatio >= 0.35 || cuesPerMinute >= 5.0) {
    const conf = Math.min(0.98, Math.max(0.75, 0.6 + dialogueRatio * 0.35));
    return {
      type: SUBTITLE_TYPES.FULL,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.FULL],
      confidence: Math.round(conf * 100) / 100,
      reason: `Grande quantidade de diálogos (${dialogueCount} falas, ${(dialogueRatio * 100).toFixed(0)}% do conteúdo)`,
      source: 'content',
      details,
    };
  }

  // Regra D: Forced (trechos pontuais de falas, típico de traduções de trechos específicos)
  if (totalCues <= 60 && dialogueCount >= 3 && dialogueRatio > 0.20 && dialogueRatio < 0.60) {
    return {
      type: SUBTITLE_TYPES.FORCED,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.FORCED],
      confidence: 0.72,
      reason: `Poucas falas no total (${totalCues}) com trechos seletivos de diálogo, típico de partes forçadas`,
      source: 'content',
      details,
    };
  }

  // Regra E: Ambiguidade -> Prefere 'unknown' em vez de forçar signs_only
  return {
    type: SUBTITLE_TYPES.UNKNOWN,
    category: CATEGORY_LABELS[SUBTITLE_TYPES.UNKNOWN],
    confidence: 0.40,
    reason: 'Padrão de falas ambíguo para determinação conclusiva',
    source: 'content',
    details,
  };
}

/**
 * Classifica uma legenda a partir de seus dados ou conteúdo
 *
 * @param {Object|string} input Dados da legenda (release, title, fileName, tags, content, etc.)
 * @param {Object} [options] Opções adicionais (ex: duration)
 * @returns {{ type: string, category: string, confidence: number, reason: string, details?: Object }}
 */
function classifySubtitle(input, options = {}) {
  if (!input) {
    return {
      type: SUBTITLE_TYPES.UNKNOWN,
      category: CATEGORY_LABELS[SUBTITLE_TYPES.UNKNOWN],
      confidence: 0,
      reason: 'Entrada vazia',
    };
  }

  const subObj = typeof input === 'string' ? { title: input, fileName: input } : input;

  // 1. Tenta identificar por metadados / nome
  const metaResult = classifyByMetadata(subObj);

  // 2. Se o conteúdo estiver presente, analisa o conteúdo para confirmar ou descobrir
  const content = subObj.content;
  if (content) {
    const cues = parseSubtitleContent(content);
    if (cues && cues.length > 0) {
      const contentResult = classifyByContent(cues, { duration: subObj.duration || options.duration });

      // Se o metadata já detectou algo conclusivo:
      if (metaResult && metaResult.confidence >= 0.85) {
        // Se o nome dizia signs_only mas o arquivo tem centenas de diálogos completos (falso positivo no nome):
        if (
          (metaResult.type === SUBTITLE_TYPES.SIGNS_ONLY || metaResult.type === SUBTITLE_TYPES.SIGNS) &&
          contentResult.type === SUBTITLE_TYPES.FULL
        ) {
          return {
            ...contentResult,
            reason: `Nome sugeria sinais, mas o conteúdo possui ${contentResult.details.dialogueCount} diálogos completos (Full)`,
          };
        }
        return {
          ...metaResult,
          details: contentResult.details,
        };
      }

      return contentResult;
    }
  }

  // Se não havia conteúdo legível mas os metadados identificaram:
  if (metaResult) {
    return metaResult;
  }

  // Fallback seguro se não há dados suficientes
  return {
    type: SUBTITLE_TYPES.UNKNOWN,
    category: CATEGORY_LABELS[SUBTITLE_TYPES.UNKNOWN],
    confidence: 0,
    reason: 'Informações insuficientes no nome ou metadados',
  };
}

/**
 * Ordena uma lista de resultados de legendas colocando o tipo preferencial (ex: Signs Only) no topo.
 *
 * @param {Array<Object>} subtitles Lista de legendas encontradas pela busca
 * @param {Object} [options] Opções de ordenação
 * @param {string} [options.preferredType='signs_only'] Tipo para priorizar no topo
 * @param {Object} [options.weights] Pesos customizados para tipos de legendas
 * @returns {Array<Object>} Lista reordenada com `.classification` anexado a cada item
 */
function prioritizeSubtitles(subtitles, options = {}) {
  if (!Array.isArray(subtitles)) return [];

  const preferredType = options.preferredType || SUBTITLE_TYPES.SIGNS_ONLY;
  const customWeights = options.weights || {};
  const weights = { ...DEFAULT_PRIORITY_WEIGHTS, ...customWeights };

  // Dá peso máximo ao tipo preferencial configurado
  if (preferredType && weights[preferredType] !== undefined) {
    weights[preferredType] = 1200;
  }

  // Classifica cada item se ainda não estiver classificado
  const classifiedItems = subtitles.map((item) => {
    const classification = item.classification || classifySubtitle(item, options);
    return {
      ...item,
      classification,
    };
  });

  // Ordenação hierárquica: Peso do Tipo > Quantidade de Downloads > Confiança > Rating
  return classifiedItems.sort((a, b) => {
    const weightA = weights[a.classification.type] || 0;
    const weightB = weights[b.classification.type] || 0;

    if (weightA !== weightB) {
      return weightB - weightA;
    }

    const dlA = a.downloads || a.download_count || 0;
    const dlB = b.downloads || b.download_count || 0;
    if (dlA !== dlB) {
      return dlB - dlA;
    }

    const confA = a.classification.confidence || 0;
    const confB = b.classification.confidence || 0;
    if (confA !== confB) {
      return confB - confA;
    }

    const ratA = a.rating || a.ratings || 0;
    const ratB = b.rating || b.ratings || 0;
    return ratB - ratA;
  });
}

/**
 * Classe utilitária para instanciação com configurações personalizadas
 */
class SubtitleClassifier {
  constructor(options = {}) {
    this.preferredType = options.preferredType || SUBTITLE_TYPES.SIGNS_ONLY;
    this.weights = { ...DEFAULT_PRIORITY_WEIGHTS, ...(options.weights || {}) };
  }

  classify(input, opts = {}) {
    return classifySubtitle(input, { ...opts, duration: opts.duration || this.duration });
  }

  prioritize(subtitles, opts = {}) {
    return prioritizeSubtitles(subtitles, {
      preferredType: this.preferredType,
      weights: this.weights,
      ...opts,
    });
  }
}

module.exports = {
  SUBTITLE_TYPES,
  CATEGORY_LABELS,
  DEFAULT_PRIORITY_WEIGHTS,
  classifySubtitle,
  prioritizeSubtitles,
  parseSubtitleContent,
  SubtitleClassifier,
};

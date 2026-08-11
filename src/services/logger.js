// Logger estruturado simples: `[HH:MM:SS] [CATEGORIA] mensagem`, uma funcao
// por categoria. Alem de imprimir no console (igual sempre fez), guarda uma
// copia das ultimas linhas em memoria pra alimentar o visualizador de Logs
// em Configuracoes — nao escreve em disco, entao nao ha custo de I/O nem
// persistencia entre reinicios (ver src/services/logger.js).
const util = require('util');

const CATEGORIES = ['PLAYER', 'LIVE', 'MPV', 'IPC', 'NETWORK', 'DVR', 'RECOVERY', 'ERROR', 'SYSTEM'];
const MAX_BUFFER_LINES = 500;

const buffer = [];

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatArgs(args) {
  return args.map((a) => (typeof a === 'string' ? a : util.inspect(a, { depth: 2 }))).join(' ');
}

function pushToBuffer(line) {
  buffer.push(line);
  if (buffer.length > MAX_BUFFER_LINES) buffer.shift();
}

function makeLogFn(category) {
  const out = category === 'ERROR' ? console.error : console.log;
  return (...args) => {
    const prefix = `[${timestamp()}] [${category}]`;
    out(prefix, ...args);
    pushToBuffer(`${prefix} ${formatArgs(args)}`);
  };
}

const logger = {
  getBuffer: () => [...buffer],
};
for (const category of CATEGORIES) {
  logger[category.toLowerCase()] = makeLogFn(category);
}

module.exports = logger;

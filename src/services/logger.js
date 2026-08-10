// Logger estruturado simples: `[HH:MM:SS] [CATEGORIA] mensagem`, uma funcao
// por categoria. Substitui os console.log soltos e sem padrao — nao guarda
// nada em arquivo (o app hoje nao tem esse requisito), so organiza o que ja
// ia pro terminal.
const CATEGORIES = ['PLAYER', 'LIVE', 'MPV', 'IPC', 'NETWORK', 'DVR', 'RECOVERY', 'ERROR', 'SYSTEM'];

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function makeLogFn(category) {
  const out = category === 'ERROR' ? console.error : console.log;
  return (...args) => out(`[${timestamp()}] [${category}]`, ...args);
}

const logger = {};
for (const category of CATEGORIES) {
  logger[category.toLowerCase()] = makeLogFn(category);
}

module.exports = logger;

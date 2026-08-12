// Grava src/build-info.json com a versao do package.json + o commit git que
// gerou o build — usado pelo app (tela Configuracoes > Geral) pra mostrar
// exatamente qual commit esta rodando, e nao so o numero de versao (que
// depende de bump manual e pode ficar dessincronizado de qual codigo foi
// realmente publicado numa tag). Roda antes de "start" e "dist" (ver
// package.json > scripts.prestart/predist).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const packageJson = require('../package.json');

function resolveCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // Sem .git disponivel (ex.: ambiente de build sem historico completo) —
    // GITHUB_SHA e a variavel padrao que o Actions injeta no ambiente com o
    // commit exato que disparou o workflow.
    return process.env.GITHUB_SHA || null;
  }
}

const commit = resolveCommit();

const buildInfo = {
  version: packageJson.version,
  commit: commit || 'unknown',
  commitShort: commit ? commit.slice(0, 7) : 'unknown',
  buildDate: new Date().toISOString(),
};

fs.writeFileSync(
  path.join(__dirname, '../src/build-info.json'),
  JSON.stringify(buildInfo, null, 2) + '\n'
);

console.log(`[write-build-info] versao ${buildInfo.version} commit ${buildInfo.commitShort}`);

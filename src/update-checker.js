// Checagem de atualizacao via GitHub Releases. Repositorio real e publico
// (releases publicados automaticamente por .github/workflows/release.yml a
// cada tag v*.*.* enviada) — enquanto nenhum release existir ainda, a API
// do GitHub responde 404 e checkForUpdate() propaga isso como erro comum
// (capturado por quem chama, ver main.js), nao como crash.
const https = require('https');

const GITHUB_REPO = 'ryan1235/player';

function fetchLatestRelease(repo) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      `https://api.github.com/repos/${repo}/releases/latest`,
      {
        headers: {
          'User-Agent': 'AuraPlayer-UpdateChecker',
          Accept: 'application/vnd.github+json',
        },
        timeout: 8000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          // 404 quase sempre significa "nenhum release publicado ainda" (repo
          // real mas .github/workflows/release.yml nunca rodou ou nenhuma tag
          // foi enviada) — mensagem mais clara que um "GitHub respondeu 404"
          // cru, que nao diz nada pro usuario final.
          const message = res.statusCode === 404
            ? 'Nenhuma versão publicada ainda neste repositório.'
            : `GitHub respondeu ${res.statusCode}`;
          reject(new Error(message));
          return;
        }
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao consultar o GitHub')));
    req.on('error', reject);
  });
}

// Comparacao simples de versoes "x.y.z" (suficiente pro semver basico que o
// package.json usa) — sem depender de uma lib externa so pra isso.
function isNewerVersion(latest, current) {
  const a = latest.replace(/^v/i, '').split('.').map(Number);
  const b = current.replace(/^v/i, '').split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

async function checkForUpdate(currentVersion) {
  if (!GITHUB_REPO) {
    return { configured: false };
  }
  const release = await fetchLatestRelease(GITHUB_REPO);
  const latestVersion = String(release.tag_name || '').replace(/^v/i, '');
  return {
    configured: true,
    currentVersion,
    latestVersion,
    updateAvailable: latestVersion ? isNewerVersion(latestVersion, currentVersion) : false,
    url: release.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
  };
}

module.exports = { checkForUpdate };

// Checagem de atualizacao via GitHub Releases. So funciona depois que
// GITHUB_REPO for preenchido (formato "usuario/nome") com o repositorio onde
// os builds do Aura Player passarem a ser publicados — enquanto estiver
// vazio, checkForUpdate() responde de forma honesta que a checagem nao esta
// configurada, em vez de fingir que verificou algo.
const https = require('https');

const GITHUB_REPO = ''; // ex.: 'seu-usuario/aura-player'

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
          reject(new Error(`GitHub respondeu ${res.statusCode}`));
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

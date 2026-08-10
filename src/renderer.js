const tabs = document.querySelectorAll('.tab');
const contents = document.querySelectorAll('.tab-content');

function activateTab(name) {
  tabs.forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  contents.forEach((c) => c.classList.toggle('active', c.id === `tab-${name}`));
  sendVideoRect();
}

tabs.forEach((btn) => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

// --- Area de video embutida (janela nativa sobreposta, controlada pelo main process) ---
const videoHost = document.getElementById('video-host');

function sendVideoRect() {
  const playerTabActive = document.getElementById('tab-player').classList.contains('active');
  if (!playerTabActive) {
    window.api.setVideoRect({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }
  const rect = videoHost.getBoundingClientRect();
  window.api.setVideoRect({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
}

new ResizeObserver(sendVideoRect).observe(videoHost);
window.addEventListener('resize', sendVideoRect);

// O titulo do arquivo em si e mostrado pelo overlay de controles (overlay-renderer.js);
// aqui so precisamos trocar de aba quando um novo arquivo comeca a tocar.
window.api.onNowPlaying(() => {
  activateTab('player');
});

const statusEl = document.getElementById('status');
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#e05252' : '';
}

document.getElementById('btn-pick').addEventListener('click', async () => {
  const file = await window.api.pickFile();
  if (!file) return;
  setStatus('Carregando ' + file + '...');
  try {
    await window.api.load(file);
    setStatus('Reproduzindo: ' + file);
  } catch (err) {
    setStatus('Erro: ' + err.message, true);
  }
});

// --- Tela cheia (o botao e os demais controles moraram pro overlay, ver overlay-renderer.js) ---
window.api.onFullscreenChanged((isFullscreen) => {
  document.body.classList.toggle('fullscreen-mode', isFullscreen);
  sendVideoRect();
  // a troca de layout (esconder header) pode levar um instante pra refletir no getBoundingClientRect
  setTimeout(sendVideoRect, 100);
  setTimeout(sendVideoRect, 350);
});

// --- Atalhos de teclado do player (chamam as mesmas APIs que os botoes do overlay) ---
function isTypingTarget(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('fullscreen-mode')) {
    window.api.toggleFullscreen().catch(() => {});
    return;
  }

  const playerTabActive = document.getElementById('tab-player').classList.contains('active');
  if (!playerTabActive || isTypingTarget(document.activeElement)) return;

  switch (e.key) {
    case ' ':
    case 'Spacebar':
      e.preventDefault();
      window.api.togglePlayPause().catch(() => {});
      break;
    case 'ArrowLeft':
      window.api.seek(-10).catch(() => {});
      break;
    case 'ArrowRight':
      window.api.seek(10).catch(() => {});
      break;
    case 'm':
    case 'M':
      window.api.toggleMute().catch(() => {});
      break;
    case 'f':
    case 'F':
      window.api.toggleFullscreen().catch(() => {});
      break;
    default:
      break;
  }
});

// --- DLNA ---
let currentServer = null;
let pathStack = [{ id: '0', title: 'Raiz' }];

const dlnaList = document.getElementById('dlna-list');
const breadcrumb = document.getElementById('dlna-breadcrumb');

const ICONS = {
  server: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><rect x="3" y="4" width="18" height="6" rx="1.5" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="14" width="18" height="6" rx="1.5" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="7" r="1" fill="currentColor"/><circle cx="7" cy="17" r="1" fill="currentColor"/></svg>',
  folder: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M4 6.5A1.5 1.5 0 0 1 5.5 5H10l2 2.5h6.5A1.5 1.5 0 0 1 20 9v8.5A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-11Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  file: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M6 4h8l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 10.5 14.5 13 10 15.5v-5Z" fill="currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M14 6 8 12l6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function makeRow(type, iconKey, title, onClick) {
  const li = document.createElement('li');
  li.className = type;
  const icon = document.createElement('span');
  icon.className = 'row-icon';
  icon.innerHTML = ICONS[iconKey];
  const label = document.createElement('span');
  label.className = 'row-title';
  label.textContent = title;
  li.appendChild(icon);
  li.appendChild(label);
  if (onClick) li.addEventListener('click', onClick);
  return li;
}

document.getElementById('btn-discover').addEventListener('click', async () => {
  setStatus('Procurando servidores DLNA na rede...');
  dlnaList.innerHTML = '';
  breadcrumb.textContent = '';
  currentServer = null;
  try {
    const servers = await window.api.discoverDlna();
    if (!servers.length) {
      setStatus('Nenhum servidor DLNA encontrado.');
      dlnaList.appendChild(makeRow('empty', 'server', 'Nenhum servidor encontrado'));
      return;
    }
    setStatus(`${servers.length} servidor(es) encontrado(s).`);
    dlnaList.innerHTML = '';
    servers.forEach((server) => {
      dlnaList.appendChild(makeRow('server', 'server', server.name, () => openServer(server)));
    });
  } catch (err) {
    setStatus('Erro ao procurar: ' + err.message, true);
  }
});

async function openServer(server) {
  currentServer = server;
  pathStack = [{ id: '0', title: server.name }];
  await renderFolder();
}

async function renderFolder() {
  const current = pathStack[pathStack.length - 1];
  breadcrumb.textContent = pathStack.map((p) => p.title).join(' / ');
  dlnaList.innerHTML = '';
  dlnaList.appendChild(makeRow('loading', 'folder', 'Carregando...'));
  try {
    const items = await window.api.browseDlna(currentServer, current.id);
    dlnaList.innerHTML = '';

    if (pathStack.length > 1) {
      dlnaList.appendChild(
        makeRow('folder', 'back', 'Voltar', () => {
          pathStack.pop();
          renderFolder();
        })
      );
    }

    if (!items.length) {
      dlnaList.appendChild(makeRow('empty', 'folder', 'Pasta vazia'));
    }

    items.forEach((item) => {
      dlnaList.appendChild(
        makeRow(item.type, item.type === 'folder' ? 'folder' : 'file', item.title, async () => {
          if (item.type === 'folder') {
            pathStack.push({ id: item.id, title: item.title });
            renderFolder();
          } else {
            setStatus('Carregando: ' + item.title);
            try {
              await window.api.load(item.url);
              setStatus('Reproduzindo: ' + item.title);
            } catch (err) {
              setStatus('Erro: ' + err.message, true);
            }
          }
        })
      );
    });
  } catch (err) {
    setStatus('Erro ao navegar: ' + err.message, true);
  }
}

// --- Receber (cast target) ---
const castToggleBtn = document.getElementById('btn-cast-toggle');
const castStatusEl = document.getElementById('cast-status');
const autoStartChk = document.getElementById('chk-auto-start');
const interfaceSelect = document.getElementById('sel-interface');
const activityDot = document.getElementById('cast-activity-dot');
const activityText = document.getElementById('cast-activity-text');

const ACTIVITY_LABELS = {
  discovery: (remote) => `Um dispositivo (${remote}) está descobrindo o PC...`,
  SetAVTransportURI: () => 'Recebendo vídeo do celular...',
  Play: () => 'Comando de reproduzir recebido',
  Pause: () => 'Pausado pelo celular',
  Stop: () => 'Parado pelo celular',
  Seek: () => 'Celular pediu pra avançar/voltar no vídeo',
  SetVolume: () => 'Ajustando volume pelo celular',
  SetMute: () => 'Ajustando mudo pelo celular',
  GetTransportInfo: () => 'Conectado — celular monitorando reprodução',
  GetPositionInfo: () => 'Conectado — celular monitorando reprodução',
};

let activityClearTimer = null;
window.api.onCastActivity((info) => {
  const label = info.type === 'discovery' ? ACTIVITY_LABELS.discovery(info.remote) : (ACTIVITY_LABELS[info.action] || `Ação recebida: ${info.action}`)();
  activityText.textContent = label;
  activityDot.classList.add('live');
  clearTimeout(activityClearTimer);
  activityClearTimer = setTimeout(() => {
    activityDot.classList.remove('live');
    activityText.textContent = 'Aguardando conexão...';
  }, 4000);
});

function renderCastStatus(status) {
  if (status.active) {
    castToggleBtn.textContent = 'Desativar recepção';
    castStatusEl.textContent = `Ativo como "${status.friendlyName}" em ${status.ip}:${status.port} (${status.interfaceName || '?'}). Já deve aparecer nos apps de cast do celular na mesma rede.`;
  } else {
    castToggleBtn.textContent = 'Ativar recepção';
    castStatusEl.textContent = 'Desativado.';
  }
  if (status.interfaces) populateInterfaceSelect(status.interfaces);
}

function populateInterfaceSelect(interfaces) {
  const previousValue = interfaceSelect.value;
  interfaceSelect.innerHTML = '';
  const autoOpt = document.createElement('option');
  autoOpt.value = '';
  autoOpt.textContent = 'Automático (recomendado)';
  interfaceSelect.appendChild(autoOpt);
  interfaces.forEach((iface) => {
    const opt = document.createElement('option');
    opt.value = iface.name;
    opt.textContent = `${iface.name} — ${iface.address}${iface.virtual ? ' (VPN/virtual)' : ''}`;
    interfaceSelect.appendChild(opt);
  });
  interfaceSelect.value = previousValue || '';
}

castToggleBtn.addEventListener('click', async () => {
  castToggleBtn.disabled = true;
  try {
    const status = await window.api.rendererStatus();
    const next = status.active ? await window.api.stopRenderer() : await window.api.startRenderer();
    renderCastStatus(next);
  } catch (err) {
    setStatus('Erro: ' + err.message, true);
  } finally {
    castToggleBtn.disabled = false;
  }
});

autoStartChk.addEventListener('change', () => {
  window.api.setAutoStart(autoStartChk.checked).catch((err) => setStatus('Erro: ' + err.message, true));
});

interfaceSelect.addEventListener('change', async () => {
  interfaceSelect.disabled = true;
  try {
    const status = await window.api.setInterface(interfaceSelect.value || null);
    renderCastStatus(status);
  } catch (err) {
    setStatus('Erro: ' + err.message, true);
  } finally {
    interfaceSelect.disabled = false;
  }
});

Promise.all([window.api.getSettings(), window.api.rendererStatus()])
  .then(([s, status]) => {
    autoStartChk.checked = !!s.autoStartRenderer;
    renderCastStatus(status);
    interfaceSelect.value = s.preferredInterface || '';
  })
  .catch(() => {});

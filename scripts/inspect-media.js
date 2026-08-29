const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');

const target = process.argv[2];

if (!target) {
  console.log('Uso: node scripts/inspect-media.js "<URL ou caminho do arquivo>"');
  console.log('Ou abra um vídeo no player e veja os metadados diretamente no terminal do npm start!');
  process.exit(0);
}

const MPV_BIN = path.resolve(__dirname, '../bin/mpv.exe');
const pipeName = `\\\\.\\pipe\\mpv-inspect-${Date.now()}`;

console.log(`\n🔍 Analisando metadados de: ${target}\n`);

const mpv = spawn(MPV_BIN, [
  `--input-ipc-server=${pipeName}`,
  '--idle=yes',
  '--no-video',
  '--no-audio',
  '--no-terminal',
  '--msg-level=all=no',
  '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  target,
], { stdio: 'ignore' });

let requestId = 1;
const callbacks = new Map();

function sendCommand(sock, cmd) {
  return new Promise((resolve) => {
    const id = ++requestId;
    callbacks.set(id, resolve);
    sock.write(JSON.stringify({ command: cmd, request_id: id }) + '\n');
  });
}

setTimeout(() => {
  const sock = net.connect(pipeName, async () => {
    let buf = '';
    sock.on('data', (data) => {
      buf += data.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const res = JSON.parse(line);
          if (res.request_id && callbacks.has(res.request_id)) {
            const cb = callbacks.get(res.request_id);
            callbacks.delete(res.request_id);
            cb(res.data);
          }
        } catch {}
      }
    });

    // Espera 2.5s para demuxer ler cabeçalhos
    await new Promise((r) => setTimeout(r, 2500));

    const mediaTitle = await sendCommand(sock, ['get_property', 'media-title']);
    const fileFormat = await sendCommand(sock, ['get_property', 'file-format']);
    const duration = await sendCommand(sock, ['get_property', 'duration']);
    const chapters = await sendCommand(sock, ['get_property', 'chapter-list']);
    const metadata = await sendCommand(sock, ['get_property', 'metadata']);
    const filteredMeta = await sendCommand(sock, ['get_property', 'filtered-metadata']);
    const trackList = await sendCommand(sock, ['get_property', 'track-list']);

    console.log('====================================================');
    console.log(`🎬 Título da Mídia: "${mediaTitle || 'Nenhum'}"`);
    console.log(`📦 Formato / Contêiner: ${fileFormat || 'Desconhecido'}`);
    console.log(`⏱️ Duração: ${duration ? duration.toFixed(1) + 's (' + (duration / 60).toFixed(1) + ' min)' : 'Indefinida / Ao vivo'}`);
    console.log('----------------------------------------------------');

    console.log(`\n📑 Capítulos (${(chapters && chapters.length) || 0} encontrados):`);
    if (chapters && chapters.length > 0) {
      chapters.forEach((c, i) => {
        const m = Math.floor((c.time || 0) / 60);
        const s = Math.floor((c.time || 0) % 60);
        console.log(`   #${i + 1} [${m}:${String(s).padStart(2, '0')}] - "${c.title || 'Sem título'}"`);
      });
    } else {
      console.log('   (Nenhum capítulo embutido no contêiner deste arquivo)');
    }

    console.log(`\n🏷️ Tags de Metadados do Arquivo:`);
    const allMeta = { ...(filteredMeta || {}), ...(metadata || {}) };
    const metaKeys = Object.keys(allMeta);
    if (metaKeys.length > 0) {
      for (const k of metaKeys) {
        console.log(`   [${k}]: ${allMeta[k]}`);
      }
    } else {
      console.log('   (Nenhuma tag de metadados presente)');
    }

    console.log(`\n🎵 Trilhas (${(trackList && trackList.length) || 0} encontradas):`);
    if (trackList && trackList.length > 0) {
      for (const t of trackList) {
        console.log(`   #${t.id} [${t.type}] codec=${t.codec || '?'} lang=${t.lang || '?'} title="${t.title || ''}"`);
      }
    }
    console.log('====================================================\n');

    sock.destroy();
    mpv.kill();
    process.exit(0);
  });

  sock.on('error', (err) => {
    console.error('Erro ao conectar ao MPV:', err.message);
    mpv.kill();
    process.exit(1);
  });
}, 1000);

import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';

export default function App() {
  const [activeTab, setActiveTab] = useState('stream'); // 'stream' | 'remote' | 'connect'

  // Configuração da conexão com o PC
  const [serverHost, setServerHost] = useState('192.168.1.100');
  const [serverPort, setServerPort] = useState('3888');
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');

  // Status do Player no PC
  const [playerStatus, setPlayerStatus] = useState(null);

  // Formulário de envio de stream
  const [streamUrl, setStreamUrl] = useState('');
  const [mediaTitle, setMediaTitle] = useState('');
  const [recentStreams, setRecentStreams] = useState([]);
  const [isSending, setIsSending] = useState(false);

  // --- Aura Sync: metadados de série para o SkipDB ---
  const [syncTitle, setSyncTitle] = useState('');
  const [syncSeason, setSyncSeason] = useState('');
  const [syncEpisode, setSyncEpisode] = useState('');
  const [syncStatus, setSyncStatus] = useState(null); // { ok, msg, time }
  const [isSyncing, setIsSyncing] = useState(false);

  const pollIntervalRef = useRef(null);

  const baseUrl = `http://${serverHost.trim()}:${serverPort.trim()}`;

  // Verifica conexão e obtém status do player
  const checkStatus = async (silent = false) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`${baseUrl}/api/status`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        setPlayerStatus(data);
        setIsConnected(true);
        return true;
      }
    } catch {
      if (!silent) {
        setIsConnected(false);
      }
    }
    return false;
  };

  // Monitoramento contínuo de status quando conectado
  useEffect(() => {
    checkStatus(true);
    pollIntervalRef.current = setInterval(() => {
      checkStatus(true);
    }, 2000);
    return () => clearInterval(pollIntervalRef.current);
  }, [serverHost, serverPort]);

  // Escuta intents / links de compartilhamento do Android (YouCine, navegador, etc.)
  useEffect(() => {
    const handleUrl = (url) => {
      if (!url) return;
      try {
        const parsed = Linking.parse(url);
        const rawText = parsed.queryParams?.title || parsed.queryParams?.text || '';
        const queryUrl = parsed.queryParams?.url || parsed.queryParams?.text || url;
        if (queryUrl && typeof queryUrl === 'string') {
          const match = queryUrl.match(/https?:\/\/[^\s]+/i);
          if (match) {
            setStreamUrl(match[0]);
            setActiveTab('stream');

            // Tenta pré-preencher campos do Sync a partir do título compartilhado
            if (rawText && typeof rawText === 'string') {
              const titleText = rawText.trim();
              // Padrão: "Série Nome S02E05" ou "Série Nome 2x05" ou "Série Nome - Episódio 5"
              const epMatch = titleText.match(/[Ss](\d{1,2})[Ee](\d{1,3})/);
              const ep2Match = titleText.match(/(\d{1,2})x(\d{1,3})/i);
              if (epMatch) {
                const seriesName = titleText.replace(epMatch[0], '').replace(/[-–—_\s]+$/, '').trim();
                if (seriesName) setSyncTitle(seriesName);
                setSyncSeason(String(parseInt(epMatch[1], 10)));
                setSyncEpisode(String(parseInt(epMatch[2], 10)));
              } else if (ep2Match) {
                const seriesName = titleText.replace(ep2Match[0], '').replace(/[-–—_\s]+$/, '').trim();
                if (seriesName) setSyncTitle(seriesName);
                setSyncSeason(String(parseInt(ep2Match[1], 10)));
                setSyncEpisode(String(parseInt(ep2Match[2], 10)));
              } else if (titleText.length > 1) {
                setSyncTitle(titleText);
              }
            }
          }
        }
      } catch {}
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, []);

  // Cola link da área de transferência
  const handlePasteFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text || !text.trim()) {
        Alert.alert('Vazio', 'A área de transferência não contém nenhum texto ou link.');
        return;
      }
      const match = text.match(/https?:\/\/[^\s]+/i);
      if (match) {
        setStreamUrl(match[0]);
        Alert.alert('Sucesso', 'Link de vídeo colado com sucesso!');
      } else {
        setStreamUrl(text.trim());
      }
    } catch (err) {
      Alert.alert('Erro', `Falha ao ler clipboard: ${err.message}`);
    }
  };

  // Envia metadados de série para o Aura Sync (SkipDB)
  const handleSendNowPlaying = async (titleOverride, seasonOverride, episodeOverride) => {
    const title = (titleOverride ?? syncTitle).trim();
    const season = parseInt(seasonOverride ?? syncSeason, 10) || null;
    const episode = parseInt(episodeOverride ?? syncEpisode, 10) || null;

    if (!title) {
      Alert.alert('Atenção', 'Informe o nome da série antes de notificar o AuraPlayer.');
      return false;
    }

    setIsSyncing(true);
    try {
      const res = await fetch(`${baseUrl}/api/now-playing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'now_playing', title, season, episode }),
      });
      const data = await res.json();
      if (data.ok) {
        const seasonEp = season && episode ? ` S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}` : '';
        setSyncStatus({
          ok: true,
          msg: `✅ Enviado: ${title}${seasonEp}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        return true;
      } else {
        setSyncStatus({ ok: false, msg: `❌ Erro: ${data.error || 'resposta inválida'}`, time: null });
        return false;
      }
    } catch {
      setSyncStatus({ ok: false, msg: '❌ Não foi possível conectar ao AuraPlayer.', time: null });
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  // Envia mídia para o Aura Player no PC
  const handleSendToPc = async (urlToSend, titleToSend) => {
    const targetUrl = (urlToSend || streamUrl).trim();
    if (!targetUrl) {
      Alert.alert('Atenção', 'Informe ou cole a URL do stream.');
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch(`${baseUrl}/api/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uri: targetUrl,
          title: (titleToSend || mediaTitle).trim() || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        Alert.alert('▶ Reproduzindo', 'Vídeo enviado com sucesso para o Aura Player no seu PC!');
        // Adiciona ao histórico recente
        const newItem = {
          id: Date.now().toString(),
          url: targetUrl,
          title: (titleToSend || mediaTitle).trim() || 'Vídeo YouCine / Web',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setRecentStreams((prev) => [newItem, ...prev.filter((it) => it.url !== targetUrl)].slice(0, 8));
        setActiveTab('remote');
        checkStatus(true);

        // Se o usuário preencheu os campos do Sync, envia os metadados automaticamente
        if (syncTitle.trim()) {
          handleSendNowPlaying().catch(() => {});
        }
      } else {
        Alert.alert('Erro', data.error || 'Falha ao iniciar no PC.');
      }
    } catch (err) {
      Alert.alert('Falha na Conexão', `Não foi possível conectar ao PC em ${baseUrl}.\nVerifique se o Aura Player está aberto e no mesmo Wi-Fi.`);
    } finally {
      setIsSending(false);
    }
  };

  // Executa ações no controle remoto
  const sendControlAction = async (action, value = null) => {
    try {
      await fetch(`${baseUrl}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, value }),
      });
      setTimeout(() => checkStatus(true), 150);
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível enviar o comando para o PC.');
    }
  };

  // Varredura de IPs locais para auto-descoberta
  const handleAutoScan = async () => {
    setIsScanning(true);
    setScanProgress('Detectando rede local...');
    const basePrefix = serverHost.split('.').slice(0, 3).join('.');
    const portsToTry = [parseInt(serverPort, 10) || 3888, 3888, 49152, 49153, 49154, 8080];

    let found = false;
    for (let i = 1; i <= 254; i++) {
      if (found) break;
      const ip = `${basePrefix}.${i}`;
      setScanProgress(`Verificando ${ip}...`);

      for (const p of portsToTry) {
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 200);
          const res = await fetch(`http://${ip}:${p}/api/status`, { signal: ctrl.signal });
          clearTimeout(tid);
          if (res.ok) {
            const data = await res.json();
            if (data.ok) {
              setServerHost(ip);
              setServerPort(p.toString());
              setPlayerStatus(data);
              setIsConnected(true);
              found = true;
              Alert.alert('Aura Player Encontrado!', `Conectado a ${data.friendlyName || 'PC'} (${ip}:${p})`);
              break;
            }
          }
        } catch {}
      }
    }

    if (!found) {
      Alert.alert('Varredura Concluída', 'Não foi possível encontrar o PC automaticamente. Digite o IP manualmente exibido na tela do Aura Player.');
    }
    setIsScanning(false);
    setScanProgress('');
  };

  // Formata segundos para hh:mm:ss
  const formatTime = (secs) => {
    const s = Math.floor(Number(secs) || 0);
    const m = Math.floor(s / 60);
    const remS = s % 60;
    return `${m}:${remS < 10 ? '0' : ''}${remS}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Barra de Conexão Superior */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>⚡ Aura Remote</Text>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: isConnected ? '#22c55e' : '#ef4444' }]} />
            <Text style={styles.statusText}>
              {isConnected
                ? `${playerStatus?.friendlyName || 'Aura Player'} (${serverHost}:${serverPort})`
                : 'Desconectado do PC'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.btnHeaderConfig}
          onPress={() => setActiveTab('connect')}
        >
          <Text style={styles.btnHeaderConfigText}>⚙️ IP</Text>
        </TouchableOpacity>
      </View>

      {/* Abas de Navegação */}
      <View style={styles.navTabs}>
        <TouchableOpacity
          style={[styles.navTab, activeTab === 'stream' && styles.navTabActive]}
          onPress={() => setActiveTab('stream')}
        >
          <Text style={[styles.navTabText, activeTab === 'stream' && styles.navTabTextActive]}>
            📡 Transmitir
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navTab, activeTab === 'remote' && styles.navTabActive]}
          onPress={() => setActiveTab('remote')}
        >
          <Text style={[styles.navTabText, activeTab === 'remote' && styles.navTabTextActive]}>
            🎮 Controle
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navTab, activeTab === 'connect' && styles.navTabActive]}
          onPress={() => setActiveTab('connect')}
        >
          <Text style={[styles.navTabText, activeTab === 'connect' && styles.navTabTextActive]}>
            🌐 Conexão
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navTab, activeTab === 'sync' && styles.navTabActive]}
          onPress={() => setActiveTab('sync')}
        >
          <Text style={[styles.navTabText, activeTab === 'sync' && styles.navTabTextActive]}>
            🔄 Sync
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* ======================= ABA 1: TRANSMITIR / YOUCINE ======================= */}
        {activeTab === 'stream' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🔗 Enviar Vídeo ou Link do YouCine</Text>
              <Text style={styles.cardSubtitle}>
                Cole o link de transmissão (.m3u8, .mp4, token) para tocar imediatamente no seu PC.
              </Text>

              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="https://... ou link de streaming"
                  placeholderTextColor="#64748b"
                  value={streamUrl}
                  onChangeText={setStreamUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={styles.btnPaste} onPress={handlePasteFromClipboard}>
                  <Text style={styles.btnPasteText}>📋 Colar</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={[styles.input, { marginTop: 10 }]}
                placeholder="Título da obra (Ex: Solo Leveling S01E02)"
                placeholderTextColor="#64748b"
                value={mediaTitle}
                onChangeText={setMediaTitle}
              />

              <TouchableOpacity
                style={[styles.btnPrimary, isSending && styles.btnDisabled]}
                onPress={() => handleSendToPc()}
                disabled={isSending}
              >
                {isSending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>▶ Transmitir para o PC Agora</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Guia de uso com YouCine */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>💡 3 Formas de Usar com o YouCine</Text>
              <View style={styles.tipItem}>
                <Text style={styles.tipNumber}>1</Text>
                <Text style={styles.tipText}>
                  <Text style={{ fontWeight: '700', color: '#38bdf8' }}>No YouCine: </Text>
                  Toque no ícone de Transmitir / TV e selecione o Aura Player (transmissão direta via DLNA).
                </Text>
              </View>
              <View style={styles.tipItem}>
                <Text style={styles.tipNumber}>2</Text>
                <Text style={styles.tipText}>
                  <Text style={{ fontWeight: '700', color: '#38bdf8' }}>Abrir com App: </Text>
                  No YouCine, toque em Compartilhar ou Player Externo e selecione o Aura Remote.
                </Text>
              </View>
              <View style={styles.tipItem}>
                <Text style={styles.tipNumber}>3</Text>
                <Text style={styles.tipText}>
                  <Text style={{ fontWeight: '700', color: '#38bdf8' }}>Copiar Link: </Text>
                  Copie qualquer link de streaming e toque no botão Colar acima.
                </Text>
              </View>
            </View>

            {/* Histórico Recente */}
            {recentStreams.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>🕒 Mídias Recentes</Text>
                {recentStreams.map((it) => (
                  <TouchableOpacity
                    key={it.id}
                    style={styles.recentItem}
                    onPress={() => handleSendToPc(it.url, it.title)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recentTitle} numberOfLines={1}>
                        {it.title}
                      </Text>
                      <Text style={styles.recentUrl} numberOfLines={1}>
                        {it.url}
                      </Text>
                    </View>
                    <Text style={styles.btnSendAgain}>▶</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ======================= ABA 2: CONTROLE REMOTO ======================= */}
        {activeTab === 'remote' && (
          <View>
            {/* Card Tocando Agora */}
            <View style={styles.card}>
              <Text style={styles.cardSubtitle}>EM REPRODUÇÃO NO PC</Text>
              <Text style={styles.nowPlayingTitle} numberOfLines={2}>
                {playerStatus?.title || 'Nada em reprodução no momento'}
              </Text>

              {/* Linha de Tempo */}
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(playerStatus?.position)}</Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFilled,
                      {
                        width:
                          playerStatus?.duration > 0
                            ? `${Math.min(100, (playerStatus.position / playerStatus.duration) * 100)}%`
                            : '0%',
                      },
                    ]}
                  />
                </View>
                <Text style={styles.timeText}>{formatTime(playerStatus?.duration)}</Text>
              </View>
            </View>

            {/* Controles Principais */}
            <View style={styles.remoteControlsCard}>
              <View style={styles.remoteRow}>
                <TouchableOpacity
                  style={styles.btnRemoteCircle}
                  onPress={() => sendControlAction('seek', -10)}
                >
                  <Text style={styles.btnRemoteCircleText}>-10s</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btnRemoteCircle, styles.btnRemotePlay]}
                  onPress={() => sendControlAction('togglePlay')}
                >
                  <Text style={styles.btnRemotePlayText}>
                    {playerStatus?.paused ? '▶' : '⏸'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnRemoteCircle}
                  onPress={() => sendControlAction('seek', 10)}
                >
                  <Text style={styles.btnRemoteCircleText}>+10s</Text>
                </TouchableOpacity>
              </View>

              {/* Linha de Volume */}
              <View style={styles.volumeRow}>
                <TouchableOpacity
                  style={styles.btnVol}
                  onPress={() => sendControlAction('volume', Math.max(0, (playerStatus?.volume || 100) - 10))}
                >
                  <Text style={styles.btnVolText}>🔉 -10%</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnVolMute}
                  onPress={() => sendControlAction('toggleMute')}
                >
                  <Text style={styles.btnVolMuteText}>
                    {playerStatus?.mute ? '🔇 Desmudar' : '🔊 Mudo'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnVol}
                  onPress={() => sendControlAction('volume', Math.min(150, (playerStatus?.volume || 100) + 10))}
                >
                  <Text style={styles.btnVolText}>🔊 +10%</Text>
                </TouchableOpacity>
              </View>

              {/* Botões Rápidos */}
              <View style={styles.quickActionsRow}>
                <TouchableOpacity
                  style={styles.btnQuickAction}
                  onPress={() => sendControlAction('stop')}
                >
                  <Text style={styles.btnQuickActionText}>⏹ Parar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnQuickAction}
                  onPress={() => sendControlAction('toggleFullscreen')}
                >
                  <Text style={styles.btnQuickActionText}>⛶ Tela Cheia</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ======================= ABA 3: CONEXÃO COM O PC ======================= */}
        {activeTab === 'connect' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>⚙️ Endereço do PC (Aura Player)</Text>
              <Text style={styles.cardSubtitle}>
                O IP do seu computador na rede Wi-Fi local.
              </Text>

              <Text style={styles.label}>Endereço IP do Computador:</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 192.168.1.5"
                placeholderTextColor="#64748b"
                value={serverHost}
                onChangeText={setServerHost}
                autoCapitalize="none"
              />

              <Text style={[styles.label, { marginTop: 10 }]}>Porta DLNA / REST:</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 3888 ou porta DLNA"
                placeholderTextColor="#64748b"
                value={serverPort}
                onChangeText={setServerPort}
                keyboardType="numeric"
              />

              <TouchableOpacity style={styles.btnPrimary} onPress={() => checkStatus(false)}>
                <Text style={styles.btnPrimaryText}>🔄 Testar Conexão</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnSecondary, { marginTop: 8 }]}
                onPress={handleAutoScan}
                disabled={isScanning}
              >
                {isScanning ? (
                  <ActivityIndicator color="#38bdf8" />
                ) : (
                  <Text style={styles.btnSecondaryText}>🔍 Encontrar PC Automaticamente</Text>
                )}
              </TouchableOpacity>

              {scanProgress ? <Text style={styles.scanProgressText}>{scanProgress}</Text> : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>📌 Onde ver o IP no PC?</Text>
              <Text style={styles.cardSubtitle}>
                No Aura Player do computador, acesse <Text style={{ fontWeight: '700', color: '#38bdf8' }}>Configurações &gt; DLNA (Receber)</Text>. O endereço IP e a porta ativa aparecem na tela prontos para uso.
              </Text>
            </View>
          </View>
        )}

        {/* ======================= ABA 4: AURA SYNC ======================= */}
        {activeTab === 'sync' && (
          <View>
            {/* Status da Conexão */}
            <View style={[styles.card, { borderColor: isConnected ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.statusDot, { width: 10, height: 10, borderRadius: 5, backgroundColor: isConnected ? '#22c55e' : '#ef4444' }]} />
                <Text style={{ color: isConnected ? '#22c55e' : '#ef4444', fontWeight: '700', fontSize: 13 }}>
                  {isConnected ? `AuraPlayer conectado — ${serverHost}:${serverPort}` : 'AuraPlayer desconectado'}
                </Text>
              </View>
              {!isConnected && (
                <Text style={[styles.cardSubtitle, { marginTop: 6, marginBottom: 0 }]}>
                  Configure o IP na aba Conexão e verifique se o AuraPlayer está aberto.
                </Text>
              )}
            </View>

            {/* Formulário de Série */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🔄 Informar Série ao AuraPlayer</Text>
              <Text style={styles.cardSubtitle}>
                Informe qual série/episódio está sendo reproduzido. O AuraPlayer consultará o SkipDB e exibirá o botão "⏭ Pular Abertura" automaticamente.
              </Text>

              <Text style={styles.label}>Nome da Série:</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: KonoSuba, Demon Slayer..."
                placeholderTextColor="#64748b"
                value={syncTitle}
                onChangeText={setSyncTitle}
                autoCorrect={false}
              />

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Temporada:</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: 2"
                    placeholderTextColor="#64748b"
                    value={syncSeason}
                    onChangeText={setSyncSeason}
                    keyboardType="numeric"
                    maxLength={3}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Episódio:</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: 5"
                    placeholderTextColor="#64748b"
                    value={syncEpisode}
                    onChangeText={setSyncEpisode}
                    keyboardType="numeric"
                    maxLength={4}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: '#7c3aed' }, (isSyncing || !isConnected) && styles.btnDisabled]}
                onPress={() => handleSendNowPlaying()}
                disabled={isSyncing || !isConnected}
              >
                {isSyncing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>🔄 Notificar AuraPlayer</Text>
                )}
              </TouchableOpacity>

              {/* Status do último sync */}
              {syncStatus && (
                <View style={[styles.syncStatusBox, { borderColor: syncStatus.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' }]}>
                  <Text style={{ color: syncStatus.ok ? '#22c55e' : '#f87171', fontSize: 13, fontWeight: '600' }}>
                    {syncStatus.msg}
                  </Text>
                  {syncStatus.time && (
                    <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>às {syncStatus.time}</Text>
                  )}
                </View>
              )}
            </View>

            {/* Card explicativo */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>💡 Como funciona o Aura Sync</Text>
              <View style={styles.tipItem}>
                <Text style={styles.tipNumber}>1</Text>
                <Text style={styles.tipText}>
                  <Text style={{ fontWeight: '700', color: '#38bdf8' }}>No Yucine: </Text>
                  Inicie a transmissão DLNA para o AuraPlayer. O vídeo começa a tocar no PC.
                </Text>
              </View>
              <View style={styles.tipItem}>
                <Text style={styles.tipNumber}>2</Text>
                <Text style={styles.tipText}>
                  <Text style={{ fontWeight: '700', color: '#38bdf8' }}>Aqui no Sync: </Text>
                  Preencha o nome da série, temporada e episódio. Toque em "Notificar AuraPlayer".
                </Text>
              </View>
              <View style={styles.tipItem}>
                <Text style={styles.tipNumber}>3</Text>
                <Text style={styles.tipText}>
                  <Text style={{ fontWeight: '700', color: '#38bdf8' }}>No AuraPlayer: </Text>
                  O botão{' '}
                  <Text style={{ color: '#a78bfa', fontWeight: '700' }}>⏭ Pular Abertura</Text>
                  {' '}aparecerá automaticamente quando o vídeo atingir o intervalo da intro.
                </Text>
              </View>
              <Text style={[styles.cardSubtitle, { marginBottom: 0, marginTop: 4 }]}>
                💡 Dica: ao usar "Transmitir para o PC" com a série preenchida, o Sync é enviado automaticamente.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11.5,
    color: '#94a3b8',
  },
  btnHeaderConfig: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  btnHeaderConfigText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#38bdf8',
  },
  navTabs: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  navTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  navTabActive: {
    borderBottomColor: '#38bdf8',
  },
  navTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  navTabTextActive: {
    color: '#38bdf8',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#131d31',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 14,
    lineHeight: 17,
  },
  inputWrap: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#0a0f1d',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 4,
  },
  btnPaste: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPasteText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#38bdf8',
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  btnSecondary: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  btnSecondaryText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  scanProgressText: {
    fontSize: 11.5,
    color: '#38bdf8',
    textAlign: 'center',
    marginTop: 8,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  tipNumber: {
    backgroundColor: '#2563eb',
    color: '#fff',
    width: 20,
    height: 20,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 20,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: '#cbd5e1',
    lineHeight: 17,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  recentTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f8fafc',
  },
  recentUrl: {
    fontSize: 10.5,
    color: '#64748b',
    marginTop: 2,
  },
  btnSendAgain: {
    fontSize: 16,
    color: '#38bdf8',
    paddingHorizontal: 8,
  },
  nowPlayingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#38bdf8',
    marginBottom: 12,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeText: {
    fontSize: 11,
    color: '#94a3b8',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#1e293b',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFilled: {
    height: '100%',
    backgroundColor: '#38bdf8',
  },
  remoteControlsCard: {
    backgroundColor: '#131d31',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  remoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginVertical: 14,
  },
  btnRemoteCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  btnRemoteCircleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  btnRemotePlay: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#2563eb',
    borderColor: '#38bdf8',
  },
  btnRemotePlayText: {
    fontSize: 26,
    color: '#fff',
  },
  volumeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  btnVol: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnVolText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  btnVolMute: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  btnVolMuteText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f87171',
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  btnQuickAction: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnQuickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  syncStatusBox: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
});

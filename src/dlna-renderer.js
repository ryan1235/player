const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

// Habilita os logs internos do node-ssdp no terminal (util pra diagnosticar
// descoberta/pareamento que falha do lado do celular).
process.env.DEBUG = process.env.DEBUG ? `${process.env.DEBUG},node-ssdp:*` : 'node-ssdp:*';

const { Server: SsdpServer } = require('node-ssdp');
const { XMLParser } = require('fast-xml-parser');
const logger = require('./services/logger');

const AVTRANSPORT_TYPE = 'urn:schemas-upnp-org:service:AVTransport:1';
const RENDERINGCONTROL_TYPE = 'urn:schemas-upnp-org:service:RenderingControl:1';
const CONNECTIONMANAGER_TYPE = 'urn:schemas-upnp-org:service:ConnectionManager:1';


function escapeXml(str) {
  return String(str).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

// SetAVTransportURI vem de qualquer dispositivo na rede, sem autenticacao
// (assim funciona DLNA) — CurrentURI/subtitleUrl so podem ser http(s). Um
// caminho UNC (\\host\share\arquivo) ou file:// repassado sem checagem pro
// mpv faria o Windows tentar autenticar via SMB no host indicado, vazando o
// hash NTLM do usuario logado ("UNC path injection").
function isSafeMediaUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const VIRTUAL_ADAPTER_RE = /radmin|hamachi|vpn|tap-|tun|virtualbox|vmware|tailscale|zerotier|wsl|hyper-v|npcap|loopback/i;

function rankAddress(address) {
  if (/^192\.168\./.test(address)) return 0;
  if (/^10\./.test(address)) return 1;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) return 2;
  return 3;
}

function listInterfaces() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({ name, address: iface.address, virtual: VIRTUAL_ADAPTER_RE.test(name) });
      }
    }
  }
  return candidates;
}

function getLocalInterface(preferredName) {
  const candidates = listInterfaces();

  if (preferredName) {
    const forced = candidates.find((c) => c.name === preferredName);
    if (forced) return forced;
  }

  const real = candidates.filter((c) => !c.virtual);
  const pool = real.length ? real : candidates;
  pool.sort((a, b) => rankAddress(a.address) - rankAddress(b.address));

  return pool.length ? pool[0] : { name: null, address: '127.0.0.1' };
}

function formatTime(totalSeconds) {
  const n = Number(totalSeconds);
  if (!Number.isFinite(n) || n < 0) return '0:00:00';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseTime(str) {
  const parts = String(str).split(':').map(Number);
  while (parts.length < 3) parts.unshift(0);
  const [h, m, s] = parts;
  return h * 3600 + m * 60 + s;
}

// Extrai titulo, URL de legenda externa e detalhes do DIDL-Lite que os apps de cast mandam.
function parseDidlMetadata(xml) {
  const empty = { title: null, subtitleUrl: null, item: null };
  if (!xml) return empty;
  try {
    const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false, attributeNamePrefix: '@_' });
    const parsed = parser.parse(xml);
    const item = parsed?.['DIDL-Lite']?.item;
    if (!item) return { title: null, subtitleUrl: null, item: parsed };

    const rawTitle = item.title;
    const title = typeof rawTitle === 'string' ? rawTitle : rawTitle?.['#text'] || null;

    let subtitleUrl = null;
    const resList = Array.isArray(item.res) ? item.res : item.res ? [item.res] : [];
    for (const res of resList) {
      if (!res || typeof res === 'string') continue;
      // Convencao Samsung/BubbleUPnP: legenda como atributo sec:CaptionInfo(Ex) no proprio <res> do video.
      const caption = res['@_CaptionInfoEx'] || res['@_CaptionInfo'];
      if (caption) {
        subtitleUrl = caption;
        break;
      }
      // Convencao alternativa: um <res> separado so pra legenda, com mimetype de texto.
      const protocolInfo = res['@_protocolInfo'] || '';
      if (/text\/(srt|vtt|ssa|ass)|smi\b/i.test(protocolInfo) && res['#text']) {
        subtitleUrl = res['#text'];
        break;
      }
    }
    if (!subtitleUrl) {
      // Convencao com elemento proprio (nao atributo do res).
      const captionEl = item.CaptionInfoEx || item.CaptionInfo;
      if (captionEl) subtitleUrl = typeof captionEl === 'string' ? captionEl : captionEl['#text'] || null;
    }

    return { title: title || null, subtitleUrl: subtitleUrl || null, item };
  } catch (err) {
    return { title: null, subtitleUrl: null, item: null, error: err.message };
  }
}

function loadOrCreateUuid() {
  const file = path.join(__dirname, '..', 'device-id.json');
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.uuid) return data.uuid;
  } catch {
    // arquivo ainda nao existe ou esta invalido, gera um novo
  }
  const uuid = crypto.randomUUID();
  try {
    fs.writeFileSync(file, JSON.stringify({ uuid }));
  } catch {
    // nao foi possivel persistir, segue com o uuid em memoria
  }
  return uuid;
}

function soapResponse(serviceType, action, outArgs = {}) {
  const argsXml = Object.entries(outArgs)
    .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
    .join('');
  return `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
<s:Body><u:${action}Response xmlns:u="${serviceType}">${argsXml}</u:${action}Response></s:Body>
</s:Envelope>`;
}

function soapFault(code, description) {
  return `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
<s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring>
<detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>${code}</errorCode><errorDescription>${escapeXml(description)}</errorDescription></UPnPError></detail>
</s:Fault></s:Body></s:Envelope>`;
}

const AVTRANSPORT_SCPD = `<?xml version="1.0"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
<specVersion><major>1</major><minor>0</minor></specVersion>
<actionList>
<action><name>SetAVTransportURI</name><argumentList>
<argument><name>InstanceID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_InstanceID</relatedStateVariable></argument>
<argument><name>CurrentURI</name><direction>in</direction><relatedStateVariable>AVTransportURI</relatedStateVariable></argument>
<argument><name>CurrentURIMetaData</name><direction>in</direction><relatedStateVariable>AVTransportURIMetaData</relatedStateVariable></argument>
</argumentList></action>
<action><name>Play</name><argumentList>
<argument><name>InstanceID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_InstanceID</relatedStateVariable></argument>
<argument><name>Speed</name><direction>in</direction><relatedStateVariable>TransportPlaySpeed</relatedStateVariable></argument>
</argumentList></action>
<action><name>Pause</name><argumentList>
<argument><name>InstanceID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_InstanceID</relatedStateVariable></argument>
</argumentList></action>
<action><name>Stop</name><argumentList>
<argument><name>InstanceID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_InstanceID</relatedStateVariable></argument>
</argumentList></action>
<action><name>Seek</name><argumentList>
<argument><name>InstanceID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_InstanceID</relatedStateVariable></argument>
<argument><name>Unit</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_SeekMode</relatedStateVariable></argument>
<argument><name>Target</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_SeekTarget</relatedStateVariable></argument>
</argumentList></action>
<action><name>GetTransportInfo</name><argumentList>
<argument><name>InstanceID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_InstanceID</relatedStateVariable></argument>
<argument><name>CurrentTransportState</name><direction>out</direction><relatedStateVariable>TransportState</relatedStateVariable></argument>
<argument><name>CurrentTransportStatus</name><direction>out</direction><relatedStateVariable>TransportStatus</relatedStateVariable></argument>
<argument><name>CurrentSpeed</name><direction>out</direction><relatedStateVariable>TransportPlaySpeed</relatedStateVariable></argument>
</argumentList></action>
<action><name>GetPositionInfo</name><argumentList>
<argument><name>InstanceID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_InstanceID</relatedStateVariable></argument>
<argument><name>Track</name><direction>out</direction><relatedStateVariable>CurrentTrack</relatedStateVariable></argument>
<argument><name>TrackDuration</name><direction>out</direction><relatedStateVariable>CurrentTrackDuration</relatedStateVariable></argument>
<argument><name>TrackMetaData</name><direction>out</direction><relatedStateVariable>CurrentTrackMetaData</relatedStateVariable></argument>
<argument><name>TrackURI</name><direction>out</direction><relatedStateVariable>CurrentTrackURI</relatedStateVariable></argument>
<argument><name>RelTime</name><direction>out</direction><relatedStateVariable>RelativeTimePosition</relatedStateVariable></argument>
<argument><name>AbsTime</name><direction>out</direction><relatedStateVariable>AbsoluteTimePosition</relatedStateVariable></argument>
<argument><name>RelCount</name><direction>out</direction><relatedStateVariable>RelativeCounterPosition</relatedStateVariable></argument>
<argument><name>AbsCount</name><direction>out</direction><relatedStateVariable>AbsoluteCounterPosition</relatedStateVariable></argument>
</argumentList></action>
<action><name>GetMediaInfo</name><argumentList>
<argument><name>InstanceID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_InstanceID</relatedStateVariable></argument>
<argument><name>NrTracks</name><direction>out</direction><relatedStateVariable>NumberOfTracks</relatedStateVariable></argument>
<argument><name>MediaDuration</name><direction>out</direction><relatedStateVariable>CurrentMediaDuration</relatedStateVariable></argument>
<argument><name>CurrentURI</name><direction>out</direction><relatedStateVariable>AVTransportURI</relatedStateVariable></argument>
<argument><name>CurrentURIMetaData</name><direction>out</direction><relatedStateVariable>AVTransportURIMetaData</relatedStateVariable></argument>
<argument><name>NextURI</name><direction>out</direction><relatedStateVariable>NextAVTransportURI</relatedStateVariable></argument>
<argument><name>NextURIMetaData</name><direction>out</direction><relatedStateVariable>NextAVTransportURIMetaData</relatedStateVariable></argument>
<argument><name>PlayMedium</name><direction>out</direction><relatedStateVariable>PlaybackStorageMedium</relatedStateVariable></argument>
<argument><name>RecordMedium</name><direction>out</direction><relatedStateVariable>RecordStorageMedium</relatedStateVariable></argument>
<argument><name>WriteStatus</name><direction>out</direction><relatedStateVariable>RecordMediumWriteStatus</relatedStateVariable></argument>
</argumentList></action>
</actionList>
<serviceStateTable>
<stateVariable sendEvents="no"><name>TransportState</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>TransportStatus</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>TransportPlaySpeed</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>CurrentTrack</name><dataType>ui4</dataType></stateVariable>
<stateVariable sendEvents="no"><name>CurrentTrackDuration</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>CurrentTrackMetaData</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>CurrentTrackURI</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>RelativeTimePosition</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>AbsoluteTimePosition</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>RelativeCounterPosition</name><dataType>i4</dataType></stateVariable>
<stateVariable sendEvents="no"><name>AbsoluteCounterPosition</name><dataType>i4</dataType></stateVariable>
<stateVariable sendEvents="no"><name>NumberOfTracks</name><dataType>ui4</dataType></stateVariable>
<stateVariable sendEvents="no"><name>CurrentMediaDuration</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>AVTransportURI</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>AVTransportURIMetaData</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>NextAVTransportURI</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>NextAVTransportURIMetaData</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>PlaybackStorageMedium</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>RecordStorageMedium</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>RecordMediumWriteStatus</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>A_ARG_TYPE_InstanceID</name><dataType>ui4</dataType></stateVariable>
<stateVariable sendEvents="no"><name>A_ARG_TYPE_SeekMode</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>A_ARG_TYPE_SeekTarget</name><dataType>string</dataType></stateVariable>
</serviceStateTable>
</scpd>`;

const RENDERINGCONTROL_SCPD = `<?xml version="1.0"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
<specVersion><major>1</major><minor>0</minor></specVersion>
<actionList>
<action><name>SetVolume</name><argumentList>
<argument><name>InstanceID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_InstanceID</relatedStateVariable></argument>
<argument><name>Channel</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_Channel</relatedStateVariable></argument>
<argument><name>DesiredVolume</name><direction>in</direction><relatedStateVariable>Volume</relatedStateVariable></argument>
</argumentList></action>
<action><name>GetVolume</name><argumentList>
<argument><name>InstanceID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_InstanceID</relatedStateVariable></argument>
<argument><name>Channel</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_Channel</relatedStateVariable></argument>
<argument><name>CurrentVolume</name><direction>out</direction><relatedStateVariable>Volume</relatedStateVariable></argument>
</argumentList></action>
<action><name>SetMute</name><argumentList>
<argument><name>InstanceID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_InstanceID</relatedStateVariable></argument>
<argument><name>Channel</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_Channel</relatedStateVariable></argument>
<argument><name>DesiredMute</name><direction>in</direction><relatedStateVariable>Mute</relatedStateVariable></argument>
</argumentList></action>
<action><name>GetMute</name><argumentList>
<argument><name>InstanceID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_InstanceID</relatedStateVariable></argument>
<argument><name>Channel</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_Channel</relatedStateVariable></argument>
<argument><name>CurrentMute</name><direction>out</direction><relatedStateVariable>Mute</relatedStateVariable></argument>
</argumentList></action>
</actionList>
<serviceStateTable>
<stateVariable sendEvents="no"><name>Volume</name><dataType>ui2</dataType></stateVariable>
<stateVariable sendEvents="no"><name>Mute</name><dataType>boolean</dataType></stateVariable>
<stateVariable sendEvents="no"><name>A_ARG_TYPE_InstanceID</name><dataType>ui4</dataType></stateVariable>
<stateVariable sendEvents="no"><name>A_ARG_TYPE_Channel</name><dataType>string</dataType></stateVariable>
</serviceStateTable>
</scpd>`;

const CONNECTIONMANAGER_SCPD = `<?xml version="1.0"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
<specVersion><major>1</major><minor>0</minor></specVersion>
<actionList>
<action><name>GetProtocolInfo</name><argumentList>
<argument><name>Source</name><direction>out</direction><relatedStateVariable>SourceProtocolInfo</relatedStateVariable></argument>
<argument><name>Sink</name><direction>out</direction><relatedStateVariable>SinkProtocolInfo</relatedStateVariable></argument>
</argumentList></action>
<action><name>GetCurrentConnectionIDs</name><argumentList>
<argument><name>ConnectionIDs</name><direction>out</direction><relatedStateVariable>CurrentConnectionIDs</relatedStateVariable></argument>
</argumentList></action>
<action><name>GetCurrentConnectionInfo</name><argumentList>
<argument><name>ConnectionID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_ConnectionID</relatedStateVariable></argument>
<argument><name>RcsID</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_RcsID</relatedStateVariable></argument>
<argument><name>AVTransportID</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_AVTransportID</relatedStateVariable></argument>
<argument><name>ProtocolInfo</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_ProtocolInfo</relatedStateVariable></argument>
<argument><name>PeerConnectionManager</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_ConnectionManager</relatedStateVariable></argument>
<argument><name>PeerConnectionID</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_ConnectionID</relatedStateVariable></argument>
<argument><name>Direction</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_Direction</relatedStateVariable></argument>
<argument><name>Status</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_ConnectionStatus</relatedStateVariable></argument>
</argumentList></action>
</actionList>
<serviceStateTable>
<stateVariable sendEvents="no"><name>SourceProtocolInfo</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>SinkProtocolInfo</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>CurrentConnectionIDs</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>A_ARG_TYPE_ConnectionID</name><dataType>i4</dataType></stateVariable>
<stateVariable sendEvents="no"><name>A_ARG_TYPE_RcsID</name><dataType>i4</dataType></stateVariable>
<stateVariable sendEvents="no"><name>A_ARG_TYPE_AVTransportID</name><dataType>i4</dataType></stateVariable>
<stateVariable sendEvents="no"><name>A_ARG_TYPE_ProtocolInfo</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>A_ARG_TYPE_ConnectionManager</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>A_ARG_TYPE_Direction</name><dataType>string</dataType></stateVariable>
<stateVariable sendEvents="no"><name>A_ARG_TYPE_ConnectionStatus</name><dataType>string</dataType></stateVariable>
</serviceStateTable>
</scpd>`;

class DlnaRenderer extends EventEmitter {
  constructor(player, options = {}) {
    super();
    this.player = player;
    this.friendlyName = options.friendlyName || `${os.hostname()} (Player)`;
    this.uuid = loadOrCreateUuid();
    this.httpServer = null;
    this.ssdpServer = null;
    this.port = null;
    // true so quando o servidor HTTP cai sozinho depois de start() ja ter
    // resolvido (ver o listener 'error' registrado la embaixo) — distingue
    // de um stop() deliberado, que zera isso, pra o cast-supervisor em
    // main.js saber que deve tentar reiniciar em vez de so ficar quieto.
    this._crashed = false;
    const iface = getLocalInterface();
    this.ip = iface.address;
    this.interfaceName = iface.name;
    this.currentUri = '';
    this.currentTitle = null;
    this.currentURIMetaData = '';
    // Contexto de série enviado pelo Aura Sync (Android) via POST /api/now-playing
    this.syncSeriesContext = null;

    // Se algo diferente do que a gente mandou tocar via DLNA comecar a
    // rodar (ex.: usuario abriu um arquivo local pela aba "Arquivos locais"),
    // o indicador de "recebendo de X" precisa sumir. Uma reconexao interna
    // apos queda recarrega o MESMO target, entao nao aciona isso.
    this.player.on('load', ({ target }) => {
      if (target !== this.currentUri) {
        this.currentUri = '';
        this.currentTitle = null;
        this._emitSource(null, null);
      }
    });
  }

  _emitSource(remote, title) {
    this.emit('source', { remote: remote || null, title: title || null });
  }

  setFriendlyName(name) {
    const clean = typeof name === 'string' ? name.trim() : '';
    this.friendlyName = clean || `${os.hostname()} (Player)`;
  }

  getStatus() {
    return {
      active: !!this.httpServer,
      crashed: this._crashed,
      friendlyName: this.friendlyName,
      ip: this.ip,
      interfaceName: this.interfaceName,
      port: this.port,
      url: this.port ? `http://${this.ip}:${this.port}/description.xml` : null,
      interfaces: listInterfaces(),
    };
  }

  async start(preferredInterface) {
    if (this.httpServer) return this.getStatus();
    this._crashed = false;
    const iface = getLocalInterface(preferredInterface);
    this.ip = iface.address;
    this.interfaceName = iface.name;
    console.log(`[dlna-renderer] iniciando em ${iface.name || '?'} (${iface.address})`);

    await new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => this._handleRequest(req, res));
      this.httpServer.on('error', reject);
      this.httpServer.listen(0, () => {
        this.port = this.httpServer.address().port;
        // O listener acima (que rejeita a promise de start) so cobre erro
        // ANTES do listen resolver. Depois disso, sem um listener novo,
        // qualquer erro do servidor (porta derrubada, etc.) era engolido em
        // silencio — getStatus().active continuava true pra sempre.
        this.httpServer.removeAllListeners('error');
        this.httpServer.on('error', (err) => {
          logger.network('[dlna-renderer] servidor HTTP do modo Receber caiu:', err.message);
          this._crashed = true;
          this.httpServer = null;
          this.port = null;
          this.emit('crashed', err);
        });
        resolve();
      });
    });

    this.ssdpServer = new SsdpServer({
      location: `http://${this.ip}:${this.port}/description.xml`,
      udn: `uuid:${this.uuid}`,
      adInterval: 5000,
      explicitSocketBind: true,
      interfaces: iface.name ? [iface.name] : undefined,
    });
    this.ssdpServer.addUSN('upnp:rootdevice');
    this.ssdpServer.addUSN('urn:schemas-upnp-org:device:MediaRenderer:1');
    this.ssdpServer.addUSN(AVTRANSPORT_TYPE);
    this.ssdpServer.addUSN(RENDERINGCONTROL_TYPE);
    this.ssdpServer.addUSN(CONNECTIONMANAGER_TYPE);

    await new Promise((resolve, reject) => {
      this.ssdpServer.start((err) => (err ? reject(err) : resolve()));
    });

    return this.getStatus();
  }

  async stop() {
    this._crashed = false;
    if (this.ssdpServer) {
      this.ssdpServer.stop();
      this.ssdpServer = null;
    }
    if (this.httpServer) {
      await new Promise((resolve) => this.httpServer.close(resolve));
      this.httpServer = null;
      this.port = null;
    }
    return this.getStatus();
  }

  _descriptionXml() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
<specVersion><major>1</major><minor>0</minor></specVersion>
<device>
<deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
<friendlyName>${escapeXml(this.friendlyName)}</friendlyName>
<manufacturer>Player</manufacturer>
<manufacturerURL>https://example.com</manufacturerURL>
<modelName>Simple DLNA Player</modelName>
<modelDescription>Player de video com suporte a DLNA</modelDescription>
<modelNumber>1.0</modelNumber>
<UDN>uuid:${this.uuid}</UDN>
<serviceList>
<service>
<serviceType>${AVTRANSPORT_TYPE}</serviceType>
<serviceId>urn:upnp-org:serviceId:AVTransport</serviceId>
<SCPDURL>/avtransport.xml</SCPDURL>
<controlURL>/control/avtransport</controlURL>
<eventSubURL>/event/avtransport</eventSubURL>
</service>
<service>
<serviceType>${RENDERINGCONTROL_TYPE}</serviceType>
<serviceId>urn:upnp-org:serviceId:RenderingControl</serviceId>
<SCPDURL>/renderingcontrol.xml</SCPDURL>
<controlURL>/control/renderingcontrol</controlURL>
<eventSubURL>/event/renderingcontrol</eventSubURL>
</service>
<service>
<serviceType>${CONNECTIONMANAGER_TYPE}</serviceType>
<serviceId>urn:upnp-org:serviceId:ConnectionManager</serviceId>
<SCPDURL>/connectionmanager.xml</SCPDURL>
<controlURL>/control/connectionmanager</controlURL>
<eventSubURL>/event/connectionmanager</eventSubURL>
</service>
</serviceList>
</device>
</root>`;
  }

  async _handleRequest(req, res) {
    const remote = req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || '(não informado)';
    const soapAction = req.headers.soapaction || '';
    
    console.log(`\n------------------------------------------------------------`);
    console.log(`📡 [DLNA-HTTP] ${req.method} ${req.url}`);
    console.log(`   De: ${remote} | User-Agent: ${userAgent}`);
    if (soapAction) console.log(`   SOAPAction: ${soapAction}`);
    console.log(`------------------------------------------------------------`);
    logger.network(`[dlna-http] ${req.method} ${req.url} de ${remote} (UA: ${userAgent})`);

    const sendXml = (status, xml) => {
      const buf = Buffer.from(xml, 'utf8');
      res.writeHead(status, {
        'Content-Type': 'text/xml; charset="utf-8"',
        'Content-Length': buf.length,
        'Connection': 'close'
      });
      res.end(buf);
    };

    const sendJson = (status, data) => {
      const buf = Buffer.from(JSON.stringify(data), 'utf8');
      res.writeHead(status, {
        'Content-Type': 'application/json; charset="utf-8"',
        'Content-Length': buf.length,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Connection': 'close'
      });
      res.end(buf);
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Connection': 'close'
      });
      res.end();
      return;
    }

    try {
      const url = req.url.split('?')[0];

      // --- REST API para App Mobile / Expo / Controle Remoto ---
      if (req.method === 'GET' && url === '/api/status') {
        const player = this.player;
        let pos = 0, dur = 0, paused = false, vol = 100, mute = false, idle = true;
        if (player) {
          try {
            pos = await player.getProperty('time-pos', 0);
            dur = await player.getProperty('duration', 0);
            paused = await player.getProperty('pause', false);
            vol = await player.getProperty('volume', 100);
            mute = await player.getProperty('mute', false);
            idle = await player.getProperty('idle-active', true);
          } catch {}
        }
        sendJson(200, {
          ok: true,
          friendlyName: this.friendlyName,
          ip: this.ip,
          port: this.port,
          currentUri: this.currentUri || '',
          title: this.currentTitle || (player && player.currentTarget ? path.basename(player.currentTarget) : 'Nada em reprodução'),
          position: pos || 0,
          duration: dur || 0,
          paused: !!paused,
          volume: Math.round(vol || 100),
          mute: !!mute,
          idle: !!idle,
        });
        return;
      }

      if (req.method === 'POST' && url === '/api/play') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        let body = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}
        const { uri, title, subtitleUrl } = body;
        if (!uri || !isSafeMediaUrl(uri)) {
          sendJson(400, { ok: false, error: 'URI precisa ser http:// ou https:// válida' });
          return;
        }
        this.currentUri = uri;
        this.currentTitle = title || null;
        this._emitSource(remote, title);
        if (this.player) {
          await this.player.loadFile(uri);
          if (subtitleUrl && isSafeMediaUrl(subtitleUrl)) {
            await this.player.command(['sub-add', subtitleUrl, 'select']).catch(() => {});
          }
        }
        sendJson(200, { ok: true, message: 'Reprodução iniciada', uri, title });
        return;
      }

      if (req.method === 'POST' && url === '/api/control') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        let body = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}
        const { action, value } = body;
        const player = this.player;
        if (!player) {
          sendJson(500, { ok: false, error: 'Player não inicializado' });
          return;
        }
        switch (action) {
          case 'play':
            await player.play();
            break;
          case 'pause':
            await player.pause();
            break;
          case 'togglePlay': {
            const isPaused = await player.getProperty('pause', false);
            if (isPaused) await player.play();
            else await player.pause();
            break;
          }
          case 'seek':
            await player.seek(Number(value) || 0);
            break;
          case 'seekAbsolute':
            await player.seekAbsolute(Number(value) || 0);
            break;
          case 'volume':
            await player.setVolume(Number(value) || 100);
            break;
          case 'toggleMute':
            await player.toggleMute();
            break;
          case 'stop':
            await player.stop();
            break;
          default:
            sendJson(400, { ok: false, error: `Ação desconhecida: ${action}` });
            return;
        }
        sendJson(200, { ok: true, action, value });
        return;
      }

      // --- Aura Sync: recebe metadados do conteúdo em reprodução no Yucine (Android) ---
      if (req.method === 'POST' && url === '/api/now-playing') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        let body = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {
          sendJson(400, { ok: false, error: 'JSON inválido' });
          return;
        }

        const title = typeof body.title === 'string' ? body.title.trim() : null;
        const season = parseInt(body.season, 10) || null;
        const episode = parseInt(body.episode, 10) || null;
        const imdbId = typeof body.imdbId === 'string' ? body.imdbId.trim() : null;

        if (!title) {
          sendJson(400, { ok: false, error: 'Campo "title" obrigatório' });
          return;
        }

        // Salva o contexto de série atual para associar ao próximo SetAVTransportURI
        this.syncSeriesContext = { title, season, episode, imdbId, receivedAt: Date.now() };
        logger.network(`[aura-sync] now-playing recebido: ${title} S${season}E${episode}`);

        // Emite para o main.js iniciar a consulta ao SkipDB
        this.emit('sync:now-playing', this.syncSeriesContext);

        sendJson(200, { ok: true, title, season, episode });
        return;
      }

      if (req.method === 'GET' && url === '/description.xml') {
        console.log(`🔍 [DLNA] Requisição de device description (SSDP/UPnP Discovery) por ${remote}`);
        this.emit('activity', { type: 'discovery', remote: req.socket.remoteAddress });
        sendXml(200, this._descriptionXml());
        return;
      }
      if (req.method === 'GET' && url === '/avtransport.xml') {
        console.log(`📄 [DLNA] Requisição de AVTransport SCPD por ${remote}`);
        sendXml(200, AVTRANSPORT_SCPD);
        return;
      }
      if (req.method === 'GET' && url === '/renderingcontrol.xml') {
        console.log(`📄 [DLNA] Requisição de RenderingControl SCPD por ${remote}`);
        sendXml(200, RENDERINGCONTROL_SCPD);
        return;
      }
      if (req.method === 'GET' && url === '/connectionmanager.xml') {
        console.log(`📄 [DLNA] Requisição de ConnectionManager SCPD por ${remote}`);
        sendXml(200, CONNECTIONMANAGER_SCPD);
        return;
      }

      if (req.method === 'SUBSCRIBE' || req.method === 'UNSUBSCRIBE') {
        console.log(`🔔 [DLNA] Event subscription (${req.method}) de ${remote}: Callback=${req.headers.callback || '-'} NT=${req.headers.nt || '-'}`);
        res.writeHead(200, {
          SID: `uuid:${crypto.randomUUID()}`,
          TIMEOUT: 'Second-1800',
          'Connection': 'close'
        });
        res.end();
        return;
      }

      if (req.method === 'POST' && url.startsWith('/control/')) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks).toString('utf8');
        await this._handleControl(url, req.headers.soapaction || '', body, res, sendXml, req.socket.remoteAddress);
        return;
      }

      console.log(`⚠️ [DLNA] Rota não encontrada: ${req.method} ${url}`);
      res.writeHead(404, { 'Connection': 'close' });
      res.end();
    } catch (err) {
      console.error(`❌ [DLNA] Erro no _handleRequest:`, err);
      try {
        sendXml(500, soapFault(501, err.message || 'Action Failed'));
      } catch {
        // resposta ja foi enviada
      }
    }
  }

  async _handleControl(url, soapActionHeader, body, res, sendXml, remote) {
    const actionMatch = /#([^"]+)"?$/.exec(soapActionHeader);
    const action = actionMatch ? actionMatch[1] : null;
    
    console.log(`\n⚡ ================== [DLNA AÇÃO SOAP: ${action || 'Desconhecida'}] ==================`);
    console.log(`   Origem: ${remote}`);
    console.log(`   URL de Controle: ${url}`);
    console.log(`   SOAPAction: ${soapActionHeader}`);
    logger.network(`[dlna-soap] Ação: ${action} em ${url} de ${remote}`);
    this.emit('activity', { type: 'action', action, remote });

    let args = {};
    try {
      const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false, attributeNamePrefix: '@_' });
      const parsed = parser.parse(body);
      args = parsed?.Envelope?.Body?.[action] || {};
    } catch {
      const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });
      const parsed = parser.parse(body);
      args = parsed?.Envelope?.Body?.[action] || {};
    }

    if (action !== 'GetPositionInfo' && action !== 'GetTransportInfo') {
      console.log(`   Argumentos recebidos:\n`, JSON.stringify(args, null, 2));
    }

    let serviceType = AVTRANSPORT_TYPE;
    if (url.includes('renderingcontrol')) serviceType = RENDERINGCONTROL_TYPE;
    else if (url.includes('connectionmanager')) serviceType = CONNECTIONMANAGER_TYPE;

    let out;
    try {
      out = await this._runAction(serviceType, action, args, remote);
    } catch (err) {
      console.error(`❌ [DLNA] Ação ${action} falhou: ${err.message}`);
      logger.network(`[dlna-error] Ação ${action} falhou: ${err.message}`);
      sendXml(500, soapFault(501, err.message || 'Action Failed'));
      return;
    }

    if (out === null) {
      console.warn(`⚠️ [DLNA] Ação inválida ou não implementada: ${action}`);
      sendXml(401, soapFault(401, 'Invalid Action'));
      return;
    }

    sendXml(200, soapResponse(serviceType, action, out));
  }

  async _runAction(serviceType, action, args, remote) {
    const player = this.player;

    if (serviceType === AVTRANSPORT_TYPE) {
      switch (action) {
        case 'SetAVTransportURI': {
          const requestedUri = args.CurrentURI || '';
          if (!isSafeMediaUrl(requestedUri)) {
            logger.network(`[dlna] SetAVTransportURI de ${remote} rejeitado (esquema nao http/https): ${requestedUri}`);
            throw new Error('CurrentURI precisa ser http:// ou https://');
          }
          this.currentUri = requestedUri;
          this.currentURIMetaData = args.CurrentURIMetaData || '';
          const metaResult = parseDidlMetadata(args.CurrentURIMetaData);
          const { title, subtitleUrl } = metaResult;

          console.log(`\n🎬 ==================== [DLNA FONTE TRANSMITINDO MÍDIA] ====================`);
          console.log(`📍 IP Remoto: ${remote}`);
          console.log(`🔗 CurrentURI (Link do Vídeo): ${this.currentUri}`);
          console.log(`🏷️ Título Parseado: ${title || '(não detectado)'}`);
          console.log(`💬 Subtitle URL (Legenda Externa): ${subtitleUrl || '(nenhuma encontrada no XML)'}`);
          if (metaResult.item) {
            console.log(`📦 DIDL-Lite Estruturado (JSON Completo):`);
            console.log(JSON.stringify(metaResult.item, null, 2));
          }
          console.log(`📝 DIDL-Lite Bruto (XML Original):\n${args.CurrentURIMetaData || '(vazio)'}`);
          console.log(`===========================================================================\n`);

          logger.network(`[cast-media] Nova mídia recebida de ${remote}:`);
          logger.network(`[cast-media] URI: ${this.currentUri}`);
          logger.network(`[cast-media] Título: ${title || '(sem título)'}`);
          if (subtitleUrl) logger.network(`[cast-media] Legenda: ${subtitleUrl}`);

          this.currentTitle = title;
          this._emitSource(remote, title);
          player
            .loadFile(this.currentUri)
            .then(() => {
              if (subtitleUrl && isSafeMediaUrl(subtitleUrl)) player.command(['sub-add', subtitleUrl, 'select']).catch(() => {});
            })
            .catch((err) => console.error('[dlna] erro no loadFile', err));
          return {};
        }
        case 'SetNextAVTransportURI': {
          console.log(`\n⏭️ [DLNA] SetNextAVTransportURI de ${remote}: NextURI=${args.NextURI}`);
          logger.network(`[cast-media] SetNextAVTransportURI de ${remote}: ${args.NextURI}`);
          return {};
        }
        case 'Play':
          console.log(`▶️ [DLNA] Comando Play recebido de ${remote} (Speed: ${args.Speed || '1'})`);
          logger.network(`[dlna] Play de ${remote}`);
          await player.play();
          return {};
        case 'Pause':
          console.log(`⏸️ [DLNA] Comando Pause recebido de ${remote}`);
          logger.network(`[dlna] Pause de ${remote}`);
          await player.pause();
          return {};
        case 'Stop':
          console.log(`⏹️ [DLNA] Comando Stop recebido de ${remote}`);
          logger.network(`[dlna] Stop de ${remote}`);
          await player.stop();
          this.currentUri = '';
          this.currentTitle = null;
          this.currentURIMetaData = '';
          this._emitSource(null, null);
          return {};
        case 'Seek': {
          console.log(`⏩ [DLNA] Comando Seek recebido de ${remote}: Unit=${args.Unit} Target=${args.Target}`);
          logger.network(`[dlna] Seek de ${remote}: ${args.Target}`);
          const target = parseTime(args.Target || '0:00:00');
          await player.command(['seek', target, 'absolute']);
          return {};
        }
        case 'GetTransportInfo': {
          const idle = await player.getProperty('idle-active', true);
          const paused = await player.getProperty('pause', false);
          let state = 'STOPPED';
          if (this.currentUri) {
            if (player._loading) {
              state = 'TRANSITIONING';
            } else if (!idle) {
              state = paused ? 'PAUSED_PLAYBACK' : 'PLAYING';
            } else {
              state = 'TRANSITIONING';
            }
          }
          return { CurrentTransportState: state, CurrentTransportStatus: 'OK', CurrentSpeed: '1' };
        }
        case 'GetPositionInfo': {
          const pos = await player.getProperty('time-pos', 0);
          const dur = await player.getProperty('duration', 0);
          const relTime = formatTime(pos);
          const trackDur = formatTime(dur);
          return {
            Track: '1',
            TrackDuration: trackDur,
            TrackMetaData: this.currentURIMetaData || '',
            TrackURI: this.currentUri || '',
            RelTime: relTime,
            AbsTime: relTime,
            RelCount: '2147483647',
            AbsCount: '2147483647',
          };
        }
        case 'GetMediaInfo': {
          const dur = await player.getProperty('duration', 0);
          return {
            NrTracks: this.currentUri ? '1' : '0',
            MediaDuration: formatTime(dur),
            CurrentURI: this.currentUri || '',
            CurrentURIMetaData: this.currentURIMetaData || '',
            NextURI: '',
            NextURIMetaData: '',
            PlayMedium: 'NETWORK',
            RecordMedium: 'NOT_IMPLEMENTED',
            WriteStatus: 'NOT_IMPLEMENTED',
          };
        }
        case 'Next':
        case 'Previous':
          return {};
        default:
          return null;
      }
    }

    if (serviceType === RENDERINGCONTROL_TYPE) {
      switch (action) {
        case 'SetVolume':
          await player.setVolume(Number(args.DesiredVolume) || 0);
          return {};
        case 'GetVolume': {
          const vol = await player.getProperty('volume', 100);
          return { CurrentVolume: String(Math.round(vol)) };
        }
        case 'SetMute':
          await player.setMute(args.DesiredMute === '1' || args.DesiredMute === true || args.DesiredMute === 'true');
          return {};
        case 'GetMute': {
          const muted = await player.getProperty('mute', false);
          return { CurrentMute: muted ? '1' : '0' };
        }
        default:
          return null;
      }
    }

    if (serviceType === CONNECTIONMANAGER_TYPE) {
      switch (action) {
        case 'GetProtocolInfo':
          return { Source: '', Sink: 'http-get:*:*:*' };
        case 'GetCurrentConnectionIDs':
          return { ConnectionIDs: '0' };
        case 'GetCurrentConnectionInfo':
          return {
            RcsID: '0',
            AVTransportID: '0',
            ProtocolInfo: '',
            PeerConnectionManager: '',
            PeerConnectionID: '-1',
            Direction: 'Input',
            Status: 'OK',
          };
        default:
          return null;
      }
    }

    return null;
  }
}

module.exports = DlnaRenderer;

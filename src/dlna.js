const http = require('http');
const https = require('https');
const { Client } = require('node-ssdp');
const { XMLParser } = require('fast-xml-parser');

// Dispositivos DLNA na rede nao sao confiaveis (qualquer um pode responder ao
// SSDP search ou aparecer como controlUrl) — sem limite de tamanho e timeout,
// um device malicioso ou travado pode gotejar uma resposta infinita (esgota
// memoria) ou nunca fechar a conexao (vaza socket a cada busca/browse).
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8000;

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib
      .get(url, { timeout: REQUEST_TIMEOUT_MS }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(fetchText(res.headers.location));
          return;
        }
        let data = '';
        let bytes = 0;
        res.on('data', (c) => {
          bytes += c.length;
          if (bytes > MAX_RESPONSE_BYTES) {
            res.destroy();
            reject(new Error('Resposta do dispositivo DLNA excedeu o tamanho maximo permitido'));
            return;
          }
          data += c;
        });
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao consultar dispositivo DLNA')));
  });
}

function escapeXml(str) {
  return str.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function soapRequest(controlUrl, serviceType, action, args) {
  const argsXml = Object.entries(args)
    .map(([k, v]) => `<${k}>${escapeXml(String(v))}</${k}>`)
    .join('');
  const body = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="${serviceType}">${argsXml}</u:${action}>
  </s:Body>
</s:Envelope>`;

  return new Promise((resolve, reject) => {
    const url = new URL(controlUrl);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: 'POST',
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          SOAPAction: `"${serviceType}#${action}"`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        let bytes = 0;
        res.on('data', (c) => {
          bytes += c.length;
          if (bytes > MAX_RESPONSE_BYTES) {
            res.destroy();
            reject(new Error('Resposta do dispositivo DLNA excedeu o tamanho maximo permitido'));
            return;
          }
          data += c;
        });
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao consultar dispositivo DLNA')));
    req.write(body);
    req.end();
  });
}

async function discoverServers(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const client = new Client();
    const found = new Map();

    client.on('response', async (headers) => {
      const location = headers.LOCATION;
      if (!location || found.has(location)) return;
      found.set(location, null);
      try {
        const xml = await fetchText(location);
        const parser = new XMLParser({ ignoreAttributes: false });
        const desc = parser.parse(xml);
        const device = desc?.root?.device;
        if (!device) return;
        const serviceList = [].concat(device.serviceList?.service || []);
        const cds = serviceList.find((s) => (s.serviceType || '').includes('ContentDirectory'));
        if (!cds) return;
        const base = new URL(location);
        const controlUrl = new URL(cds.controlURL, base).toString();
        found.set(location, {
          name: device.friendlyName || location,
          location,
          controlUrl,
          serviceType: cds.serviceType,
        });
      } catch {
        // dispositivo nao respondeu com uma descricao valida, ignora
      }
    });

    client.search('urn:schemas-upnp-org:service:ContentDirectory:1');

    setTimeout(() => {
      client.stop();
      resolve([...found.values()].filter(Boolean));
    }, timeoutMs);
  });
}

async function browse(server, objectId = '0') {
  const xml = await soapRequest(server.controlUrl, server.serviceType, 'Browse', {
    ObjectID: objectId,
    BrowseFlag: 'BrowseDirectChildren',
    Filter: '*',
    StartingIndex: 0,
    RequestedCount: 200,
    SortCriteria: '',
  });

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const parsed = parser.parse(xml);
  const body = parsed?.['s:Envelope']?.['s:Body'];
  const result = body?.['u:BrowseResponse']?.Result;
  if (!result) return [];

  const didl = parser.parse(result);
  const container = [].concat(didl?.['DIDL-Lite']?.container || []);
  const item = [].concat(didl?.['DIDL-Lite']?.item || []);

  const folders = container
    .filter(Boolean)
    .map((c) => ({ type: 'folder', id: c['@_id'], title: c['dc:title'] }));

  const files = item
    .filter(Boolean)
    .map((i) => {
      const res = Array.isArray(i.res) ? i.res[0] : i.res;
      const url = typeof res === 'object' ? res['#text'] : res;
      return { type: 'file', id: i['@_id'], title: i['dc:title'], url };
    })
    .filter((f) => f.url);

  return [...folders, ...files];
}

module.exports = { discoverServers, browse };

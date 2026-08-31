const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 12000;
const UPSTREAM = process.env.UPSTREAM || 'http://localhost:20128';
// Pick the transport module matching the UPSTREAM protocol so https://
// upstreams (e.g. Render public URLs) work instead of throwing.
const ssl = UPSTREAM.startsWith('https://') ? https : http;
const API_KEY = process.env.API_KEY || '';
const USE_SSE = String(process.env.USE_SSE || '1');
// Allow cross-origin calls (e.g. the GitHub Pages statically-served UI) to reach
// this backend's /api/chat. Restrict with a specific origin for production if desired.
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';

// Upstream cadangan: Z.ai (GLM) — https://api.z.ai/api/paas/v4 (OpenAI-compatible).
// Dipakai hanya bila ZAI_API_KEY diisi; bila upstream utama gagal/401/5xx,
// request dicoba ulang ke Z.ai agar model GLM bisa melayani.



const ZAI_UPSTREAM = process.env.ZAI_UPSTREAM || 'https://api.z.ai/api/paas/v4';
const ZAI_API_KEY = process.env.ZAI_API_KEY || '';

// Zen memakai prefix /v1 di dasar URL; Z.ai memakai v4 langsung di jalur /api/.
function upstreamChatUrl(base) {
  if (base.endsWith('/v1/chat/completions') || base.endsWith('/chat/completions')) return base;
  if (base.endsWith('/v1')) return base + '/chat/completions';
  if (base.indexOf('/api/') !== -1) return base + '/chat/completions';
  return base + '/v1/chat/completions';
}
function upstreamModelsUrl(base) {
  if (base.endsWith('/v1/models') || base.endsWith('/models')) return base;
  if (base.endsWith('/v1')) return base + '/models';
  if (base.indexOf('/api/') !== -1) return base + '/models';
  return base + '/v1/models';
}

// Panggil satu upstream OpenAI-compatible dan kumpulkan seluruh body-nya.

function callUpstream(baseUrl, apiKey, payload, accept, timeoutMs, kind) {
  return new Promise(function (resolve, reject) {
    const transport = baseUrl.startsWith('https://') ? https : http;
    const headers = { 'content-type': 'application/json', 'accept': accept };
    if (apiKey) headers.authorization = 'Bearer ' + apiKey;
    const url = (kind === 'models') ? upstreamModelsUrl(baseUrl) : upstreamChatUrl(baseUrl);
    const req = transport.request(url, { method: (kind === 'models') ? 'GET' : 'POST', headers }, function (upRes) {
      const chunks = [];
      upRes.on('data', function (c) { chunks.push(c); });
      upRes.on('end', function () {
        resolve({ status: upRes.statusCode || ((kind === 'models') ? 200 : 502), headers: upRes.headers || {}, body: Buffer.concat(chunks) });
      });
    });
    req.on('error', reject);
    const timer = setTimeout(function () {
      req.destroy(new Error('upstream timeout'));
    }, timeoutMs);
    req.on('close', function () { clearTimeout(timer); });
    if (kind !== 'models') req.write(JSON.stringify(payload));
    req.end();
  });
}
const ROOT = __dirname;

const CORS_HEADERS = {
  'access-control-allow-origin': ALLOW_ORIGIN,
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization',
};

function applyCors(res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }
}
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

function serveStatic(res, urlPath) {
  let file = path.join(ROOT, path.normalize(urlPath));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function proxyOpenAI(req, res) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', async function () {
      const isStream = USE_SSE === '1';
      const clientAuth = req.headers.authorization || '';
      const authHeader = clientAuth || (API_KEY ? 'Bearer ' + API_KEY : '');
      const accept = isStream ? 'text/event-stream' : (req.headers.accept || 'application/json');
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));

      function sendResult(upRes) {
        const target = res;
        for (const [k, v] of Object.entries(upRes.headers)) {
          if (['transfer-encoding', 'connection'].indexOf(k.toLowerCase()) !== -1) continue;
          try { target.setHeader(k, v); } catch (_) {}
        }
        target.writeHead(upRes.status, { 'content-type': upRes.headers['content-type'] || 'application/json' });
        target.end(upRes.body);
      }

      // Coba upstream utama dulu; bila gagal (HTTP  4xx/5xx atau error
      // jaringan/timeout) dan ZAI_API_KEY tersedia, coba upstream Z.ai (GLM).
      const tryPrimary = await callUpstream(UPSTREAM, authHeader, payload, accept, 30000, 'chat').then(function (r) {
        return r;
      }).catch(function () { return null; });
      if (tryPrimary && tryPrimary.status >= 200 && tryPrimary.status < 300) {
        sendResult(tryPrimary); resolve(); return;
      }
      if (ZAI_API_KEY) {
        const tryZai = await callUpstream(ZAI_UPSTREAM, ZAI_API_KEY, payload, accept, 30000, 'chat').then(function (r) {
          return r;
        }).catch(function () { return null; });
        if (tryZai && tryZai.status >= 200 && tryZai.status < 300) {
          sendResult(tryZai); resolve(); return;
        }
      }
      // Semua upstream gagal — kirimkan hasil upstream utama bila ada.



      const fallback = tryPrimary || { status: 502, headers: {}, body: Buffer.from(JSON.stringify({ error: { message: 'Upstream error: semua upstream gagal' } })) };
      res.writeHead(fallback.status, { 'content-type': fallback.headers['content-type'] || 'application/json' });
      res.end(fallback.body);
      resolve();
    });
    req.on('error', reject);
  });
}
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, 'http://localhost');
  const urlPath = reqUrl.pathname;

  if (req.method === 'OPTIONS') {
    // CORS preflight
    applyCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method === 'POST' && urlPath === '/api/chat') {
      applyCors(res);
      await proxyOpenAI(req, res);
    } else if (req.method === 'GET' && urlPath === '/api/models') {
      applyCors(res);
      const mkRes = function (upRes) {
        res.writeHead(upRes.status, { 'content-type': upRes.headers['content-type'] || 'application/json' });
        res.end(upRes.body);
      };
      callUpstream(UPSTREAM, '', null, 'application/json', 15000, 'models').then(async function (primary) {
        if (primary && primary.status >= 200 && primary.status < 300) {
          mkRes(primary); return;
        }
        if (ZAI_API_KEY) {
          const zai = await callUpstream(ZAI_UPSTREAM, ZAI_API_KEY, null, 'application/json', 15000, 'models').catch(function () { return null; });
          if (zai && zai.status >= 200 && zai.status < 300) {
            mkRes(zai); return;
          }
        }
        if (primary) {
          mkRes(primary); return;
        }
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [] }));
      }).catch(function () {
        if (!res.headersSent) {
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ data: [] }));
        }
      });
    } else if (req.method === 'GET') {
      serveStatic(res, urlPath === '/' ? '/index.html' : urlPath);
    } else {
      res.writeHead(405); res.end('Method not allowed');
    }
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: e.message } }));
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Marbel AI UI listening on http://0.0.0.0:${PORT} (proxy -> ${UPSTREAM})`);
});

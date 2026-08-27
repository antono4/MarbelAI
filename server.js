const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 12000;
const UPSTREAM = process.env.UPSTREAM || 'http://localhost:20128';
const API_KEY = process.env.API_KEY || '';
const USE_SSE = String(process.env.USE_SSE || '1');
// Allow cross-origin calls (e.g. the GitHub Pages statically-served UI) to reach
// this backend's /api/chat. Restrict with a specific origin for production if desired.
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';

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
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const isStream = USE_SSE === '1';
      const clientAuth = req.headers.authorization || '';
      const headers = {
        'content-type': 'application/json',
        'authorization': clientAuth || (API_KEY ? 'Bearer ' + API_KEY : ''),
        'accept': isStream ? 'text/event-stream' : (req.headers.accept || 'application/json'),
      };
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const upstreamReq = http.request(
        UPSTREAM + '/v1/chat/completions',
        { method: 'POST', headers },
        (upRes) => {
          const target = res;
          for (const [k, v] of Object.entries(upRes.headers)) {
            if (['transfer-encoding', 'connection'].includes(k.toLowerCase())) continue;
            try { target.setHeader(k, v); } catch (_) {}
          }
          target.writeHead(upRes.statusCode || 502);
          upRes.pipe(target);
          upRes.on('end', resolve);
        }
      );
      upstreamReq.on('error', (e) => {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Upstream error: ' + e.message } }));
        resolve();
      });
      upstreamReq.write(JSON.stringify(payload));
      upstreamReq.end();
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
      http.get(UPSTREAM + '/v1/models', { headers: { accept: 'application/json' } }, (upRes) => {
        res.writeHead(upRes.statusCode || 200, { 'content-type': 'application/json' });
        upRes.pipe(res);
      }).on('error', () => {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [] }));
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
  console.log(`9Router UI listening on http://0.0.0.0:${PORT} (proxy -> ${UPSTREAM})`);
});
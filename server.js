const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 12000;
// Upstream OpenAI-compatible — model gratis dari daftar no-cost-ai, tanpa API
// key. Sama dengan MarbelAIv2.1: uncloseai + pollinations + Free.ai.
const UPSTREAM = process.env.UPSTREAM || 'https://hermes.ai.unturf.com,https://qwen.ai.unturf.com,https://text.pollinations.ai,https://api.free.ai';
// Pick the transport module matching the UPSTREAM protocol so https://
// upstreams (e.g. Render public URLs) work instead of throwing.
const ssl = UPSTREAM.startsWith('https://') ? https : http;

// Pemetaan model per upstream, agar failover tetap menghasilkan jawaban saat
// model UI (mis. qwen3.8-27b) tidak dikenal di provider berikutnya.
// uncloseai kini hanya melayani satu model: turboderp/Qwen3.8-27B-exl3.
const UNCLOSEAI_MODEL = 'turboderp/Qwen3.8-27B-exl3';
const UPSTREAM_MODEL_MAP = {
  'https://hermes.ai.unturf.com': { 'qwen3.8-27b': UNCLOSEAI_MODEL, 'gpt-oss-20b': UNCLOSEAI_MODEL, 'qwen3-8b': UNCLOSEAI_MODEL },
  'https://qwen.ai.unturf.com': { 'qwen3.8-27b': UNCLOSEAI_MODEL, 'gpt-oss-20b': UNCLOSEAI_MODEL, 'qwen3-8b': UNCLOSEAI_MODEL },
  'https://text.pollinations.ai': { 'qwen3.8-27b': 'openai', 'gpt-oss-20b': 'openai', 'qwen3-8b': 'openai' },
  'https://api.free.ai': { 'qwen3.8-27b': 'qwen7b', 'gpt-oss-20b': 'qwen7b', 'qwen3-8b': 'qwen3-8b' },
};
// Payload tambahan per upstream: uncloseai memakai vLLM/Qwen yang andai berpikir,
// matikan agar jawaban bersih (tidak dicampur proses berpikir).
const UPSTREAM_PAYLOAD = {
  'https://hermes.ai.unturf.com': { chat_template_kwargs: { enable_thinking: false } },
  'https://qwen.ai.unturf.com': { chat_template_kwargs: { enable_thinking: false } },
};
// Daftar upstream (dipisah koma) dicoba berurutan; helper di bawah dipakai
// bersama oleh proxy chat, /api/models, dan DoLa.
function upstreamList() {
  return UPSTREAM.split(',').map(function (u) { return u.trim(); }).filter(Boolean);
}
function firstUpstream() {
  return upstreamList()[0] || UPSTREAM;
}
function mapModel(base, model) {
  return (UPSTREAM_MODEL_MAP[base] && UPSTREAM_MODEL_MAP[base][model]) || model;
}
const API_KEY = process.env.API_KEY || '';
const USE_SSE = String(process.env.USE_SSE || '1');
// Daftar model yang disajikan /api/models dan ditampilkan UI (disamakan dengan
// MarbelAIv2.1). Bukan daftar upstream, agar namanya konsisten.
const MODELS_LIST = (
  process.env.MODELS_LIST || 'qwen3.8-27b,gpt-oss-20b,qwen3-8b'
).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
// Allow cross-origin calls (e.g. the GitHub Pages statically-served UI) to reach
// this backend's /api/chat. Restrict with a specific origin for production if desired.
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';

// Upstream cadangan: Z.ai (GLM) — https://api.z.ai/api/paas/v4 (OpenAI-compatible).
// Dipakai hanya bila ZAI_API_KEY diisi; bila upstream utama gagal/401/5xx,
// request dicoba ulang ke Z.ai agar model GLM bisa melayani.



const ZAI_UPSTREAM = process.env.ZAI_UPSTREAM || 'https://api.z.ai/api/paas/v4';
const ZAI_API_KEY = process.env.ZAI_API_KEY || '';

// --- DoLa (Decoding by Contrasting Layers) ----------------------------
// Inti paper arXiv:2309.03883 diadaptasi ke level token di atas `logprobs`
// API (lihat dola.js). Nonaktif secara default; nyalakan dengan DOLA_ENABLED=1.
const dola = require('./dola.js');
const DOLA_ENABLED = String(process.env.DOLA_ENABLED || '0') === '1';
const DOLA_MATURE_MODEL = process.env.DOLA_MATURE_MODEL || 'glm-4.7-flash';
const DOLA_PREMATURE_MODEL = process.env.DOLA_PREMATURE_MODEL || 'qwen3-8b';
const DOLA_ALPHA = Number(process.env.DOLA_ALPHA || '0.1');
const DOLA_RP = Number(process.env.DOLA_REPETITION_PENALTY || '1.2');
const DOLA_TOP_LOGPROBS = Number(process.env.DOLA_TOP_LOGPROBS || '20');

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
// --- DoLa: dekode kontras dua model ------------------------------------
// Panggil satu model dengan logprobs dan kembalikan {text, logprobs}.
async function callWithLogprobs(base, apiKey, payload, model, timeoutMs) {
  const p = Object.assign({}, payload, {
    model: model,
    stream: false,
    logprobs: true,
    top_logprobs: DOLA_TOP_LOGPROBS,
  });
  delete p.dola; delete p.marbel_dola;
  const r = await callUpstream(base, apiKey, p, 'application/json', timeoutMs, 'chat');
  if (!r || r.status < 200 || r.status >= 300) return null;
  let data;
  try { data = JSON.parse(r.body.toString('utf8')); } catch (_) { return null; }
  const choice = data && data.choices && data.choices[0];
  if (!choice || !choice.message) return null;
  const text = choice.message.content || choice.message.reasoning_content || '';
  if (!text || !text.trim()) return null;
  return { text: text, logprobs: choice.logprobs || null };
}

// Jalankan DoLa: dapatkan logprobs dari model mature & premature, lalu
// kontraskan (dola.dolaDecode). Mengembalikan objek respons OpenAI-compatible
// atau null bila logprobs tidak tersedia (pemanggil lalu fallback).
async function runDola(payload, authHeader) {
  const zenKey = authHeader || '';
  const requested = (payload.model && payload.model !== 'semua') ? payload.model : null;
  // Model mature: pakai Z.ai (GLM) bila key tersedia, jika tidak pakai upstream
  // utama dengan model yang diminta user. Model premature selalu di upstream
  // utama (Zen). "semua" bukan model konkret sehingga diabaikan.
  const hasZai = !!ZAI_API_KEY;
  const matureBase = hasZai ? ZAI_UPSTREAM : firstUpstream();
  const matureKey = hasZai ? (ZAI_API_KEY || authHeader || '') : zenKey;
  const matureModel = hasZai ? (DOLA_MATURE_MODEL || requested) : (requested || DOLA_PREMATURE_MODEL);
  const prematureModel = requested || DOLA_PREMATURE_MODEL;
  if (!matureModel || !prematureModel) return null;
  const mature = await callWithLogprobs(matureBase, matureKey, payload, matureModel, 30000).catch(function () { return null; });
  if (!mature || !mature.logprobs) return null;
  const premature = await callWithLogprobs(firstUpstream(), zenKey, payload, prematureModel, 30000).catch(function () { return null; });

  let text = mature.text;
  let info = null;
  if (premature && premature.logprobs) {
    const decoded = dola.dolaDecode(mature.logprobs, premature.logprobs, {
      alpha: DOLA_ALPHA, repetitionPenalty: DOLA_RP,
    });
    if (decoded && decoded.text && decoded.text.trim()) {
      text = decoded.text;
      info = { changed: decoded.changed, meanJsd: decoded.meanJsd, aligned: decoded.aligned, tokens: decoded.tokens };
    }
  }
  return {
    id: 'dola-' + Date.now(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: matureModel + '+dola',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    marbel_dola: info || { changed: 0, meanJsd: 0, note: 'premature logprobs tidak tersedia' },
  };
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
      if (process.env.LOG_CHAT) {
        console.log('[chat]', new Date().toISOString(), 'model=' + (payload.model || '?'), 'msgs=' + ((payload.messages || []).length));
      }

      // Jalur DoLa: bila diaktifkan (env DOLA_ENABLED=1 atau payload.dola),
      // hasilkan jawaban lewat kontras dua model + logprobs. Bila gagal
      // (mis. provider tak mengirim logprobs), jatuh ke dekode biasa.
      const wantDola = (DOLA_ENABLED || payload.dola === true || payload.marbel_dola === true)
        && payload.stream !== true
        && Array.isArray(payload.messages) && payload.messages.length > 0;
      if (wantDola) {
        const dolaRes = await runDola(payload, authHeader).catch(function () { return null; });
        if (dolaRes) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(dolaRes));
          resolve();
          return;
        }
      }
      // Jangan teruskan flag internal ke upstream (bisa ditolak sebagai
      // parameter tak dikenal).
      delete payload.dola; delete payload.marbel_dola;

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
        // Daftar UPSTREAM boleh berisi beberapa URL dipisah koma: dicoba
        // berurutan supaya satu provider gratis yang sibuk/down tidak memblok.
        let tryPrimary = null;
        const upstreams = upstreamList();
        for (let ui = 0; ui < upstreams.length; ui++) {
          const base = upstreams[ui];
          const outPayload = Object.assign({}, payload, UPSTREAM_PAYLOAD[base] || {}, { model: mapModel(base, payload.model) });
          const r = await callUpstream(base, authHeader, outPayload, accept, 30000, 'chat').then(function (x) {
            return x;
          }).catch(function () { return null; });
          if (!tryPrimary) tryPrimary = r;
          if (r && r.status >= 200 && r.status < 300) {
            sendResult(r); resolve(); return;
          }
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
      // Daftar model statis (sama seperti MarbelAIv2.1), bukan dari upstream —
      // supaya UI menampilkan nama model yang konsisten (qwen3.8-27b, dst),
      // bukan nama internal provider (mis. turboderp/Qwen3.8-27B-exl3).
      const list = MODELS_LIST.map(function (id) { return { id: id, object: 'model' }; });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: list }));
    } else if (req.method === 'GET' && urlPath === '/api/status') {
      applyCors(res);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        zai: { available: !!ZAI_API_KEY },
        upstream: UPSTREAM,
        use_sse: USE_SSE === '1'
      }));
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

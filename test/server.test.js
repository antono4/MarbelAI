'use strict';
// Uji integrasi: jalankan server.js dengan upstream tiruan yang mengembalikan
// logprobs, lalu pastikan jalur DoLa mengontraskan dua model dengan benar.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const MATURE_MODEL = 'mock-mature';
const PREMATURE_MODEL = 'mock-premature';

// Distribusi tiruan: mature netral Seattle/Olympia; premature condong Seattle.
function makeLogprobs() {
  const toks = ['The', ' capital', ' is', ' Seattle', '.'];
  const top = [
    [{ token: 'The', logprob: 0 }],
    [{ token: ' capital', logprob: 0 }],
    [{ token: ' is', logprob: 0 }],
    [
      { token: ' Seattle', logprob: Math.log(0.5) },
      { token: ' Olympia', logprob: Math.log(0.5) },
    ],
    [{ token: '.', logprob: 0 }],
  ];
  const topPremature = JSON.parse(JSON.stringify(top));
  topPremature[3] = [
    { token: ' Seattle', logprob: Math.log(0.98) },
    { token: ' Olympia', logprob: Math.log(0.02) },
  ];
  return {
    content: toks.map((t, i) => ({ token: t, top_logprobs: top[i] })),
    prematureContent: toks.map((t, i) => ({ token: t, top_logprobs: topPremature[i] })),
  };
}

function startMock() {
  const lp = makeLogprobs();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.method === 'GET' && /models$/.test(req.url)) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ object: 'list', data: [{ id: MATURE_MODEL }, { id: PREMATURE_MODEL }] }));
        return;
      }
      let payload = {};
      try { payload = JSON.parse(body); } catch (_) {}
      const isMature = payload.model === MATURE_MODEL;
      const content = isMature
        ? 'The capital is Seattle.'
        : 'The capital is Seattle.';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{
          message: { role: 'assistant', content: content },
          logprobs: { content: isMature ? lp.content : lp.prematureContent },
        }],
      }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function startMarbel(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: Object.assign({}, process.env, env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const onData = (d) => {
      out += d.toString();
      if (/listening on/.test(out)) { child.stdout.off('data', onData); resolve(child); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('error', reject);
    setTimeout(() => reject(new Error('server tidak start: ' + out)), 8000);
  });
}

test('jalur DoLa mengontraskan dua model dan mengembalikan token hasil kontras', async () => {
  const mock = await startMock();
  const mockPort = mock.address().port;
  const marbelPort = 19871;
  const child = await startMarbel({
    PORT: String(marbelPort),
    UPSTREAM: 'http://127.0.0.1:' + mockPort,
    ZAI_UPSTREAM: 'http://127.0.0.1:' + mockPort + '/api/paas/v4',
    ZAI_API_KEY: 'test-key',
    DOLA_ENABLED: '1',
    DOLA_MATURE_MODEL: MATURE_MODEL,
    DOLA_PREMATURE_MODEL: PREMATURE_MODEL,
  });
  try {
    const res = await fetch('http://127.0.0.1:' + marbelPort + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'whatever', stream: false, dola: true, messages: [{ role: 'user', content: 'Ibu kota Washington?' }] }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.choices[0].message.content, 'The capital is Olympia.');
    assert.ok(data.marbel_dola, 'harus ada diagnostik marbel_dola');
    assert.strictEqual(data.marbel_dola.changed, 1);
    assert.ok(data.marbel_dola.meanJsd > 0);
  } finally {
    child.kill('SIGKILL');
    mock.close();
  }
});

test('tanpa DoLa, proxy meneruskan jawaban apa adanya', async () => {
  const mock = await startMock();
  const mockPort = mock.address().port;
  const marbelPort = 19872;
  const child = await startMarbel({
    PORT: String(marbelPort),
    UPSTREAM: 'http://127.0.0.1:' + mockPort,
    ZAI_UPSTREAM: 'http://127.0.0.1:' + mockPort + '/api/paas/v4',
    ZAI_API_KEY: '',
    DOLA_ENABLED: '0',
  });
  try {
    const res = await fetch('http://127.0.0.1:' + marbelPort + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: MATURE_MODEL, stream: false, messages: [{ role: 'user', content: 'hai' }] }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.choices[0].message.content, 'The capital is Seattle.');
    assert.strictEqual(data.marbel_dola, undefined);
  } finally {
    child.kill('SIGKILL');
    mock.close();
  }
});

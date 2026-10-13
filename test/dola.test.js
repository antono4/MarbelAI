'use strict';
const test = require('node:test');
const assert = require('node:assert');
const dola = require('../dola.js');

function dist(pairs) {
  const m = new Map();
  for (const [t, p] of pairs) m.set(t, p);
  return m;
}

test('logprobsToDist menormalkan distribusi', () => {
  const entry = { top_logprobs: [{ token: 'a', logprob: Math.log(0.5) }, { token: 'b', logprob: Math.log(0.5) }] };
  const d = dola.logprobsToDist(entry);
  assert.ok(Math.abs(d.get('a') - 0.5) < 1e-9);
  assert.ok(Math.abs(d.get('b') - 0.5) < 1e-9);
});

test('logprobsToDist mengembalikan null tanpa alternatif', () => {
  assert.strictEqual(dola.logprobsToDist({ top_logprobs: [] }), null);
  assert.strictEqual(dola.logprobsToDist(null), null);
});

test('jsd nol untuk distribusi identik dan simetris', () => {
  const a = dist([['x', 0.7], ['y', 0.3]]);
  const b = dist([['x', 0.7], ['y', 0.3]]);
  assert.ok(dola.jsd(a, b) < 1e-12);
  const c = dist([['x', 0.2], ['y', 0.8]]);
  assert.ok(dola.jsd(a, c) > 0);
  assert.ok(Math.abs(dola.jsd(a, c) - dola.jsd(c, a)) < 1e-12);
});

test('plausibleHead menerapkan APC alpha', () => {
  const mature = dist([['x', 0.6], ['y', 0.3], ['z', 0.1]]);
  const head = dola.plausibleHead(mature, 0.5); // ambang 0.3
  assert.ok(head.has('x'));
  assert.ok(head.has('y'));
  assert.ok(!head.has('z'));
  assert.ok(Math.abs(head.get('x') - 0.6) < 1e-12);
});

test('contrastAtPos memberi skor positif untuk token yang menguat di mature', () => {
  const mature = dist([['Olympia', 0.5], ['Seattle', 0.5]]);
  const premature = dist([['Olympia', 0.05], ['Seattle', 0.95]]);
  const scores = dola.contrastAtPos(mature, premature, 0.1);
  const olympia = scores.find((s) => s.token === 'Olympia');
  const seattle = scores.find((s) => s.token === 'Seattle');
  assert.ok(olympia.score > 0);
  assert.ok(seattle.score < 0);
  assert.strictEqual(scores[0].token, 'Olympia'); // terurut menurun
});

test('dolaContrast menolak logprobs yang tidak sejajar', () => {
  const a = { content: [{ token: 'a', top_logprobs: [{ token: 'a', logprob: -0.1 }] }] };
  const b = { content: [{ token: 'b', top_logprobs: [{ token: 'b', logprob: -0.1 }] }] };
  assert.strictEqual(dola.dolaContrast(a, b, {}), null);
});

test('dolaContrast memilih token dengan kontras terkuat per posisi', () => {
  const mk = (tok, alt) => ({
    content: [{ token: tok, top_logprobs: [{ token: tok, logprob: alt[0] }, { token: alt[2], logprob: alt[1] }] }],
  });
  // mature: 'benar' 0.9 vs 'salah' 0.1 ; premature: 'benar' 0.1 vs 'salah' 0.9
  const mature = mk('benar', [Math.log(0.9), Math.log(0.1), 'salah']);
  const premature = mk('benar', [Math.log(0.1), Math.log(0.9), 'salah']);
  const r = dola.dolaContrast(mature, premature, { alpha: 0.1 });
  assert.ok(r);
  assert.strictEqual(r.positions[0].chosen.token, 'benar');
  assert.strictEqual(r.positions[0].emitted, 'benar');
  assert.ok(r.meanJsd > 0);
});

test('pickContrastedToken menurunkan skor token yang berulang', () => {
  const scores = [{ token: 'a', score: 1.0 }, { token: 'b', score: 0.9 }];
  const chosen = dola.pickContrastedToken(scores, 1.2, new Set(['a']));
  assert.strictEqual(chosen.token, 'b');
});

test('lcsAlign memasangkan token yang sama secara berurutan', () => {
  const a = [{ token: 'a' }, { token: 'b' }, { token: 'c' }];
  const b = [{ token: 'a' }, { token: 'x' }, { token: 'c' }];
  const pairs = dola.lcsAlign(a, b);
  assert.deepStrictEqual(pairs, [[0, 0], [2, 2]]);
});

test('tokenEntries membaca format content (chat completions)', () => {
  const lp = { content: [{ token: 'Hi', top_logprobs: [{ token: 'Hi', logprob: -0.1 }] }] };
  const e = dola.tokenEntries(lp);
  assert.strictEqual(e.length, 1);
  assert.strictEqual(e[0].token, 'Hi');
});

test('tokenEntries membaca format tokens (legacy completions)', () => {
  const lp = { tokens: ['Hi', '!'], top_logprobs: [{ Hi: -0.1, Hello: -2 }, { '!': -0.2 }] };
  const e = dola.tokenEntries(lp);
  assert.strictEqual(e.length, 2);
  assert.strictEqual(e[0].top.length, 2);
});

test('dolaDecode mengganti token hanya pada posisi yang selaras', () => {
  // A (mature): "The capital is Seattle ." ; B (premature): "The capital is Seattle ."
  // Distribusi mature menaikkan "Olympia", premature menaikkan "Seattle".
  const lp = (toks, top) => ({ content: toks.map((t, i) => ({ token: t, top_logprobs: top[i] })) });
  const topMature = [
    [{ token: 'The', logprob: 0 }, { token: 'the', logprob: -3 }],
    [{ token: ' capital', logprob: 0 }, { token: ' capitol', logprob: -3 }],
    [{ token: ' is', logprob: 0 }, { token: ' was', logprob: -3 }],
    [{ token: ' Seattle', logprob: Math.log(0.5) }, { token: ' Olympia', logprob: Math.log(0.5) }],
    [{ token: '.', logprob: 0 }, { token: '!', logprob: -3 }],
  ];
  const topPremature = [
    [{ token: 'The', logprob: 0 }, { token: 'the', logprob: -3 }],
    [{ token: ' capital', logprob: 0 }, { token: ' capitol', logprob: -3 }],
    [{ token: ' is', logprob: 0 }, { token: ' was', logprob: -3 }],
    [{ token: ' Seattle', logprob: Math.log(0.98) }, { token: ' Olympia', logprob: Math.log(0.02) }],
    [{ token: '.', logprob: 0 }, { token: '!', logprob: -3 }],
  ];
  const mature = lp(['The', ' capital', ' is', ' Seattle', '.'], topMature);
  const premature = lp(['The', ' capital', ' is', ' Seattle', '.'], topPremature);
  const out = dola.dolaDecode(mature, premature, { alpha: 0.1 });
  assert.ok(out);
  // " Seattle" turun, " Olympia" naik -> kontras memilih Olympia.
  assert.strictEqual(out.text, 'The capital is Olympia.');
  assert.strictEqual(out.changed, 1);
  assert.ok(out.meanJsd > 0);
});

test('dolaDecode mengembalikan teks mature utuh bila tidak ada logprobs premature', () => {
  const mature = { content: [{ token: 'Halo', top_logprobs: [{ token: 'Halo', logprob: -0.1 }] }, { token: '!', top_logprobs: [{ token: '!', logprob: -0.1 }] }] };
  const out = dola.dolaDecode(mature, null, {});
  assert.strictEqual(out.text, 'Halo!');
  assert.strictEqual(out.changed, 0);
});

test('dolaDecode mengembalikan null tanpa logprobs mature', () => {
  assert.strictEqual(dola.dolaDecode(null, null, {}), null);
  assert.strictEqual(dola.dolaDecode({ content: [] }, null, {}), null);
});

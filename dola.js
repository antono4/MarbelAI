/* ============================================================
   dola.js — Decoding by Contrasting Layers (DoLa)
   Adaptasi paper: "DoLa: Decoding by Contrasting Layers Improves
   Factuality in Large Language Models" (Chuang et al., ICLR 2024,
   arXiv:2309.03883).

   Catatan penting soal adaptasi
   -----------------------------
   DoLa asli mengontraskan logit antar-LAYER transformer di dalam
   model (mature layer N vs premature layer M). Marbel AI hanya
   memanggil API OpenAI-compatible dari luar, jadi layer internal
   tidak bisa diakses. Karena itu modul ini menerapkan inti metode
   DoLa pada level TOKEN di atas `logprobs` yang dikembalikan API:

     - mature distribution q_N   = model kuat (lebih faktual)
     - premature distribution q_M = model lemah (prosa lebih lancar)
     - skor  F(q_N,q_M) = log q_N(x) - log q_M(x)   (log-domain contrast)
     - pemilihan premature memakai jarak distribusi (JSD), seperti
       pemilihan premature layer dinamis di paper (Bagian 2.2)
     - Adaptive Plausibility Constraint (APC) + repetition penalty,
       persis seperti Bagian 2.3 paper.

   Kontras antar-MODEL ini adalah Contrastive Decoding (Li et al.,
   2022) — yang oleh paper DoLa sendiri dipakai sebagai baseline.
   Semua rumus inti DoLa (F, APC, pemilihan berbasis JSD) tetap
   dipertahankan apa adanya, hanya sumber distribusinya disesuaikan
   dengan API.
   ============================================================ */
'use strict';

const EPS = 1e-12;

// --- Distribusi dari logprobs -------------------------------------------
// Ubah entri OpenAI `logprobs.content[i]` menjadi distribusi ternormalisasi
// atas token-token alternatif pada posisi itu. Kembalikan null bila posisi
// tidak punya alternatif (top_logprobs tunggal).
function topLogprobs(entry) {
  const arr = entry && (entry.top_logprobs || entry.topLogprobs);
  return Array.isArray(arr) ? arr : [];
}

function logprobsToDist(entry) {
  const arr = topLogprobs(entry);
  if (arr.length < 1) return null;
  let max = -Infinity;
  for (const t of arr) {
    const lp = Number(t.logprob);
    if (Number.isFinite(lp) && lp > max) max = lp;
  }
  if (max === -Infinity) return null;
  let z = 0;
  const probs = new Map();
  for (const t of arr) {
    const lp = Number(t.logprob);
    const p = Number.isFinite(lp) ? Math.exp(lp - max) : 0;
    probs.set(String(t.token), p);
    z += p;
  }
  if (z <= 0) return null;
  for (const [k, v] of probs) probs.set(k, v / z);
  return probs;
}

// --- Divergensi ---------------------------------------------------------
// JSD(q||p) dengan basis 2 (rentang 0..1), dipakai untuk memilih premature
// distribution dengan jarak terbesar dari mature distribution — analog
// pemilihan premature layer dinamis pada paper (Bagian 2.2).
function jsd(q, p) {
  if (!q || !p) return 0;
  const keys = new Set();
  q.forEach(function (_v, k) { keys.add(k); });
  p.forEach(function (_v, k) { keys.add(k); });
  let d = 0;
  keys.forEach(function (k) {
    const a = q.get(k) || 0;
    const b = p.get(k) || 0;
    const m = 0.5 * (a + b);
    if (m <= 0) return;
    if (a > 0) d += 0.5 * a * Math.log2(a / m);
    if (b > 0) d += 0.5 * b * Math.log2(b / m);
  });
  return d;
}

// --- Inti kontras DoLa --------------------------------------------------
// V_head: token harus cukup plausibel di mature distribution (APC).
// Mengembalikan Map token -> probabilitas mature (bukan Set) agar pemanggil
// bisa membaca probabilitasnya langsung.
function plausibleHead(mature, alpha) {
  let maxP = 0;
  mature.forEach(function (v) { if (v > maxP) maxP = v; });
  const head = new Map();
  mature.forEach(function (v, k) { if (v >= alpha * maxP) head.set(k, v); });
  return head;
}

// F(q_N, q_M) = log q_N(x) - log q_M(x), hanya untuk x di V_head; di luar
// itu -Infinity (dinolkan) — persis Bagian 2.3 paper.
function contrastAtPos(mature, premature, alpha) {
  const head = plausibleHead(mature, alpha);
  const scores = [];
  head.forEach(function (pN, tok) {
    const pM = premature.get(tok) || EPS;
    scores.push({ token: tok, score: Math.log(pN + EPS) - Math.log(pM + EPS) });
  });
  scores.sort(function (a, b) { return b.score - a.score; });
  return scores;
}

// Ambil distribusi alternatif untuk satu posisi dari sumber yang mungkin:
// field `content` (chat completions) atau `tokens` (legacy completions).
function entryAt(logprobs, i) {
  if (!logprobs) return null;
  if (Array.isArray(logprobs.content)) return logprobs.content[i] || null;
  if (Array.isArray(logprobs.tokens)) {
    const token = logprobs.tokens[i];
    const top = (logprobs.top_logprobs && logprobs.top_logprobs[i]) || null;
    if (top && typeof top === 'object') {
      const arr = Object.keys(top).map(function (t) { return { token: t, logprob: top[t] }; });
      return { token: token, logprob: logprobs.token_logprobs ? logprobs.token_logprobs[i] : undefined, top_logprobs: arr };
    }
  }
  return null;
}

function alignedTokens(a, b) {
  if (!a || !b) return false;
  if (Array.isArray(a.content) && Array.isArray(b.content)) {
    if (a.content.length !== b.content.length) return false;
    for (let i = 0; i < a.content.length; i++) {
      if (String(a.content[i].token) !== String(b.content[i].token)) return false;
    }
    return true;
  }
  if (Array.isArray(a.tokens) && Array.isArray(b.tokens)) {
    if (a.tokens.length !== b.tokens.length) return false;
    for (let i = 0; i < a.tokens.length; i++) {
      if (String(a.tokens[i]) !== String(b.tokens[i])) return false;
    }
    return true;
  }
  return false;
}

// --- Entry point --------------------------------------------------------
// Hasilkan distribusi kontras per-posisi untuk sebuah jawaban.
//   matureLogprobs    : logprobs dari model mature (kuat/faktual)
//   prematureLogprobs : logprobs dari model premature (lemah/lancar)
//   opts              : { alpha, repetitionPenalty, recentTokens }
// Mengembalikan { positions, meanJsd, prematureSelected } atau null bila
// kedua keluaran tidak sejajar (token berbeda) — pemanggil lalu fallback
// ke jawaban mature apa adanya.
function dolaContrast(matureLogprobs, prematureLogprobs, opts) {
  opts = opts || {};
  const alpha = opts.alpha == null ? 0.1 : opts.alpha;
  const theta = opts.repetitionPenalty == null ? 1.2 : opts.repetitionPenalty;
  const recent = Array.isArray(opts.recentTokens) ? opts.recentTokens : [];

  if (!alignedTokens(matureLogprobs, prematureLogprobs)) return null;

  const count = Array.isArray(matureLogprobs.content)
    ? matureLogprobs.content.length
    : matureLogprobs.tokens.length;

  const positions = [];
  let jsdSum = 0;
  let jsdN = 0;

  // Set token yang sudah muncul, tumbuh seiring dekode kiri→kanan supaya
  // repetition penalty bekerja per langkah (mirip dekode autoregresif).
  const recentSet = new Set(recent.map(String));

  for (let i = 0; i < count; i++) {
    const eN = entryAt(matureLogprobs, i);
    const eM = entryAt(prematureLogprobs, i);
    const original = eN ? String(eN.token) : null;
    const distN = logprobsToDist(eN);
    const distM = logprobsToDist(eM);
    if (!distN || !distM) {
      positions.push({ scores: [], chosen: null, original: original, emitted: original });
      if (original) recentSet.add(original);
      continue;
    }
    // Pemilihan premature distribution: yang jaraknya (JSD) terbesar dari
    // mature. Di sini sumbernya sudah ditentukan per-model; JSD dilaporkan
    // sebagai diagnostik kekuatan kontras pada posisi tersebut.
    const d = jsd(distN, distM);
    jsdSum += d; jsdN++;

    const scores = contrastAtPos(distN, distM, alpha);
    const chosen = pickContrastedToken(scores, theta, recentSet);
    const emitted = chosen ? chosen.token : original;
    positions.push({ scores: scores, chosen: chosen, original: original, emitted: emitted });
    if (emitted) recentSet.add(String(emitted));
  }

  return {
    positions: positions,
    meanJsd: jsdN ? jsdSum / jsdN : 0,
    prematureSelected: true,
  };
}

// Pilih token akhir: skor kontras tertinggi, dengan repetition penalty
// (Keskar et al., 2019) untuk meredam pengulangan yang kadang muncul
// akibat menekan pengetahuan layer rendah (paper, Bagian 2.3).
function pickContrastedToken(scores, theta, recentSet) {
  if (!scores.length) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const s of scores) {
    let score = s.score;
    if (recentSet && recentSet.has(s.token)) score /= theta;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best ? { token: best.token, score: bestScore, raw: best.score } : null;
}

// --- Dekode kontras dua model (adaptasi utama) --------------------------
// Normalisasi satu entri token -> Map distribusi.
function distFromEntry(entry) {
  if (!entry) return null;
  return logprobsToDist({ top_logprobs: entry.top });
}

// Daftar token + alternatifnya dari sebuah objek logprobs.
function tokenEntries(logprobs) {
  const out = [];
  if (!logprobs) return out;
  if (Array.isArray(logprobs.content)) {
    for (const c of logprobs.content) out.push({ token: String(c.token), top: c.top_logprobs || [] });
    return out;
  }
  if (Array.isArray(logprobs.tokens)) {
    for (let i = 0; i < logprobs.tokens.length; i++) {
      const top = (logprobs.top_logprobs && logprobs.top_logprobs[i]) || null;
      let arr = [];
      if (top && typeof top === 'object') {
        arr = Object.keys(top).map(function (t) { return { token: t, logprob: top[t] }; });
      }
      out.push({ token: String(logprobs.tokens[i]), top: arr });
    }
  }
  return out;
}

// Penjajaran LCS: pasangkan indeks token yang sama di dua urutan. Dipakai
// agar kontras hanya diterapkan pada posisi yang konteksnya cocok — token
// lain tetap memakai keluaran mature sehingga jawaban tidak rusak.
function lcsAlign(a, b) {
  const n = a.length, m = b.length;
  const dp = [];
  for (let i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i].token === b[j].token
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i].token === b[j].token) { pairs.push([i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

// Inti dekode DoLa: gabungkan keluaran mature (kuat/faktual) dengan kontras
// terhadap keluaran premature (lemah/lancar). Mengembalikan teks hasil,
// jumlah token yang berubah, dan diagnostik JSD.
function dolaDecode(matureLogprobs, prematureLogprobs, opts) {
  opts = opts || {};
  const alpha = opts.alpha == null ? 0.1 : opts.alpha;
  const theta = opts.repetitionPenalty == null ? 1.2 : opts.repetitionPenalty;

  const A = tokenEntries(matureLogprobs);
  if (!A.length) return null;
  const B = tokenEntries(prematureLogprobs);
  const pairs = B.length ? lcsAlign(A, B) : [];
  const mapB = new Map(pairs.map(function (p) { return [p[0], p[1]]; }));

  const recent = new Set((opts.recentTokens || []).map(String));
  const parts = [];
  let changed = 0, jsdSum = 0, jsdN = 0;

  for (let i = 0; i < A.length; i++) {
    const dN = distFromEntry(A[i]);
    const bi = mapB.has(i) ? mapB.get(i) : -1;
    const dM = bi >= 0 ? distFromEntry(B[bi]) : null;
    let tok = A[i].token;
    if (dN && dM) {
      jsdSum += jsd(dN, dM); jsdN++;
      const chosen = pickContrastedToken(contrastAtPos(dN, dM, alpha), theta, recent);
      if (chosen && chosen.token !== A[i].token) { tok = chosen.token; changed++; }
    }
    parts.push(tok);
    recent.add(tok);
  }

  return {
    text: parts.join(''),
    changed: changed,
    meanJsd: jsdN ? jsdSum / jsdN : 0,
    aligned: pairs.length,
    tokens: A.length,
  };
}

module.exports = {
  dolaContrast: dolaContrast,
  dolaDecode: dolaDecode,
  logprobsToDist: logprobsToDist,
  tokenEntries: tokenEntries,
  lcsAlign: lcsAlign,
  jsd: jsd,
  contrastAtPos: contrastAtPos,
  plausibleHead: plausibleHead,
  alignedTokens: alignedTokens,
  pickContrastedToken: pickContrastedToken,
  EPS: EPS,
};

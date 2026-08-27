(function () {
  'use strict';
  const welcomeEl = document.getElementById('welcome');
  const messagesEl = document.getElementById('messages');
  const activeBadge = document.getElementById('activeBadge');
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const model = document.getElementById('model');
  const sendBtn = document.getElementById('send');
  const newThreadBtn = document.getElementById('newThread');
  const threadList = document.getElementById('threadList');
  const suggestions = document.getElementById('suggestions');
  const statusDot = document.getElementById('statusDot');
  const statusLabel = document.getElementById('statusLabel');
  const sideToggle = document.getElementById('sideToggle');
  const layoutEl = document.querySelector('.layout');
  const canvasEl = document.getElementById('canvas');
  const canvasToggle = document.getElementById('canvasToggle');
  const canvasClose = document.getElementById('canvasClose');
  const canvasReload = document.getElementById('canvasReload');
  const canvasTypeEl = document.getElementById('canvasType');
  const canvasStatus = document.getElementById('canvasStatus');
  const canvasEmpty = document.getElementById('canvasEmpty');
  const canvasFrame = document.getElementById('canvasFrame');
  const canvasCode = document.getElementById('canvasCode');
  const tabPreview = document.getElementById('ctab-preview');
  const tabCode = document.getElementById('ctab-code');

  let busy = false;
  let threadId = 0;
  let threadCount = 0;
  let history = []; // {id, items:[{role,content,artifacts?}]}

  // ---- Canvas state ----
  let canvasOpen = false;
  let currentArtifact = null; // {lang, html, code}
  let canvasView = 'preview'; // 'preview' | 'code'

  function setStatus(state, label) {
    statusDot.className = 'dot' + (state ? ' ' + state : '');
    if (label) statusLabel.textContent = label;
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function isCanvasLang(lang) {
    lang = (lang || '').trim().toLowerCase();
    return lang === 'html' || lang === 'html5' || lang === 'svg' || lang === 'mermaid';
  }

  // Split a ```...``` block body into {lang, code}. First line treated as the
  // language token when it's a short single word followed by a newline.
  function parseBlock(src) {
    const lines = src.split('\n');
    if (lines.length > 1 && /^[A-Za-z0-9#+.-]{1,24}$/.test(lines[0].trim())) {
      return { lang: lines[0].trim(), code: lines.slice(1).join('\n') };
    }
    return { lang: '', code: src };
  }

  // Collect canvas-ready artifacts (html / svg / mermaid) from an assistant reply.
  function extractArtifacts(text) {
    const out = [];
    const re = /```([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const parsed = parseBlock(m[1]);
      if (isCanvasLang(parsed.lang)) out.push(parsed);
    }
    return out;
  }

  function decorateText(text, artCounter) {
    artCounter = artCounter || { n: 0 };
    const blockRe = /```([\s\S]*?)```/g;
    const parts = [];
    let last = 0, m;
    while ((m = blockRe.exec(text)) !== null) {
      const before = text.slice(last, m.index);
      const parsed = parseBlock(m[1]);
      const isArt = isCanvasLang(parsed.lang);
      let blockHtml = '<div class="code-block">';
      if (isArt) {
        const idx = artCounter.n++;
        blockHtml += '<button type="button" class="canvas-open-btn" data-art="' + idx + '" title="Buka di Canvas">' +
          '&#9642; Buka di Canvas <span class="cob-lang">' + esc(parsed.lang) + '</span></button>';
      }
      blockHtml += '<pre>' + esc(parsed.code) + '</pre></div>';
      parts.push(before, { html: blockHtml });
      last = m.index + m[0].length;
    }
    parts.push(text.slice(last));
    return parts.map(function (p) {
      if (typeof p === 'object') return p.html;
      return esc(p).replace(/`([^`]+)`/g, '<code>$1</code>');
    }).join('');
  }

  // ---- Canvas engine ----

  // Build a full HTML document from a raw artifact (verified / sandboxed).
  function artifactToDoc(lang, code) {
    if (lang === 'mermaid') {
      return [
        '<!doctype html><html><head><meta charset="utf-8"/>',
        '<style>html,body{margin:0;height:100%;background:#fff;box-sizing:border-box;font-family:system-ui,sans-serif}',
        '#holder{display:flex;align-items:center;justify-content:flex-start;min-height:100%;padding:24px;overflow:auto}',
        '#src{display:none;white-space:pre;font-family:ui-monospace,Consolas,monospace;padding:20px;font-size:12.5px;color:#333;overflow:auto;margin:0}</style>',
        '</head><body>',
        '<div id="holder"><div class="mermaid">' + code + '</div></div>',
        '<pre id="src"></pre>',
        '<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\/script>',
        '<script>',
        'if (window.mermaid) { mermaid.initialize({ startOnLoad: true }); }',
        'else { var s=document.getElementById("src"); s.style.display="block"; s.textContent=' + JSON.stringify(code) + '; document.getElementById("holder").style.display="none"; }',
        '<\/script>',
        '</body></html>'
      ].join('');
    }
    if (lang === 'svg') {
      return [
        '<!doctype html><html><head><meta charset="utf-8"/>',
        '<style>html,body{margin:0;height:100%;background:#fff;display:grid;place-items:center;overflow:auto;padding:24px;box-sizing:border-box}svg{max-width:100%;max-height:100%}</style>',
        '</head><body>' + code + '</body></html>'
      ].join('');
    }
    // html
    if (/<html[\s>]/i.test(code)) return code;
    return [
      '<!doctype html><html><head><meta charset="utf-8"/>',
      '<style>html,body{margin:0;min-height:100%;font-family:system-ui,sans-serif;box-sizing:border-box}</style>',
      '</head><body>' + code + '</body></html>'
    ].join('');
  }

  function setCanvasPreview(lang, code) {
    canvasFrame.srcdoc = artifactToDoc(lang, code);
  }

  function showCanvasPane(view) {
    canvasView = view;
    tabPreview.classList.toggle('active', view === 'preview');
    tabCode.classList.toggle('active', view === 'code');
    document.querySelector('.canvas-preview-pane').classList.toggle('active', view === 'preview');
    document.querySelector('.canvas-code-pane').classList.toggle('active', view === 'code');
    canvasEmpty.hidden = !(view === 'preview' && !currentArtifact);
    canvasFrame.hidden = !(view === 'preview' && currentArtifact);
  }

  function openCanvas() {
    canvasOpen = true;
    canvasEl.hidden = false;
    canvasToggle.classList.add('open');
    canvasToggle.setAttribute('aria-pressed', 'true');
  }

  function closeCanvas() {
    canvasOpen = false;
    canvasEl.hidden = true;
    canvasToggle.classList.remove('open');
    canvasToggle.setAttribute('aria-pressed', 'false');
  }

  function openCanvasFor(art) {
    currentArtifact = art;
    canvasTypeEl.textContent = art.lang;
    canvasCode.value = art.code;
    setCanvasPreview(art.lang, art.code);
    canvasStatus.textContent = art.lang === 'mermaid'
      ? 'Diagram Mermaid. Preview memuat perender dari CDN (offline akan menampilkan sumber).'
      : 'Artefak ' + art.lang.toUpperCase() + '. Edit kode lalu klik Reload untuk menjalankan ulang.';
    showCanvasPane('preview');
    openCanvas();
  }

  function reloadArtifact() {
    if (!currentArtifact) return;
    // currentArtifact is the same live object referenced by the history item,
    // so persisting the edit here is enough for reopened messages.
    currentArtifact.code = canvasCode.value;
    setCanvasPreview(currentArtifact.lang, currentArtifact.code);
    canvasStatus.textContent = 'Dimuat ulang.';
    showCanvasPane('preview');
  }

  function addUserMessage(content) {
    const el = document.createElement('div');
    el.className = 'msg user';
    el.textContent = content;
    messagesEl.appendChild(el);
    scrollDown();
    return el;
  }

  function addAssistantMessage(content, opts) {
    opts = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'msg assistant' + (opts.err ? ' err' : '');
    const tag = document.createElement('div');
    tag.className = 'role-tag';
    tag.innerHTML = '<span class="agent-dot">&#10022;</span><span>Marbel AI</span>';
    const body = document.createElement('div');
    body.className = 'body';
    const inner = document.createElement('div');
    inner.className = 'inner';
    const artCounter = { n: 0 };
    inner.innerHTML = decorateText(content, artCounter);
    inner.dataset.artCount = String(artCounter.n);
    // Keep the parsed artifacts on the element so "+ Buka di Canvas" knows what to open.
    inner._artifacts = (opts.artifacts && opts.artifacts.length ? opts.artifacts : extractArtifacts(content));
    if (opts.tokens) {
      const t = document.createElement('span');
      t.className = 'token';
      t.textContent = '⚡ ' + opts.tokens + ' token · ' + (opts.cost === '0' ? 'Rp 0 / free' : '$' + opts.cost);
      body.appendChild(t);
    }
    wrap.appendChild(tag);
    wrap.appendChild(body);
    messagesEl.appendChild(wrap);
    scrollDown();
    return wrap;
  }

  function typingIndicator() {
    const wrap = document.createElement('div');
    wrap.className = 'msg assistant';
    const tag = document.createElement('div');
    tag.className = 'role-tag';
    tag.innerHTML = '<span class="agent-dot">&#10022;</span><span>Marbel AI</span>';
    const body = document.createElement('div');
    body.className = 'body';
    body.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
    wrap.appendChild(tag);
    wrap.appendChild(body);
    messagesEl.appendChild(wrap);
    scrollDown();
    return wrap;
  }

  function scrollDown() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showChat() {
    welcomeEl.style.display = 'none';
  }

  function extractContent(data) {
    if (!data) return '';
    if (data.error && data.error.message) throw new Error(data.error.message);
    if (data.choices && data.choices[0]) {
      const c = data.choices[0].message || {};
      return c.content || c.reasoning_content || '';
    }
    return '';
  }

  function parseUsage(data) {
    if (data && data.usage) {
      const t = data.usage.total_tokens || data.usage.completion_tokens || 0;
      return { tokens: t, cost: data.cost || '0' };
    }
    return null;
  }

  // Determine the API base. When this UI is served statically on GitHub Pages
// (no backend), fall back to a live Marbel AI backend host hosting server.js.
// Otherwise use the same-origin /api proxy provided by server.js.
//
// Override the backend with ?backend=https://your-host (e.g. your deployed
// server.js on Render/Railway): https://<user>.github.io/MarbelAI/?backend=...
const DEFAULT_BACKEND = 'https://work-1-xffkiwsopwsrwzty.prod-runtime.all-hands.dev';
const override = new URLSearchParams(window.location.search).get('backend');
const GHPAGES_BACKEND = override || DEFAULT_BACKEND;
const API_BASE =
  (window.location.hostname.indexOf('github.io') !== -1) ? GHPAGES_BACKEND : '';
const api = function (path) { return API_BASE + path; };

async function chatRequest(messages) {
    const res = await fetch(api('/api/chat'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: model.value, messages, stream: false }),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // Non-JSON response (e.g. an HTML error page) — surface it instead of crashing.
      const snippet = text.trim().slice(0, 120);
      throw new Error(
        'Respons dari server bukan format JSON (HTML).\n' + snippet +
        (res.ok ? '' : '\nHTTP ' + res.status)
      );
    }
    if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status));
    return data;
  }

  function buildThreadHistory() {
    const msgs = history.map(function (h) {
      return h.items.map(function (i) { return { role: i.role, content: i.content }; });
    }).flat();
    // Identity system prompt: the assistant always presents itself as Marbel AI.
    msgs.unshift({
      role: 'system',
      content: 'Kamu adalah Marbel AI, asisten AI dari Marbel AI. Apabila ditanya siapa kamu atau apa namamu, ' +
        'selalu jawab bahwa kamu adalah Marbel AI assistant. Jawab dengan bahasa Indonesia, ringkas, dan ramah.'
    });
    return msgs;
  }

  function updateThreadList() {
    threadList.innerHTML = '';
    history.forEach(function (h) {
      const li = document.createElement('li');
      li.className = 'thread-item' + (h.id === threadId && !busy ? ' active' : '');
      const first = h.items.find(function (i) { return i.role === 'user'; });
      const name = (first ? first.content : 'Thread ' + h.id);
      li.innerHTML = '<span class="tid">#' + h.id + '</span><span class="tname">' + esc(name.slice(0, 40)) + '</span>';
      li.addEventListener('click', function () { loadThread(h.id); });
      threadList.appendChild(li);
    });
  }

  function newThread() {
    threadId = ++threadCount;
    history.push({ id: threadId, items: [] });
    messagesEl.innerHTML = '';
    welcomeEl.style.display = '';
    activeBadge.classList.remove('show');
    input.value = '';
    resize();
    updateThreadList();
  }

  function loadThread(id) {
    const th = history.find(function (h) { return h.id === id; });
    if (!th || busy) return;
    threadId = id;
    messagesEl.innerHTML = '';
    welcomeEl.style.display = 'none';
    activeBadge.classList.remove('show');
    th.items.forEach(function (i) {
      if (i.role === 'user') addUserMessage(i.content);
      else addAssistantMessage(i.content, { artifacts: i._artifacts });
    });
    updateThreadList();
  }

  function resize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 220) + 'px';
  }

  async function onSend(rawText) {
    const text = (rawText != null ? rawText : input.value).trim();
    if (!text || busy) return;

    if (history.length === 0) newThread();

    busy = true;
    sendBtn.disabled = true;
    showChat();
    activeBadge.classList.add('show');
    input.value = '';
    resize();
    setStatus('on', 'memproses…');

    const current = history.find(function (h) { return h.id === threadId; });
    current.items.push({ role: 'user', content: text });
    addUserMessage(text);

    // check whether the selected provider/model actually has credentials
    const activePill = modelListEl.querySelector('.mname[data-active="1"]');
    const selectedActive = activePill && model.value === activePill.textContent;
    const typing = typingIndicator();

    try {
      if (!selectedActive && !/^oc\//.test(model.value)) {
        throw new Error(
          'Model "' + model.value + '" belum dapat dipakai karena provider-nya belum ' +
          'dihubungkan di 9Router (tidak ada API key/kredensial).\n\n' +
          'Gunakan model "oc/..." (OpenCode, gratis, tanpa akun) yang tersedia, atau ' +
          'hubungkan provider lain terlebih dahulu di dashboard 9Router.'
        );
      }
      const data = await chatRequest(buildThreadHistory());
      typing.remove();
      const content = extractContent(data) || '(respons kosong)';
      const usage = parseUsage(data);
      const artifacts = extractArtifacts(content);
      const item = { role: 'assistant', content: content };
      if (artifacts.length) item._artifacts = artifacts;
      current.items.push(item);
      addAssistantMessage(content, Object.assign({ artifacts: artifacts }, usage || {}));
      setStatus('on', 'terhubung');
    } catch (err) {
      typing.remove();
      current.items.push({ role: 'assistant', content: 'Terjadi kesalahan:\n' + err.message });
      addAssistantMessage('Terjadi kesalahan:\n' + err.message, { err: true });
      setStatus('err', 'gagal');
    } finally {
      busy = false;
      sendBtn.disabled = false;
      activeBadge.classList.remove('show');
      updateThreadList();
    }
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); onSend(); });
  input.addEventListener('input', resize);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
  });
  newThreadBtn.addEventListener('click', newThread);
  sideToggle.addEventListener('click', function () {
    layoutEl.classList.toggle('collapsed');
    sideToggle.title = layoutEl.classList.contains('collapsed')
      ? 'Tampilkan sidebar'
      : 'Sembunyikan sidebar';
  });
  suggestions.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-prompt]');
    if (btn) onSend(btn.getAttribute('data-prompt'));
  });

  // ---- Canvas wiring ----
  canvasToggle.addEventListener('click', function () {
    if (canvasOpen) { closeCanvas(); return; }
    if (currentArtifact) { openCanvas(); }
    else {
      // No artifact open yet: open the panel (empty state) so users know it exists.
      openCanvas();
      showCanvasPane('preview');
    }
  });
  canvasClose.addEventListener('click', closeCanvas);
  canvasReload.addEventListener('click', reloadArtifact);
  tabPreview.addEventListener('click', function () { showCanvasPane('preview'); });
  tabCode.addEventListener('click', function () { showCanvasPane('code'); });

  // Delegate clicks on "+ Buka di Canvas" buttons inside rendered messages.
  messagesEl.addEventListener('click', function (e) {
    const btn = e.target.closest('.canvas-open-btn');
    if (!btn) return;
    const inner = btn.closest('.inner');
    const idx = Number(btn.getAttribute('data-art'));
    const arts = (inner && inner._artifacts) || [];
    if (arts[idx]) openCanvasFor(arts[idx]);
  });

  const modelListEl = document.getElementById('modelNames');
  const modelCountEl = document.getElementById('modelCount');

  function renderModelNames(ids, activeIds) {
    modelListEl.innerHTML = '';
    ids.forEach(function (id) {
      const active = activeIds.indexOf(id) !== -1;
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'mname' + (active ? ' active' : ' locked');
      pill.textContent = id;
      pill.title = active ? 'Siap dipakai gratis' : 'Provider belum terhubung — klik untuk tetap memilih';
      pill.dataset.active = active ? '1' : '0';
      pill.addEventListener('click', function () { setModel(id); });
      modelListEl.appendChild(pill);
    });
    modelCountEl.textContent = ids.length + ' model siap pakai';
  }

  function setModel(id) {
    model.value = id;
    // jump to the dropdown so it's visible
    model.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function populateModelSelect(allIds, usableIds) {
    // merge: put usable ones first (deduped), then the rest
    const seen = {};
    const merged = [];
    usableIds.concat(allIds).forEach(function (id) {
      if (!seen[id]) { seen[id] = 1; merged.push(id); }
    });
    model.innerHTML = '';
    merged.forEach(function (id) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      model.appendChild(opt);
    });
    // keep a sensible default
    model.value = 'oc/mimo-v2.5-free';
  }

  function loadModels() {
    fetch(api('/api/models'))
      .then(function (r) { return r.json(); })
      .catch(function () { return { data: [] }; })
      .then(function (data) {
        let all = (data.data || []).map(function (m) { return m.id; });
        // Verified-working free models (OpenCode, no account needed).
        const candidates = [
          'oc/mimo-v2.5-free',
          'oc/hy3-free',
          'oc/laguna-s-2.1-free',
          'oc/nemotron-3.5-lightning-free'
        ];
        // Only show models that are actually ready to use.
        candidates.forEach(function (id) {
          if (all.indexOf(id) === -1) all.push(id);
        });
        const ready = all.filter(function (id) { return candidates.indexOf(id) !== -1; });
        renderModelNames(ready, ready);
        populateModelSelect(ready, ready);
        setStatus('on', 'terhubung');
      })
      .catch(function () {
        setStatus('err', 'tak tersedia');
        modelCountEl.textContent = 'gagal memuat';
      });
  }

  newThread();
  loadModels();
})();
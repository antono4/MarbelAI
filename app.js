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
  const attachBtn = document.getElementById('attachBtn');
  const fileInput = document.getElementById('fileInput');
  const attachmentsEl = document.getElementById('attachments');
  const themeSwitch = document.querySelector('.theme-switch');

  let busy = false;
  let threadId = 0;
  let threadCount = 0;
  let history = []; // {id, items:[{role,content,files?}]}
  let pendingFiles = []; // {name, size, text}

  function setStatus(state, label) {
    statusDot.className = 'dot' + (state ? ' ' + state : '');
    if (label) statusLabel.textContent = label;
  }

  const THEMES = ['green', 'ocean', 'sunset', 'light'];

  function setTheme(name, save) {
    if (THEMES.indexOf(name) === -1) name = 'green';
    document.documentElement.dataset.theme = name;
    document.querySelectorAll('.tsw-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.theme === name);
    });
    if (save !== false) {
      try { localStorage.setItem('marbel-theme', name); } catch (e) {}
    }
  }

  function initTheme() {
    let saved = 'green';
    try { saved = localStorage.getItem('marbel-theme') || 'green'; } catch (e) {}
    setTheme(saved, false);
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function renderAttachments() {
    attachmentsEl.innerHTML = '';
    if (pendingFiles.length === 0) {
      attachmentsEl.hidden = true;
      return;
    }
    attachmentsEl.hidden = false;
    pendingFiles.forEach(function (f, i) {
      const chip = document.createElement('span');
      chip.className = 'attach-chip';
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      chip.innerHTML = '<span class="ac-icon">' + esc(ext.slice(0, 4) || 'file') + '</span>' +
        '<span class="ac-name" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
        '<span class="ac-size">' + esc(formatSize(f.size)) + '</span>' +
        '<button type="button" class="ac-remove" title="Hapus lampiran">×</button>';
      chip.querySelector('.ac-remove').addEventListener('click', function () {
        pendingFiles.splice(i, 1);
        renderAttachments();
      });
      attachmentsEl.appendChild(chip);
    });
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function decorateText(text) {
    const blockRe = /```([\s\S]*?)```/g;
    const parts = [];
    let last = 0, m;
    while ((m = blockRe.exec(text)) !== null) {
      const before = text.slice(last, m.index);
      // Preserve the original fence body verbatim so a first line that is a
      // plain word is never mistaken for a language tag.
      const blockHtml = '<div class="code-block"><pre>' + esc(m[1]) + '</pre></div>';
      parts.push(before, { html: blockHtml });
      last = m.index + m[0].length;
    }
    parts.push(text.slice(last));
    return parts.map(function (p) {
      if (typeof p === 'object') return p.html;
      return esc(p).replace(/`([^`]+)`/g, '<code>$1</code>');
    }).join('');
  }

  function addUserMessage(content, files) {
    const el = document.createElement('div');
    el.className = 'msg user';
    if (files && files.length) {
      const chips = document.createElement('div');
      chips.className = 'msg-files';
      chips.innerHTML = files.map(function (f) {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        return '<span class="attach-chip static"><span class="ac-icon">' + esc(ext.slice(0, 4) || 'file') + '</span>' +
          '<span class="ac-name" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
          '<span class="ac-size">' + esc(formatSize(f.size)) + '</span></span>';
      }).join('');
      el.appendChild(chips);
    }
    if (content) {
      const body = document.createElement('div');
      body.className = 'ubody';
      body.textContent = content;
      el.appendChild(body);
    }
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
    inner.innerHTML = decorateText(content);
    body.appendChild(inner);
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
const DEFAULT_BACKEND = 'https://work-1-tzykbslejgjfecnu.prod-runtime.all-hands.dev';
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
    const msgs = history.flatMap(function (h) {
      return h.items.flatMap(function (i) {
        if (i.files && i.files.length) {
          const parts = ['Lampiran:\n'];
          i.files.forEach(function (f) {
            parts.push('- ' + f.name + (f.size ? ' (' + formatSize(f.size) + ')' : '') + '\n');
            if (f.text) {
              parts.push('```\n' + f.text.slice(0, 8000) + (f.text.length > 8000 ? '\n…(terpotong)' : '') + '\n```\n');
            }
          });
          return [
            { role: i.role, content: i.content },
            { role: 'user', content: parts.join('') },
          ];
        }
        return { role: i.role, content: i.content };
      });
    });
    // Identity system prompt: the assistant always presents itself as Marbel AI.
    msgs.unshift({
      role: 'system',
      content: 'Kamu adalah Marbel AI. Saat ditanya siapa kamu, jawab sebagai Marbel AI. Jawab dengan bahasa Indonesia. Jangan gunakan tabel Markdown, jangan gunakan karakter "|", "---", atau "*". Balas ringkas, jelas, dan tanpa hiasan berlebihan.'
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
    pendingFiles = [];
    renderAttachments();
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
      if (i.role === 'user') addUserMessage(i.content, i.files);
      else addAssistantMessage(i.content);
    });
    updateThreadList();
  }

  function resize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 220) + 'px';
  }

  async function onSend(rawText) {
    const text = (rawText != null ? rawText : input.value).trim();
    const files = rawText == null ? pendingFiles.slice() : [];
    if ((!text && files.length === 0) || busy) return;

    if (history.length === 0) newThread();

    busy = true;
    sendBtn.disabled = true;
    showChat();
    activeBadge.classList.add('show');
    input.value = '';
    pendingFiles = [];
    renderAttachments();
    resize();
    setStatus('on', 'memproses…');

    const current = history.find(function (h) { return h.id === threadId; });
    current.items.push({ role: 'user', content: text, files: files });
    addUserMessage(text, files);

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
      current.items.push({ role: 'assistant', content: content });
      if (usage) addAssistantMessage(content, usage);
      else addAssistantMessage(content);
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
  attachBtn.addEventListener('click', function () { if (!busy) fileInput.click(); });
  fileInput.addEventListener('change', function () {
    const list = Array.from(fileInput.files || []);
    const reads = list.map(function (f) {
      return f.text().then(function (texts) {
        return { name: f.name, size: f.size, type: f.type || '', text: texts };
      }).catch(function () {
        return { name: f.name, size: f.size, type: f.type || '', text: '' };
      });
    });
    Promise.all(reads).then(function (files) {
      pendingFiles = pendingFiles.concat(files);
      fileInput.value = '';
      renderAttachments();
    });
  });
  sideToggle.addEventListener('click', function () {
    layoutEl.classList.toggle('collapsed');
    sideToggle.title = layoutEl.classList.contains('collapsed')
      ? 'Tampilkan sidebar'
      : 'Sembunyikan sidebar';
  });
  if (themeSwitch) {
    themeSwitch.addEventListener('click', function (e) {
      const btn = e.target.closest('.tsw-btn');
      if (btn) setTheme(btn.dataset.theme);
    });
  }
  suggestions.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-prompt]');
    if (btn) onSend(btn.getAttribute('data-prompt'));
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

  initTheme();
  newThread();
  loadModels();
})();
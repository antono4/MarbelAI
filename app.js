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
  const themeSwitch = document.querySelector('.theme-switch');
  const panelHide = document.getElementById('panelHide');
  const dolaToggle = document.getElementById('dolaToggle');

  // ---- Sidebar (drawer di ponsel) --------------------------------------
  // Visibilitas scrim selalu diturunkan dari kelas `collapsed` supaya tidak
  // perlu disinkronkan manual di setiap tempat yang mengubahnya.
  const scrim = document.createElement('button');
  scrim.type = 'button';
  scrim.className = 'scrim';
  scrim.tabIndex = -1;
  scrim.setAttribute('aria-hidden', 'true');
  scrim.setAttribute('aria-label', 'Tutup sidebar');
  document.querySelector('.main').appendChild(scrim);

  function isNarrow() { return window.innerWidth <= 768; }
  function sidebarOpen() { return !layoutEl.classList.contains('collapsed'); }

  function syncSidebar() {
    scrim.classList.toggle('show', isNarrow() && sidebarOpen());
    if (sideToggle) {
      sideToggle.title = sidebarOpen() ? 'Sembunyikan sidebar' : 'Tampilkan sidebar';
      sideToggle.setAttribute('aria-expanded', sidebarOpen() ? 'true' : 'false');
    }
    if (panelHide) {
      panelHide.title = sidebarOpen() ? 'Sembunyikan panel' : 'Tampilkan panel';
      panelHide.setAttribute('aria-expanded', sidebarOpen() ? 'true' : 'false');
    }
  }

  scrim.addEventListener('click', function () { layoutEl.classList.add('collapsed'); });
  new MutationObserver(syncSidebar).observe(layoutEl, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', syncSidebar);
  if (isNarrow()) layoutEl.classList.add('collapsed');

  // Salinan kedua kartu saran agar animasi "roll" berulang mulus (-50%).
  if (suggestions) {
    Array.prototype.slice.call(suggestions.children).forEach(function (btn) {
      const clone = btn.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.tabIndex = -1;
      suggestions.appendChild(clone);
    });
  }

  let busy = false;
  let threadId = 0;
  let threadCount = 0;
  let history = []; // {id, items:[{role,content}]}

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

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Optimasi decorateText agar tidak berat saat streaming
  function decorateText(text) {
    const blockRe = /```([\s\S]*?)```/g;
    const parts = [];
    let last = 0, m;
    while ((m = blockRe.exec(text)) !== null) {
      const before = text.slice(last, m.index);
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

  function addUserMessage(content) {
    const el = document.createElement('div');
    el.className = 'msg user';
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

  // Pesan AI yang siap untuk streaming
  function createAssistantMessage() {
    const wrap = document.createElement('div');
    wrap.className = 'msg assistant';
    const tag = document.createElement('div');
    tag.className = 'role-tag';
    tag.innerHTML = '<span class="agent-dot">&#10022;</span><span>Marbel AI</span>';
    const body = document.createElement('div');
    body.className = 'body';
    const inner = document.createElement('div');
    inner.className = 'inner';
    body.appendChild(inner);
    wrap.appendChild(tag);
    wrap.appendChild(body);
    messagesEl.appendChild(wrap);
    scrollDown();
    return { wrap: wrap, inner: inner, body: body };
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

  let scrollTimeout;
  function scrollDown() {
    // Throttle scroll untuk mencegah lag saat streaming
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(function() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
      scrollTimeout = null;
    }, 50);
  }

  function showChat() {
    welcomeEl.style.display = 'none';
  }

  // Konfigurasi Backend
  const DEFAULT_BACKEND = 'https://marbel-ai.onrender.com';
  const FALLBACK_BACKEND = 'https://marbel-ai.onrender.com';
  const override = new URLSearchParams(window.location.search).get('backend');
  let backendInUse = override || DEFAULT_BACKEND;
  const isGitHubPages = window.location.hostname.indexOf('github.io') !== -1;

  const FREE_MODELS = ['ling-3.0-flash-fin-free', 'mimo-v2.5-free', 'laguna-s-2.1-free', 'nemotron-3.5-lightning-free'];
  const ZAI_MODELS = ['glm-4.7-flash', 'glm-4.5-flash'];
  let zaiEnabled = false; // diset true bila /api/status melaporkan ZAI_API_KEY tersedia

  // Provider CORS langsung: dipakai sebagai cadangan saat proxy backend tidak
  // tersedia (mis. service Render tidur/404). Inilah yang membuat halaman
  // statis GitHub Pages tetap bisa mengobrol tanpa backend terpisah.
  const DIRECT_UPSTREAMS = [
    'https://hermes.ai.unturf.com',
    'https://qwen.ai.unturf.com',
  ];
  // uncloseai hanya melayani satu model, jadi semua nama model UI dipetakan ke sini.
  const DIRECT_MODEL = 'turboderp/Qwen3.8-27B-exl3';

  function directChatUrl(base) {
    return base.replace(/\/$/, '') + '/v1/chat/completions';
  }

  // Panggil provider langsung dari browser (CORS '*'), failover berurutan.
  async function directChat(messages) {
    const errs = [];
    for (let i = 0; i < DIRECT_UPSTREAMS.length; i++) {
      const base = DIRECT_UPSTREAMS[i];
      const controller = new AbortController();
      const timer = setTimeout(function () { controller.abort(); }, 30000);
      try {
        const res = await fetch(directChatUrl(base), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: DIRECT_MODEL,
            messages: messages,
            stream: false,
            chat_template_kwargs: { enable_thinking: false },
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          const t = await res.text().catch(function () { return ''; });
          throw new Error('HTTP ' + res.status + (t ? ': ' + t.slice(0, 100) : ''));
        }
        const data = await res.json().catch(function () { return null; });
        const c = (data && data.choices && data.choices[0] && data.choices[0].message) || {};
        const text = c.content || c.reasoning_content || '';
        if (!text || !text.trim()) throw new Error('respons kosong');
        return text;
      } catch (e) {
        clearTimeout(timer);
        errs.push(base + ' → ' + (e && e.message ? e.message : e));
      }
    }
    throw new Error('Langsung: ' + errs.join(' · '));
  }

  function apiBase() {
    if (!isGitHubPages) return '';
    return backendInUse;
  }
  const api = function (path) { return apiBase() + path; };

  async function ensureBackend() {
    if (backendInUse !== FALLBACK_BACKEND) {
      try {
        const res = await fetch(backendInUse + '/api/models', { method: 'GET', headers: { accept: 'application/json' } });
        if (res.ok) return;
      } catch (e) {}
      backendInUse = FALLBACK_BACKEND;
    }
  }

  // === FITUR STREAMING BARU ===
  // Memunculkan jawaban AI kata demi kata agar tidak terasa lambat

  // === DoLa (Decoding by Contrasting Layers, arXiv:2309.03883) ===
  // Saat aktif, backend mengontraskan logprobs dua model (mature vs premature)
  // untuk jawaban yang lebih faktual. Karena butuh dua panggilan model,
  // timeout klien dinaikkan agar tidak terpotong.
  let dolaOn = false;
  try { dolaOn = localStorage.getItem('marbel-dola') === '1'; } catch (e) {}
  function syncDola() {
    if (dolaToggle) dolaToggle.setAttribute('aria-pressed', dolaOn ? 'true' : 'false');
  }
  syncDola();
  if (dolaToggle) {
    dolaToggle.addEventListener('click', function () {
      dolaOn = !dolaOn;
      try { localStorage.setItem('marbel-dola', dolaOn ? '1' : '0'); } catch (e) {}
      syncDola();
    });
  }

  // === FITUR STREAMING BARU (Non-Streaming Cadangan) ===
  // Mode Non-Streaming (Cadangan jika server tidak support stream)
  async function streamChat(modelId, messages, onChunk, useDirect) {
    setStatus('on', 'menunggu jawaban...');

    let fullText;
    if (useDirect) {
      fullText = await directChat(messages);
    } else {
      // Batasi lama menunggu upstream agar model yang menggantung tidak
      // memblok model lain (pakai AbortController + timeout 30 detik; DoLa
      // butuh dua panggilan jadi diberi jendela lebih longgar).
      const timeoutMs = dolaOn ? 75000 : 30000;
      const controller = new AbortController();
      const timer = setTimeout(function () { controller.abort(); }, timeoutMs);
      let res;
      try {
        res = await fetch(api('/api/chat'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: modelId, messages, stream: false, dola: dolaOn }),
          signal: controller.signal
        });
      } catch (e) {
        clearTimeout(timer);
        const why = (e && e.name === 'AbortError') ? 'upstream timeout' : (e && e.message);
        throw new Error(why || 'fetch failed');
      }
      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text().catch(function () { return ''; });
        throw new Error('HTTP ' + res.status + ': ' + errText.slice(0, 100));
      }

      // Upstream kadang membalas header 200 lalu menahan body-nya; AbortController
      // hanya memutus fase request, jadi baca body dengan timeout mandiri agar
      // model yang menggantung tidak membekukan engine selamanya.
      let data;
      try {
        data = await Promise.race([
          res.json().catch(function () { return null; }),
          new Promise(function (resolve) {
            setTimeout(function () { resolve(null); }, 15000);
          })
        ]);
      } catch (e) {
        throw new Error('upstream timeout: respons tidak selesai');
      }
      // Upstream Zen kerap membalas HTTP 200 dengan badan error; anggap sebagai
      // kegagalan agar retry/fallback berjalan dan tidak tampil kosong.
      if (!data || !Array.isArray(data.choices) || !data.choices[0]) {
        const em = (data && data.error && (data.error.message || data.error.type)) || 'responden kosong dari upstream';
        throw new Error('upstream error: ' + em);
      }
      const c = data.choices[0].message || {};
      // Beberapa model (mis. ling) menaruh jawaban di kolom reasoning saat
      // mode non-streaming; baca juga sebagai cadangan bila content kosong.
      fullText = c.content || c.reasoning_content || c.reasoning || '';
      if (!fullText || !fullText.trim()) {
        throw new Error('upstream error: respons kosong');
      }
    }

    // Simulasikan mengetik agar terasa cepat dan responsif; bila onChunk tidak
    // diberikan (mode paralel), langsung kembalikan teks penuh agar pemenang
    // "tercepat" tidak tertunda oleh efek ketik buatan.
    if (onChunk) {
      const words = fullText.split(' ');
      for (let i = 0; i < words.length; i++) {
        onChunk(words.slice(0, i + 1).join(' '));
        await new Promise(r => setTimeout(r, 20)); // jeda 20ms
      }
    }
    return fullText;
  }

  function buildThreadHistory() {
    const msgs = history.flatMap(function (h) {
      return h.items.map(function (i) {
        return { role: i.role, content: i.content };
      });
    });
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
      else {
        const msgEl = createAssistantMessage();
        msgEl.inner.innerHTML = decorateText(i.content);
      }
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

    const typing = typingIndicator();
    const selected = model.value;

    try {
      typing.remove();
      const msgEls = createAssistantMessage();

      let fullText = '';
      let lastRender = 0;

      const renderChunk = (text) => {
        fullText = text;
        const now = Date.now();
        if (now - lastRender > 50) {
          lastRender = now;
          msgEls.inner.innerHTML = decorateText(fullText);
          scrollDown();
        }
      };

      // Daftar model yang akan dicoba. Bila mode "Auto"(semua), semua model
      // dijalankan PARALEL sekaligus dan jawaban tercepat yang menang; bila
      // model tunggal dipilih, model itu dicoba penuh dulu baru cadangan otomatis..
      let modelsToTry = [];
      const isAll = !selected || selected === 'semua';
      if (selected && !isAll) {
        modelsToTry.push(selected);
      }
      const backupOrder = FREE_MODELS.concat(zaiEnabled ? ZAI_MODELS : []);
      backupOrder.forEach(function (m) {
        if (modelsToTry.indexOf(m) === -1) modelsToTry.push(m);
      });

      // Pada GitHub Pages tanpa ?backend=, proxy Render kerap tidak tersedia
      // (404/CORS). Jalankan provider CORS langsung lebih dulu, lalu backend
      // sebagai cadangan, agar halaman statis tetap bisa mengobrol.
      const directFirst = isGitHubPages && !override;

      async function runModel(mid) {
        if (directFirst) {
          try {
            return await streamChat(mid, buildThreadHistory(), renderChunk, true);
          } catch (e) {
            console.warn('Jalur langsung gagal:', e && e.message);
          }
        }
        return await streamChat(mid, buildThreadHistory(), renderChunk, false);
      }

      let success = false;
      let lastError = null;

      // Upstream gratis sering 503/error sesaat; coba ulang penuh dengan backoff agar

      // user tetap dapat jawaban begitu provider pulih. Model yang menggantung
      // (timeout 15s per model) tidak memblokir pemenang tercepat..
      const MAX_ATTEMPTS = 2;
      const delayMs = (function () {
        let base = 800;
        return function (attempt) {
          const jitter = Math.floor(Math.random() * 400);
          return base * Math.pow(2, attempt) + jitter; // ~1.2s,, 2s
        };
      })();
      for (let attempt =  0; attempt < MAX_ATTEMPTS && !success; attempt++) {
        if (attempt > 0) {
          setStatus('on', 'server sibuk, mencoba lagi… (' + attempt + '/' + (MAX_ATTEMPTS - 1) + ')');
          await new Promise(r => setTimeout(r, delayMs(attempt)));
        }
        // Auto: jalankan model dalam batch paralel kecil (maks 2 per batch).
        // Ramah rate-limit upstream; Promise.any mengambil jawaban tercepat

        // yang sukses dan tidak mungkin menggantung..
        const batchSize = 2;
        const pendingPool = isAll ? modelsToTry.slice() : (modelsToTry[0] ? [modelsToTry[0]] : []);
        let roundErr = null;
        if (!isAll) {
          pendingPool.length = Math.min(pendingPool.length, 1);
        }
        for (let bi = 0; bi < pendingPool.length && !success; bi += batchSize) {

          const batch = pendingPool.slice(bi, bi + batchSize);
          setStatus('on', 'mencoba: ' + batch.join(' + '));
          const attempts = batch.map(function (name) {
            return runModel(name).then(function (t) { return { name: name, text: t }; }).catch(function (err) {
              console.warn('Model ' + name + ' gagal:', err.message);
              if (!lastError) lastError = err;
              roundErr = err;
              throw err;
            });
          });
          try {
            const won = await Promise.any(attempts);
            fullText = won.text;
            renderChunk(fullText);
            success = true;
          } catch (err) {
            // Promise.any menolak AggregateError bila semua model pada batch gagal..
            // Normalisasi agar retry/fallback berjalan untuk semua error upstream..
            const why = (err && Array.isArray(err.errors)) ? err.errors.map(function (e) { return (e && e.message) || e; }).join('; ') : (err && err.message);
            const checkable = why || '';
            // Semua model pada batch ini gagal; lanjut batch berikutnya (atau retry).
            if (!/4\d{2}|5\d{2}|upstream|timeout|fetch failed/i.test(checkable)) {
              throw err;
            }
          }
        }
        if (!success) {
          lastError = roundErr || lastError || new Error('Semua model gagal pada gelombang ini.');
          if (attempt < MAX_ATTEMPTS -  1) {
            setStatus('on', 'semua model sibuk, menunggu lalu mencoba lagi…');
            await new Promise(r => setTimeout(r, 2500));
          }
        }
      }
      if (!success) {
        throw lastError || new Error('Semua model sedang tidak tersedia.');
      }

      // Render final
      msgEls.inner.innerHTML = decorateText(fullText);
      current.items.push({ role: 'assistant', content: fullText });
      setStatus('on', 'terhubung');
    } catch (err) {
      typing.remove();
      const friendly = 'Terjadi kesalahan saat menghubungi server.\nDetail: ' + err.message + '\n\nMohon tunggu beberapa saat lalu coba lagi.';
      current.items.push({ role: 'assistant', content: friendly });

      const errEl = createAssistantMessage();
      errEl.wrap.classList.add('err');
      errEl.inner.innerHTML = decorateText(friendly);

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
  newThreadBtn.addEventListener('click', function () {
    if (isNarrow()) layoutEl.classList.add('collapsed');
    newThread();
  });
  sideToggle.addEventListener('click', function () {
    layoutEl.classList.toggle('collapsed');
  });
  if (panelHide) {
    panelHide.addEventListener('click', function () {
      layoutEl.classList.toggle('collapsed');
    });
  }
  if (themeSwitch) {
    themeSwitch.addEventListener('click', function (e) {
      const btn = e.target.closest('.tsw-btn');
      if (btn) setTheme(btn.dataset.theme);
    });
  }
  suggestions.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-prompt]');
    if (btn) {
      if (isNarrow()) layoutEl.classList.add('collapsed');
      onSend(btn.getAttribute('data-prompt'));
    }
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
      pill.title = active ? 'Siap dipakai gratis' : 'Provider belum terhubung';
      pill.dataset.active = active ? '1' : '0';
      pill.addEventListener('click', function () { setModel(id); });
      modelListEl.appendChild(pill);
    });
    modelCountEl.textContent = ids.length + ' model siap pakai';
  }

  function setModel(id) {
    model.value = id;
    model.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function populateModelSelect(allIds, usableIds) {
    const seen = {};
    const merged = [];
    usableIds.concat(allIds).forEach(function (id) {
      if (!seen[id]) { seen[id] = 1; merged.push(id); }
    });
    model.innerHTML = '';
    const semua = document.createElement('option');
    semua.value = 'semua';
    semua.textContent = 'Auto Model (Tercepat)';
    model.appendChild(semua);
    merged.forEach(function (id) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      model.appendChild(opt);
    });
    model.value = 'semua';
  }

  function loadModels() {
    // Daftar model di sini statis (FREE_MODELS); kegagalan menyentuh proxy
    // backend tidak boleh membuat UI tampak rusak, karena pada GitHub Pages
    // chat berjalan lewat provider CORS langsung.
    Promise.resolve(isGitHubPages ? ensureBackend() : null)
      .then(function () { return fetch(api('/api/models')); })
      .then(function (r) { return r.json(); })
      .catch(function () { return { data: [] }; })
      .then(function (data) {
        // Status backend: apakah upstream Z.ai (GLM) tersedia. Ini dipakai
        // untuk mengunci model GLM di sidebar bila backend tak punya ZAI_API_KEY..
        return fetch(api('/api/status')).then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (st) {
          return { data: data, zai: !!(st && st.zai && st.zai.available) };
        });
      })
      .then(function (ctx) {
        let all = (ctx.data.data || []).map(function (m) { return m.id; });
        const zaiOn = ctx.zai;
        zaiEnabled = zaiOn;
        const candidates = FREE_MODELS.concat(zaiOn ? ZAI_MODELS : []);
        candidates.forEach(function (id) {
          if (all.indexOf(id) === -1) all.push(id);
        });
        const ready = all.filter(function (id) { return candidates.indexOf(id) !== -1; });
        renderModelNames(ready, zaiOn ? ready : ready.filter(function (id) { return FREE_MODELS.indexOf(id) !== -1; }));
        populateModelSelect(ready, ready);
        setStatus('on', 'terhubung');
      })
      .catch(function () {
        renderModelNames(FREE_MODELS, FREE_MODELS);
        populateModelSelect(FREE_MODELS, FREE_MODELS);
        setStatus('on', 'terhubung');
      });
  }

  initTheme();
  newThread();
  syncSidebar();
  loadModels();
})();

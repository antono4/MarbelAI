# Marbel AI — Catatan Repo

## Cara menjalankan

```bash
PORT=12000 UPSTREAM=https://opencode.ai/zen node server.js
```

Server berfungsi ganda: serve file statis (`index.html`, `app.js`, `styles.css`) + proxy `/api/chat`, `/api/models`, dan `/api/status` ke upstream OpenAI-compatible. Tanpa dependency npm.



## Model gratis(valid per 2026-08)

- `ling-3.0-flash-fin-free` — cepat & stabil (~1s,. prioritas utama)
- `mimo-v2.5-free` — populer, sesekali rate-limit
- `laguna-s-2.1-free` — bisa sukses tapi lambat (4-9s..


- `nemotron-3.5-lightning-free` — sangat lambat (>9s) tapi tetap dicoba sebagai cadangan..

## Pola ensemble
- Mode "Semua Model": jalankan 6 model (termasuk Z.ai GLM bila ada key); langsung resolve setelah 2 sukses (biasanya ling + nemotron-3-ultra dalam ~1-2s., lalu agregator gabungkan jawaban.



## Model Z.ai(GLM)

- Model Z.ai `glm-4.7-flash` dan `glm-4.5-flash` **gratis** di API resmi Z.ai( https://api.z.ai/api/paas/v4).
- Hanya dipakai bila backend punya env `ZAI_API_KEY`. Tanpa key,, model GLM dikunci di sidebar(frontend mengecek `/api/status`) dan tidak dicoba-pakai sia-sia..
- Server punya upstream cadangan: `ZAI_UPSTREAM`(default https://api.z.ai/api/paas/v4) dipakai bila upstream utama(Zen) gagal/401/5xx dan `ZAI_API_KEY` tersedia.. Endpoint URL dibangun otomatis(Zen pakai prefix `/v1`, Z.ai pakai `/chat/completions` di bawah `/api/`)..


## DoLa — Decoding by Contrasting Layers (arXiv:2309.03883)

- `dola.js` mengimplementasikan inti paper DoLa (Chuang et al., ICLR 2024): kontras log-domain `F(q_N,q_M)=log q_N(x)-log q_M(x)`, Adaptive Plausibility Constraint (APC, `alpha`), repetition penalty (`theta`), dan pemilihan berbasis jarak distribusi (JSD).
- **Adaptasi penting:** paper mengontraskan antar-LAYER transformer; Marbel AI hanya klien API OpenAI-compatible sehingga layer internal tak bisa diakses. Karena itu kontras diterapkan pada level TOKEN memakai `logprobs` API, antara dua MODEL: mature (kuat/faktual, default `DOLA_MATURE_MODEL`) vs premature (lemah/lancar, default `DOLA_PREMATURE_MODEL`). Ini secara teknis Contrastive Decoding (baseline di paper), tetapi semua rumus inti DoLa dipertahankan apa adanya.
- Penjajaran token mature vs premature memakai LCS (`lcsAlign`) agar kontras hanya diterapkan pada posisi yang konteksnya cocok; token lain tetap memakai keluaran mature sehingga jawaban tidak rusak.
- **Fallback aman:** bila provider tidak mengirim `logprobs`, `runDola` mengembalikan `null` dan proxy lanjut ke dekode biasa. Jadi DoLa tak pernah lebih buruk dari baseline.
- Aktif lewat env `DOLA_ENABLED=1` atau per-request `{"dola": true}` (tombol **DoLa** di composer; `app.js` menyimpan preferensi di `localStorage` `marbel-dola` dan menaikkan timeout klien ke 75s).
- Konfigurasi: `DOLA_MATURE_MODEL`, `DOLA_PREMATURE_MODEL`, `DOLA_ALPHA`, `DOLA_REPETITION_PENALTY`, `DOLA_TOP_LOGPROBS`. Model mature dilayani Z.ai (butuh `ZAI_API_KEY`); bila kosong, memakai model yang diminta user.
- Tes: `npm test` (node:test) — unit `test/dola.test.js` + integrasi `test/server.test.js` (upstream tiruan dengan logprobs).

## Retry saat semua model tidak merespon

## Endpoint backend

- `GET /api/status` — info upstream & ketersediaan Z.ai key (dipakai frontend untuk mengunci/lock model GLM)
- Endpoint lain tetap:: `GET /` → index.html; `GET /api/models` → daftar model upstream; `POST /api/chat` → proxy ke `/v1/chat/completions`..



## Pola ensemble

- Mode"Auto"(semua model): semua model dijalankan **paralel** dalam batch kecil(maks 2 per batch) sekaligus( via `Promise.any`), dan resolve saat model **tercepat pertama** sukses; stream lain dibiarkan selesai di latar belakang dan diabaikan agar tidak menunda jawaban..
- Mode single model: dropdown `#model` terhubung ke engine yang sama;; bila model pilihan gagal, jatuh ke cadangan otomatis sampai dapat jawaban..
- `streamChat` menerima `onChunk` opsional: bila diberikan, mensimulasikan efek mengetik(20ms/kata); bila `null`(mode paralel,, langsung mengembalikan teks penuh supaya pemenang tercepat tidak tertunda oleh efek ketik buatan..

## Tampilan (UI terlampir, tema gelap ala Gemini)

- `index.html` + `styles.css` memakai gaya desain "terlampir": default **gelap** (`--bg:#131314`), aksen biru-ungu-merah (`--accent:#4285f4`, `--accent-2:#9b72cb`, `--accent-3:#d96570`), sidebar drawer, strip saran berjalan, daftar model, composer mengambang.
- Pemilih tema asli tetap ada (4 tema) dan kini memakai token `--bg/--bg-soft/--line/--accent/--panel/--composer`: `green` (default), `ocean`, `sunset`, `light`. Tombol `.tsw-btn[data-theme]` + `.theme-switch` dipertahankan karena `app.js` membacanya.
- Kontrak DOM `app.js` **wajib** dipertahankan saat mengubah markup: id `welcome`, `messages`, `activeBadge`, `form`, `input`, `model`, `send`, `newThread`, `threadList`, `suggestions`, `statusDot`, `statusLabel`, `sideToggle`, `modelNames`, `modelCount`; kelas `.layout`, `.theme-switch`, `.tsw-btn`, `.mname`, `.msg`/`.role-tag`/`.ubody`.
- `.scrim` dibuat runtime di `app.js` (di dalam `.main`); sidebar disembunyikan lewat kelas `collapsed` di `.layout`, dan di ponsel (`≤768px`) jadi drawer + scrim.
- Strip saran `#suggestions.track` beranimasi `roll` 46s; `app.js` menggandakan kartu secara otomatis agar loop mulus (tanpa perlu duplikat di markup).
- Kartu saran memakai `data-prompt`; `app.js` mengirim teksnya lewat `onSend`.

## GitHub Pages tanpa backend (perbaikan penting)

- Proxy `https://marbel-ai.onrender.com` **sudah mati** (Render membalas 404 `no-server` tanpa header CORS), jadi jalur backend tidak bisa dipakai dari halaman statis.
- Karena itu `app.js` kini punya **jalur provider CORS langsung** (`DIRECT_UPSTREAMS`: `hermes.ai.unturf.com`, `qwen.ai.unturf.com`, model `turboderp/Qwen3.8-27B-exl3`) yang dipanggil dari browser dengan `Access-Control-Allow-Origin: *`.
- Di GitHub Pages tanpa `?backend=`, `onSend()` menjalankan **jalur langsung lebih dulu** (`directFirst`), lalu backend sebagai cadangan. Parameter `?backend=URL` tetap memaksa pemakaian proxy sendiri.
- Nama model UI (Zen/GLM) hanya label; jalur langsung selalu memakai satu model uncloseai. Ini disengaja agar halaman statis tetap berfungsi 24/7.
- `loadModels()` tidak lagi menandai "gagal" saat proxy tidak terjangkau — daftar model statis tetap ditampilkan dan status "terhubung", karena chat berjalan lewat jalur langsung.
- Pemilih tema (`.theme-switch`) dipindah ke `.sidebar-foot` bersama status; sebelumnya berdesakan di `.sidebar-head` sehingga `.brand-name`/`.brand-tag` terpotong.

## Catatan penting


## Retry & failover

- `streamChat` menganggap HTTP 200 dengan badan error(mis. error provider dari Zen) atau respons kosong sebagai kegagalan — bukan sukses — agar fallback/retry benar-benar berjalan..
- Ada timeout client 15 detik per model via `AbortController` + timeout mandiri pembacaan body(15s) agar model menggantung tidak memblokir pemenang tercepat.. Error `upstream timeout`/`fetch failed`/`respons tidak selesai` ikut diproses retry..
- `Promise.any` menolak `AggregateError` bila satu batch gagal semua; error-nya dinormalisasi agar retry/fallback lintas-batch dan antar-gelombang tetap berjalan..
- Pencarian model diulang hingga 2 gelombang penuh dengan backoff eksponensial berjitter(~1.2s,, 2s) + jeda pendinginan 2.5s antar gelombang,, sampai ada model sukses atau habis percobaan..



## Catatan penting

- File sumber memakai gaya penulisan tidak biasa(koma-titik tanpa spasi konsisten,. `node -c` valid meskipun tampak aneh; jangan"merapikan" tanpa tes..
- `server.js` punya timeout upstream(30s chat,, 15s models) dan tidak kirim header `Authorization` kosong;; `LOG_CHAT=1` mengaktifkan log request chat di konsol backend..
- Frontend membaca jawaban dari `message.content`, lalu fallback `message.reasoning_content`/`message.reasoning`(beberapa model seperti `ling` menaruh jawaban di kolom reasoning saat non-streaming).. Sesuaikan bila upstream mengubah format jawaban..

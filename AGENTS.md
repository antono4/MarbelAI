# Marbel AI — Catatan Repo

## Cara menjalankan

```bash
PORT=12000 UPSTREAM=https://opencode.ai/zen node server.js
```

Server berfungsi ganda: serve file statis (`index.html`, `app.js`, `styles.css`) + proxy `/api/chat` dan `/api/models` ke upstream OpenAI-compatible. Tanpa dependency npm.

## Model gratis upstream Zen (valid per 2026-08)

- `ling-3.0-flash-fin-free` — cepat & stabil (~1s). Prioritas utama.
- `nemotron-3-ultra-free` — cepat & stabil (~1-2s).
- `mimo-v2.5-free` — populer, kadang rate-limit (>429).
- `laguna-s-2.1-free` — bisa sukses tapi lambat (4-9s.


- `hy3-free` — **sudah tidak didukung** upstream (ModelError — jangan dipakai).
- `nemotron-3.5-lightning-free` — sangat lambat (>9s).
- `deepseek-v4-flash-free`, `muse-spark-1.2-contributor-free` — error dari provider.

## Model Z.ai (GLM)

- Model Z.ai `glm-4.7-flash` dan `glm-4.5-flash` **gratis (nol rupiah)** di API resmi Z.ai (openai.dev? use https://api.z.ai/api/paas/v4).
- Ditambahkan ke `FREE_MODELS` dan dropdown. Pada deploy Render,, isi env `ZAI_API_KEY` agar model GLM benar-benar melayani; tanpa key, model GLM dicoba lalu gagal cepat () dan fallback ke model Zen gratis ( sudah ditangani logika retry/failover ).
- Server kini punya upstream cadangan: `ZAI_UPSTREAM` (default https://api.z.ai/api/paas/v4) dipakai otomatis bila upstream utama (Zen) gagal/401/5xx dan `ZAI_API_KEY` tersedia. Endpoint URL dibangun otomatis (Zen pakai prefix `/v1`, Z.ai pakai `/chat/completions` di bawah `/api/`).

## Pola ensemble
- Mode "Semua Model": jalankan 6 model (termasuk Z.ai GLM bila ada key); langsung resolve setelah 2 sukses (biasanya ling + nemotron-3-ultra dalam ~1-2s., lalu agregator gabungkan jawaban.



- Mode single model: dropdown `#model` kini terhubung ke `chatEnsemble(messages, selected))`. Bila model pilihan gagal, jatuh ke ensemble cadangan agar user tetap dapat jawaban.



## DoLa — Decoding by Contrasting Layers (arXiv:2309.03883)

- `dola.js` mengimplementasikan inti paper DoLa (Chuang et al., ICLR 2024): kontras log-domain `F(q_N,q_M)=log q_N(x)-log q_M(x)`, Adaptive Plausibility Constraint (APC, `alpha`), repetition penalty (`theta`), dan pemilihan berbasis jarak distribusi (JSD).
- **Adaptasi penting:** paper mengontraskan antar-LAYER transformer; Marbel AI hanya klien API OpenAI-compatible sehingga layer internal tak bisa diakses. Karena itu kontras diterapkan pada level TOKEN memakai `logprobs` API, antara dua MODEL: mature (kuat/faktual, default `DOLA_MATURE_MODEL`) vs premature (lemah/lancar, default `DOLA_PREMATURE_MODEL`). Ini secara teknis Contrastive Decoding (baseline di paper), tetapi semua rumus inti DoLa dipertahankan apa adanya.
- Penjajaran token mature vs premature memakai LCS (`lcsAlign`) agar kontras hanya diterapkan pada posisi yang konteksnya cocok; token lain tetap memakai keluaran mature sehingga jawaban tidak rusak.
- **Fallback aman:** bila provider tidak mengirim `logprobs`, `runDola` mengembalikan `null` dan proxy lanjut ke dekode biasa. Jadi DoLa tak pernah lebih buruk dari baseline.
- Aktif lewat env `DOLA_ENABLED=1` atau per-request `{"dola": true}` (tombol **DoLa** di composer; `app.js` menyimpan preferensi di `localStorage` `marbel-dola` dan menaikkan timeout klien ke 75s).
- Konfigurasi: `DOLA_MATURE_MODEL`, `DOLA_PREMATURE_MODEL`, `DOLA_ALPHA`, `DOLA_REPETITION_PENALTY`, `DOLA_TOP_LOGPROBS`. Model mature dilayani Z.ai (butuh `ZAI_API_KEY`); bila kosong, memakai model yang diminta user.
- Tes: `npm test` (node:test) — unit `test/dola.test.js` + integrasi `test/server.test.js` (upstream tiruan dengan logprobs).

## Retry saat semua model tidak merespon

- `streamChat` kini menganggap HTTP  200 dengan badan error (mis. error provider dari Zen) atau respons kosong sebagai kegagalan — bukan sukses — agar fallback/retry benar-benar berjalan.
- Ada timeout client 30 detik per model via `AbortController` agar model menggantung tidak memblokir pergantian ke model lain. Error `upstream timeout`/`fetch failed` ikut diproses retry.




- Pencarian model diulang hingga 4 gelombang penuh dengan backoff eksponensial berjitter (~1.2s, 2s, 3.6s, 6.8s) + jeda pendinginan 2.5s tiap gelombang, jadi bila semua model sesak sesaat ( user otomatis mendapat jawaban begitu provider pulih tanpa menekan kirim ulang. Kalau tetap gagal setelah 4 gelombang, barulah UI menampilkan pesan error.


## Tampilan (UI terlampir, tema gelap ala Gemini)

- `index.html` + `styles.css` memakai gaya desain "terlampir": default **gelap** (`--bg:#131314`), aksen biru-ungu-merah (`--accent:#4285f4`, `--accent-2:#9b72cb`, `--accent-3:#d96570`), sidebar drawer, strip saran berjalan, daftar model, composer mengambang.
- Pemilih tema asli tetap ada (4 tema) dan kini memakai token `--bg/--bg-soft/--line/--accent/--panel/--composer`: `green` (default), `ocean`, `sunset`, `light`. Tombol `.tsw-btn[data-theme]` + `.theme-switch` dipertahankan karena `app.js` membacanya.
- Kontrak DOM `app.js` **wajib** dipertahankan saat mengubah markup: id `welcome`, `messages`, `activeBadge`, `form`, `input`, `model`, `send`, `newThread`, `threadList`, `suggestions`, `statusDot`, `statusLabel`, `sideToggle`, `modelNames`, `modelCount`; kelas `.layout`, `.theme-switch`, `.tsw-btn`, `.mname`, `.msg`/`.role-tag`/`.ubody`.
- `.scrim` dibuat runtime di `app.js` (di dalam `.main`); sidebar disembunyikan lewat kelas `collapsed` di `.layout`, dan di ponsel (`≤768px`) jadi drawer + scrim.
- Strip saran `#suggestions.track` beranimasi `roll` 46s; `app.js` menggandakan kartu secara otomatis agar loop mulus (tanpa perlu duplikat di markup).
- Kartu saran memakai `data-prompt`; `app.js` mengirim teksnya lewat `onSend`.

## Catatan penting

- File sumber memakai gaya penulisan tidak biasa (koma-titik tanpa spasi konsisten). `node -c` valid meskipun tampak aneh; jangan "merapikan" tanpa tes.
- `server.js` kini punya timeout upstream (30s chat, 15s models) dan tidak kirim header `Authorization` kosong.

- Endpoint statis:
  - `GET /` → index.html
  - `GET /api/models` → daftar model upstream
  - `POST /api/chat` → proxy ke `/v1/chat/completions`
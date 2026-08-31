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



## Retry saat semua model tidak merespon

- `streamChat` kini menganggap HTTP  200 dengan badan error (mis. error provider dari Zen) atau respons kosong sebagai kegagalan — bukan sukses — agar fallback/retry benar-benar berjalan.
- Ada timeout client 30 detik per model via `AbortController` agar model menggantung tidak memblokir pergantian ke model lain. Error `upstream timeout`/`fetch failed` ikut diproses retry.




- Pencarian model diulang hingga 4 gelombang penuh dengan backoff eksponensial berjitter (~1.2s, 2s, 3.6s, 6.8s) + jeda pendinginan 2.5s tiap gelombang, jadi bila semua model sesak sesaat ( user otomatis mendapat jawaban begitu provider pulih tanpa menekan kirim ulang. Kalau tetap gagal setelah 4 gelombang, barulah UI menampilkan pesan error.


## Catatan penting

- File sumber memakai gaya penulisan tidak biasa (koma-titik tanpa spasi konsisten). `node -c` valid meskipun tampak aneh; jangan "merapikan" tanpa tes.
- `server.js` kini punya timeout upstream (30s chat, 15s models) dan tidak kirim header `Authorization` kosong.

- Endpoint statis:
  - `GET /` → index.html
  - `GET /api/models` → daftar model upstream
  - `POST /api/chat` → proxy ke `/v1/chat/completions`
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

## Pola ensemble

- Mode "Semua Model": jalankan 4 model parallel; langsung resolve setelah 2 sukses (biasanya ling + nemotron-3-ultra dalam ~1-2s., lalu agregator gabungkan jawaban.

- Mode single model: dropdown `#model` kini terhubung ke `chatEnsemble(messages, selected)`. Bila model pilihan gagal, jatuh ke ensemble cadangan agar user tetap dapat jawaban.


## Catatan penting

- File sumber memakai gaya penulisan tidak biasa (koma-titik tanpa spasi konsisten). `node -c` valid meskipun tampak aneh; jangan "merapikan" tanpa tes.
- `server.js` kini punya timeout upstream (30s chat, 15s models) dan tidak kirim header `Authorization` kosong.

- Endpoint statis:
  - `GET /` → index.html
  - `GET /api/models` → daftar model upstream
  - `POST /api/chat` → proxy ke `/v1/chat/completions`
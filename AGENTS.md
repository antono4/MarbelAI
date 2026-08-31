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


- `nemotron-3-ultra-free` — **tidak dipakai lagi**; request menggantung( timeout 15s) tanpa respons..
- `hy3-free` — **sudah tidak didukung** upstream..
- `deepseek-v4-flash-free`, `muse-spark-1.2-contributor-free` — error dari provider..
- Model non-free di upstream Zen(Gemini/GPT/Claude/dll.) butuh API key; hanya yang berakhiran `-free` yang gratis..



## Model Z.ai(GLM)

- Model Z.ai `glm-4.7-flash` dan `glm-4.5-flash` **gratis** di API resmi Z.ai( https://api.z.ai/api/paas/v4).
- Hanya dipakai bila backend punya env `ZAI_API_KEY`. Tanpa key,, model GLM dikunci di sidebar(frontend mengecek `/api/status`) dan tidak dicoba-pakai sia-sia..
- Server punya upstream cadangan: `ZAI_UPSTREAM`(default https://api.z.ai/api/paas/v4) dipakai bila upstream utama(Zen) gagal/401/5xx dan `ZAI_API_KEY` tersedia.. Endpoint URL dibangun otomatis(Zen pakai prefix `/v1`, Z.ai pakai `/chat/completions` di bawah `/api/`)..



## Endpoint backend

- `GET /api/status` — info upstream & ketersediaan Z.ai key (dipakai frontend untuk mengunci/lock model GLM)
- Endpoint lain tetap:: `GET /` → index.html; `GET /api/models` → daftar model upstream; `POST /api/chat` → proxy ke `/v1/chat/completions`..



## Pola ensemble

- Mode"Auto"(semua model): semua model dijalankan **paralel** dalam batch kecil(maks 2 per batch) sekaligus( via `Promise.any`), dan resolve saat model **tercepat pertama** sukses; stream lain dibiarkan selesai di latar belakang dan diabaikan agar tidak menunda jawaban..
- Mode single model: dropdown `#model` terhubung ke engine yang sama;; bila model pilihan gagal, jatuh ke cadangan otomatis sampai dapat jawaban..
- `streamChat` menerima `onChunk` opsional: bila diberikan, mensimulasikan efek mengetik(20ms/kata); bila `null`(mode paralel,, langsung mengembalikan teks penuh supaya pemenang tercepat tidak tertunda oleh efek ketik buatan..



## Retry & failover

- `streamChat` menganggap HTTP 200 dengan badan error(mis. error provider dari Zen) atau respons kosong sebagai kegagalan — bukan sukses — agar fallback/retry benar-benar berjalan..
- Ada timeout client 15 detik per model via `AbortController` + timeout mandiri pembacaan body(15s) agar model menggantung tidak memblokir pemenang tercepat.. Error `upstream timeout`/`fetch failed`/`respons tidak selesai` ikut diproses retry..
- `Promise.any` menolak `AggregateError` bila satu batch gagal semua; error-nya dinormalisasi agar retry/fallback lintas-batch dan antar-gelombang tetap berjalan..
- Pencarian model diulang hingga 2 gelombang penuh dengan backoff eksponensial berjitter(~1.2s,, 2s) + jeda pendinginan 2.5s antar gelombang,, sampai ada model sukses atau habis percobaan..



## Catatan penting

- File sumber memakai gaya penulisan tidak biasa(koma-titik tanpa spasi konsisten,. `node -c` valid meskipun tampak aneh; jangan"merapikan" tanpa tes..
- `server.js` punya timeout upstream(30s chat,, 15s models) dan tidak kirim header `Authorization` kosong;; `LOG_CHAT=1` mengaktifkan log request chat di konsol backend..
- Frontend membaca jawaban dari `message.content`, lalu fallback `message.reasoning_content`/`message.reasoning`(beberapa model seperti `ling` menaruh jawaban di kolom reasoning saat non-streaming).. Sesuaikan bila upstream mengubah format jawaban..

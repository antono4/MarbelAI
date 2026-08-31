<div align="center">

# Marbel AI

Chat dengan beragam model AI gratis tanpa akun dan tanpa biaya. Mengobrol dengan beragam model AI gratis sekaligus yang saling melengkapi untuk jawaban yang lebih akurat dan cepat.

**Link:**
- [Demo](https://antono4.github.io/MarbelAI/)
- [Backend di Render](https://marbel-ai.onrender.com)

</div>

---

## Fitur

- **Multi-model ensemble paralel** - menjalankan semua model gratis sekaligus (paralel,) mengambil jawaban tercepat,, dengan fallback otomatis dan retry ber-backoff..
- **Antarmuka chat modern** - tersedia berbagai tema, sidebar riwayat percakapan, dan dukungan blok kode..
- **Cepat dan responsif** - mode streaming dengan efek mengetik agar terasa ringan..
- **Tanpa dependency** - backend murni Node.js built-in tanpa satu pun package npm..
- **Siap deploy** - konfigurasi untuk Render Blueprint, Railway, Docker, dan GitHub Pages untuk frontend..

## Model Gratis(valid per 2026-08)

Model gratis upstream Zen(dari `https://opencode.ai/zen`) — hanya model berakhiran `-free` yang benar-benar gratis; model lain(Gemini,, GPT,, Claude,, dll.) butuh API key.. Roster di bawah adalah model yang dipakai aplikasi,, diurutkan berdasarkan prioritas:

| Model | Status |
|---|---|
| `ling-3.0-flash-fin-free` | Cepat dan stabil — prioritas utama |
| `mimo-v2.5-free` | Populer,, sesekali rate-limit |
| `laguna-s-2.1-free` | Bisa sukses tapi lambat |
| `nemotron-3.5-lightning-free` | Sangat lambat(tetap dicoba sebagai cadangan) |
| `glm-4.7-flash` / `glm-4.5-flash`(Z.ai) | Model Z.ai **gratis** — ikut melayani bila backend punya `ZAI_API_KEY` |

Model yang lama dan sudah tidak dipakai: `hy3-free`(tidak didukung), `nemotron-3-ultra-free`(request menggantung), `deepseek-v4-flash-free` dan `muse-spark-1.2-contributor-free`(error dari provider)。

## Menjalankan Secara Lokal

Prasyarat Node.js versi 18 atau lebih baru.

```bash
git clone https://github.com/antono4/MarbelAI.git
cd MarbelAI
PORT=12000 UPSTREAM=https://opencode.ai/zen node server.js
```

Buka `http://localhost:12000` di browser. Tanpa variabel `UPSTREAM`, server memakai default `http://localhost:20128` untuk pengembangan lokal dengan proxy lain..

## Konfigurasi (Environment Variables)

| Variabel | Default | Deskripsi |
|---|---|---|
| `PORT` | `12000` | Port HTTP server |
| `UPSTREAM` | `http://localhost:20128` | Base URL endpoint OpenAI-compatible (contoh Zen `https://opencode.ai/zen/v1`) |
| `API_KEY` | kosong | API key upstream untuk otentikasi `/v1` (boleh kosong bila tidak butuh) |
| `ZAI_UPSTREAM` | `https://api.z.ai/api/paas/v4` | Upstream cadangan Z.ai (GLM, OpenAI-compatible) — dipakai bila upstream utama gagal/401/5xx |
| `ZAI_API_KEY` | kosong | API key Z.ai (opsional) — bila diisi, model `glm-4.7-flash` & `glm-4.5-flash` ikut melayani |
| `ALLOW_ORIGIN` | `*` | Origin yang diizinkan untuk CORS |
| `USE_SSE` | `1` | Mode streaming (`1` = stream, `0` = JSON biasa) |
| `LOG_CHAT` | kosong | Bila `1`, log request chat di konsol backend |

Lihat salinan penuh di `.env.example`.

## API

| Endpoint | Metode | Deskripsi |
|---|---|---|
| `/` | `GET` | UI statis (`index.html`) |
| `/api/models` | `GET` | Daftar model yang tersedia dari upstream (timeout 15 detik) |
| `/api/status` | `GET` | Info upstream & ketersediaan key Z.ai (dipakai frontend untuk mengunci model GLM) |
| `/api/chat` | `POST` | Proksi ke `/v1/chat/completions` upstream (timeout 30 detik) |

Contoh permintaan chat:

```bash
curl -X POST http://localhost:12000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"model": "ling-3.0-flash-fin-free", "messages": [{"role": "user", "content": "Halo, siapa kamu?"}]}'
```

## Docker

```bash
docker build -t marbel-ai .
docker run -p 10000:10000 \
  -e PORT=10000 \
  -e UPSTREAM=https://opencode.ai/zen \
  marbel-ai
```

Buka `http://localhost:10000`.

## Deployment

Proyek ini mendukung beberapa platform:

- **Render** - gunakan `render.yaml` sebagai Render Blueprint (gratis..
- **Railway** - gunakan `railway.json` sebagai konfigurasi build atau deploy..
- **GitHub Pages** - frontend statis berfungsi di GitHub Pages dan backend memakai default `https://marbel-ai.onrender.com` yang bisa di-override dengan parameter query `?backend=URL`..
- **Docker** - lihat bagian Docker di atas..

## Struktur Proyek

```
MarbelAI/
- server.js       Backend static file server dan proxy OpenAI-compatible
- app.js          Frontend logika chat, streaming, dan ensemble multi-model
- index.html      Halaman utama UI
- styles.css       Tema dan gaya
- Dockerfile       Image Docker
- render.yaml      Blueprint Render
- railway.json     Konfigurasi Railway
- .env.example     Contoh variabel lingkungan
```

## Lisensi

Didistribusikan di bawah [Lisensi MIT](LICENSE. Copyright 2026 [Antono4](https://github.com/antono4..

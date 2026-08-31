<div align="center">

# Marbel AI

Chat dengan beragam model AI gratis tanpa akun dan tanpa biaya. Mengobrol dengan 6 model AI gratis sekaligus yang saling melengkapi untuk jawaban yang lebih akurat dan cepat.

**Link:**
- [Demo](https://antono4.github.io/MarbelAI/)
- [Backend di Render](https://marbel-ai.onrender.com)

</div>

---

## Fitur

- **Multi-model ensemble** - menjalankan 6 model gratis sekaligus dan mengambil jawaban tercepat dengan fallback otomatis.
- **Antarmuka chat modern** - tersedia berbagai tema, sidebar riwayat percakapan, dan dukungan blok kode..
- **Cepat dan responsif** - mode streaming dengan efek mengetik agar terasa ringan..
- **Tanpa dependency** - backend murni Node.js built-in tanpa satu pun package npm..
- **Siap deploy** - konfigurasi untuk Render Blueprint, Railway, Docker, dan GitHub Pages untuk frontend..

## Model Gratis (Upstream Zen dari opencode.ai)

| Model | Status |
|---|---|
| `ling-3.0-flash-fin-free` | Cepat dan stabil（prioritas utama） |
| `nemotron-3-ultra-free` | Cepat dan stabil |
| `mimo-v2.5-free` | Populer, kadang rate-limit |
| `laguna-s-2.1-free` | Bisa sukses tapi lambat |
| `glm-4.7-flash` (Z.ai) | Model Z.ai **gratis** di API Z.ai — ikut melayani bila `ZAI_API_KEY` diisi |
| `glm-4.5-flash` (Z.ai) | Model Z.ai **gratis** di API Z.ai — ikut melayani bila `ZAI_API_KEY` diisi |
| `hy3-free` | Tidak didukung upstream |
| `nemotron-3.5-lightning-free` | Sangat lambat |
| `deepseek-v4-flash-free` dan `muse-spark-1.2-contributor-free` | Error dari provider |

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

Lihat salinan penuh di `.env.example`.

## API

| Endpoint | Metode | Deskripsi |
|---|---|---|
| `/` | `GET` | UI statis (`index.html`) |
| `/api/models` | `GET` | Daftar model yang tersedia dari upstream (timeout 15 detik) |
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

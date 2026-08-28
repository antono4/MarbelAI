# Marbel AI

Chat UI untuk mengakses beragam model AI **gratis** melalui [Zen (opencode.ai)](https://opencode.ai) — endpoint OpenAI-compatible gratis tanpa akun & tanpa API key. Tampilan dan gaya agent chat dengan sidebar, welcome screen, slider topik, dan daftar model yang siap dipakai.

## Fitur

- 💬 Chat ke model AI gratis (OpenCode — tanpa akun & tanpa API key)
- 🖥️ Sidebar *Conversations* (new thread, riwayat per percakapan)
- 🎠 Slider topik saran yang meluncur horizontal
- 🧩 Daftar **model yang benar-benar siap dipakai** di halaman depan
- 🕒 Badge *"Marbel AI is working"* saat AI sedang memproses
- 🤖 Identitas asisten: selalu memperkenalkan diri sebagai **Marbel AI**
- ☰ Tombol hamburger untuk menciutkan/membuka sidebar

## Cara menjalankan

1. Jalankan backend — `npm install` dulu bila perlu (opsional; untuk production gunakan hosting publik, lihat bagian deploy di bawah)
2. Set `UPSTREAM` ke endpoint OpenAI-compatible (misalnya Zen — `https://opencode.ai/zen`; tanpa API key, `API_KEY` boleh kosong). Lalu jalankan server UI:

```bash
cd MarbelAI
PORT=12000 UPSTREAM=https://opencode.ai/zen node server.js
```

3. Buka `http://localhost:12000` (atau akses lewat host yang Anda pakai).

## Struktur

| File | Fungsi |
| --- | --- |
| `index.html` | Struktur halaman UI |
| `styles.css` | Tampilan & tema |
| `app.js` | Logika chat, percakapan, model, identitas |
| `server.js` | Server statis + proxy ke endpoint `/v1` OpenAI-compatible (API key disuntik di server bila diatur) |

## Catatan

`server.js` membungkus endpoint `/v1/chat/completions` upstream sebagai `/api/chat` agar API key (bila ada) tidak tersimpan di browser. Semua permintaan yang masuk menuju model gratis (*free*) yang tersedia di upstream (misalnya `mimo-v2.5-free`).

## Deploy ke backend publik (agar GitHub Pages benar-benar berfungsi)

GitHub Pages hanya menyajikan file statis, jadi untuk chat berjalan perlu **backend publik** yang menjalankan `server.js` **dan** dapat menjangkau upstream OpenAI-compatible (misalnya Zen). Ikuti langkah berikut:

1. **Pilih hosting** (Render / Railway / Fly.io / VPS). Gunakan file yang sudah disertakan:
   - `render.yaml` — Render Blueprint
   - `railway.json` — Railway
   - `Dockerfile` + `package.json` — Docker/VPS
2. **Set environment di platform tsb** (lihat `.env.example`):
   - `PORT=10000`
   - `UPSTREAM=https://opencode.ai/zen` — endpoint OpenAI-compatible gratis (Zen; tidak perlu API key)
   - `API_KEY=` (kosongkan bila upstream tidak butuh key)
   - `ALLOW_ORIGIN=*`
   - `USE_SSE=0`
3. **Arahkan UI GitHub Pages ke backend** tersebut dengan parameter URL:
   ```
   https://<user>.github.io/MarbelAI/?backend=https://<deployed-backend-url>
   ```
   atau ubah `DEFAULT_BACKEND` di `app.js`.

> ⚠️ Penting: upstream (seperti Zen `https://opencode.ai/zen`) harus bisa dijangkau dari backend publik Anda. CORS sudah diterapkan di `server.js` agar request lintas-origin dari GitHub Pages diterima.


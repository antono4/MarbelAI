# Marbel AI

Chat UI untuk mengakses beragam model AI **gratis** melalui [9Router](https://github.com/decolua/9router). Tampilan meniru gaya agent chat dengan sidebar, welcome screen, slider topik, dan daftar model yang siap dipakai.

## Fitur

- 💬 Chat ke model AI gratis (OpenCode — tanpa akun & tanpa API key)
- 🖥️ Sidebar *Conversations* (new thread, riwayat per percakapan)
- 🎠 Slider topik saran yang meluncur horizontal
- 🧩 Daftar **model yang benar-benar siap dipakai** di halaman depan
- 🕒 Badge *"Marbel AI is working"* saat AI sedang memproses
- 🤖 Identitas asisten: selalu memperkenalkan diri sebagai **Marbel AI**
- ☰ Tombol hamburger untuk menciutkan/membuka sidebar

## Cara menjalankan

1. Pastikan 9Router berjalan di `localhost:20128` (lihat README 9Router).
2. Atur API key 9Router dan jalankan server UI:

```bash
cd MarbelAI
API_KEY="sk-..." PORT=12000 node server.js
```

3. Buka `http://localhost:12000` (atau akses lewat host yang Anda pakai).

## Struktur

| File | Fungsi |
| --- | --- |
| `index.html` | Struktur halaman UI |
| `styles.css` | Tampilan & tema |
| `app.js` | Logika chat, percakapan, model, identitas |
| `server.js` | Server statis + proxy ke endpoint `/v1` 9Router (API key disuntik di server) |

## Catatan

`server.js` membungkus endpoint `/v1/chat/completions` 9Router sebagai `/api/chat` agar API key tidak tersimpan di browser. Semua permintaan yang masuk menuju model `oc/*` (OpenCode, gratis).

### Menjalankan dari GitHub Pages (host statis hanya)

GitHub Pages tidak menjalankan `server.js`. Jika UI di-host statis di GitHub Pages, `app.js` otomatis memanggil backend live (`API_BASE` -> host yang menjalankan `server.js`) secara lintas-origin. Untuk itu server UI perlu dijalankan dengan CORS yang diizinkan:

```bash
API_KEY="sk-..." PORT=12000 ALLOW_ORIGIN=* node server.js
```

Default `GHPAGES_BACKEND` di `app.js` menunjuk ke host runtime Marbel AI. Sesuaikan jika backend Anda di alamat lain.

## Deploy ke backend publik (agar GitHub Pages benar-benar berfungsi)

GitHub Pages hanya menyajikan file statis, jadi untuk chat berjalan perlu **backend publik** yang menjalankan `server.js` **dan** dapat menjangkau 9Router. Ikuti langkah berikut:

1. **Pilih hosting** (Render / Railway / Fly.io / VPS). Gunakan file yang sudah disertakan:
   - `render.yaml` — Render Blueprint
   - `railway.json` — Railway
   - `Dockerfile` + `package.json` — Docker/VPS
2. **Set environment di platform tsb** (lihat `.env.example`):
   - `PORT=10000`
   - `UPSTREAM=` URL **publik 9Router** Anda (9Router itu sendiri juga perlu di-host publik/kontainer yang bisa dijangkau dari internet, bukan `localhost`)
   - `API_KEY=` key 9Router
   - `ALLOW_ORIGIN=*`
   - `USE_SSE=0`
3. **Arahkan UI GitHub Pages ke backend** tersebut dengan parameter URL:
   ```
   https://<user>.github.io/MarbelAI/?backend=https://<deployed-backend-url>
   ```
   atau ubah `DEFAULT_BACKEND` di `app.js`.

> ⚠️ Penting: di sandbox/lingkungan ini 9Router hanya berjalan di `localhost`, sehingga backend publik harus menunjuk ke 9Router yang juga di-host publik. CORS sudah diterapkan di `server.js` agar request lintas-origin dari GitHub Pages diterima.
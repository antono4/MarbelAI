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
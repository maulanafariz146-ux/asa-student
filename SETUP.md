# Status Supabase

Aplikasi ASA saat ini adalah prototipe antarmuka pengelolaan sekolah. Buka `index.html` di browser, lalu pilih peran demo:

- Admin sekolah: `admin@asa.demo`
- Guru: `walas@asa.demo`
- Wali murid: `ortu@asa.demo`

Data demo, akun, catatan buku penghubung, pesan, dan kalender disimpan di `localStorage` browser. Login demo hanya memilih peran dan bukan autentikasi. Pembatasan akses pada prototipe ini juga tidak aman untuk melindungi data nyata.

## Fitur prototipe

- Admin mengelola profil sekolah, kelas, akun, penempatan/peran akun, status akses, dan agenda kalender.
- Guru melihat informasi kelas, membuat/mengubah/menghapus catatan buku penghubung untuk siswa di kelasnya, serta bertukar pesan dengan wali murid.
- Wali murid melihat informasi anak dan catatan buku penghubung, mengirim pesan ke guru, dan melihat kalender.
- Wali murid hanya dapat membaca buku penghubung; perubahan catatan dilakukan oleh guru.

## Catatan backend

Data utama aplikasi belum terhubung ke Supabase. `supabase-config.js` dan [`schema.sql`](./schema.sql) adalah sisa dari versi ASA analitik kampus sebelumnya. Skema tersebut berisi model mahasiswa, admin, dan data akademik, sehingga **tidak cocok untuk aplikasi sekolah dan jangan dijalankan untuk prototipe ini**.

Sebelum menggunakan data nyata atau membagikan aplikasi sebagai layanan, rancang backend dan autentikasi untuk model sekolah, terapkan otorisasi di server/database, dan uji akses per peran. Jangan menganggap `localStorage` atau pergantian peran demo sebagai kontrol keamanan.

## Menjalankan demo ASA AI dengan Gemini

ASA AI mengirim pertanyaan umum dan maksimal 10 pesan percakapan terakhir ke Gemini. Profil, nilai, status, dan nama anak dari aplikasi tidak dikirim. Pesan yang diketik pengguna tetap dikirim ke Google, jadi jangan masukkan nama, sekolah, kondisi, atau informasi pribadi anak.

1. Pasang Node.js 18 atau lebih baru.
2. Buka file `.env` di folder utama proyek, sejajar dengan `server.js`.
3. Tempel API key Gemini pada **baris 1**, setelah `GEMINI_API_KEY=`. Jangan bagikan file `.env`.
4. Buka terminal di folder utama proyek dan jalankan `node server.js`.
5. Buka `http://127.0.0.1:3000` di browser. Jika port 3000 sudah digunakan, jalankan `$env:PORT=3001` lalu `node server.js`, kemudian buka `http://127.0.0.1:3001`. ASA AI tidak bekerja jika halaman dibuka langsung sebagai `index.html`.

API key hanya dibaca oleh backend lokal dan tidak dimasukkan ke browser. Jika model yang dikonfigurasi tidak tersedia untuk akun Gemini Anda, ubah `GEMINI_MODEL` pada baris berikutnya di `.env`.

## Menyiapkan deployment Node.js

Proyek ini menyediakan perintah `npm start` untuk hosting Node.js. Pada layanan hosting, atur:

- Start command: `npm start`
- `HOST=0.0.0.0`
- `GEMINI_API_KEY` dan `GEMINI_MODEL` sebagai environment variables rahasia di dashboard hosting

Hosting menyediakan nilai `PORT` secara otomatis. Jangan unggah `.env` atau `dataset-rekap-murid.csv` ke GitHub; file CSV tersebut dapat berisi data pribadi murid. Gunakan hanya data contoh saat demo. Aplikasi masih menyimpan data aplikasi di browser dan belum memiliki autentikasi/otorisasi yang layak untuk data nyata.
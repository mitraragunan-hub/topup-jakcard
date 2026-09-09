# Aplikasi Kasir & Laporan Penjualan JakCard (Mitra Ragunan Hub)

Aplikasi ini adalah sistem kasir (Point of Sale) dan pelaporan berbasis web yang dirancang khusus untuk manajemen penjualan dan top-up JakCard di lingkungan Mitra Ragunan Hub. 

Aplikasi dibangun menggunakan teknologi modern dengan antarmuka yang responsif, dirancang untuk memudahkan pencatatan transaksi harian sekaligus menghasilkan laporan komprehensif.

## 🚀 Teknologi yang Digunakan

* **Frontend Framework**: React 18 dengan TypeScript
* **Build Tool**: Vite
* **Styling**: Tailwind CSS (sangat disesuaikan untuk UI yang bersih dan modern)
* **Ikon**: Lucide React
* **Backend / Database**: Firebase (Firestore untuk penyimpanan data real-time, Firebase Auth untuk otentikasi)
* **Hosting / Deployment**: Terhubung dengan repositori GitHub untuk *Continuous Deployment*.

## 📁 Struktur Proyek

Struktur folder utama dirancang sederhana namun mudah dikembangkan:

```
├── src/
│   ├── lib/
│   │   └── firebase.ts      # Konfigurasi dan inisialisasi Firebase
│   ├── App.tsx              # File utama yang berisi SEMUA logika UI, State, dan routing internal
│   ├── index.css            # Entry point untuk Tailwind CSS
│   ├── main.tsx             # Entry point React
│   └── vite-env.d.ts
├── public/
│   └── (aset statis)
└── package.json
```

**Catatan Penting**: Sebagian besar logika antarmuka pengguna (UI), manajemen state (React `useState`, `useEffect`), kalkulasi, dan komponen navigasi (Kasir, Analitik, Profil) saat ini disatukan di dalam file `src/App.tsx`.

## ✨ Fitur Utama

1. **Otentikasi Aman (Login)**
   - Menggunakan Firebase Authentication (Email & Password).
   - Melindungi rute aplikasi; pengguna harus login sebelum bisa mengakses halaman kasir dan laporan.

2. **Halaman Kasir (Point of Sale)**
   - **Mode Input**: Top-up Saldo dan Penjualan Kartu (Perdana).
   - **Sesi Kerja**: Pencatatan dibagi menjadi dua sesi, yaitu **Sesi Siang** dan **Sesi Malam**.
   - **Metode Pembayaran**: Memisahkan transaksi **Tunai** dan **Non-Tunai** (QRIS/Transfer).
   - **Nominal Kartu**: Mendukung penjualan JakCard nominal Rp 20.000 dan Rp 50.000.
   - *User Experience*: Menggunakan animasi modal (*glassmorphism*), *feedback* berupa notifikasi *toast* (berhasil/gagal), dan input form yang otomatis bersih setelah transaksi.

3. **Analitik & Laporan (Dashboard)**
   - **Ringkasan Hari Ini**: Menampilkan ringkasan langsung (Topup Tunai, Topup Non-Tunai, Total Kartu Terjual).
   - **Filter Tanggal & Sesi**: Memungkinkan filter data berdasarkan rentang tanggal tertentu dan sesi (Siang/Malam/Semua).
   - **Tabel Transaksi Detail**: Daftar lengkap semua transaksi yang berhasil dicatat dengan kemampuan untuk menghapus data yang salah input.

4. **Laporan Penjualan Kartu (Fitur Baru)**
   - Laporan rekapitulasi khusus untuk **Penjualan Kartu** (tidak termasuk Topup) yang sangat rinci.
   - **Tampilan Bulanan**: 
     - Menampilkan rekap harian dalam satu bulan (Tanggal 1 s.d akhir bulan).
     - Menampilkan nama hari.
     - Menyajikan total kartu terjual (Saldo 20 & 50) dengan pembagian detail jumlah terjual secara **Non-Tunai** dan **Tunai**.
     - Memiliki indikator *breakdown* kotak visual (S: Siang, M: Malam) untuk setiap harinya.
   - **Tampilan Tahunan**: 
     - Merekap penjualan kartu secara kumulatif setiap bulannya selama setahun penuh.
   - Seluruh angka di tabel laporan sudah diformat dengan titik pemisah ribuan agar mudah dibaca.

## 🗄️ Struktur Database (Firestore)

Data disimpan di koleksi `records`. Setiap dokumen merepresentasikan satu sesi rekap/transaksi dengan *schema* yang dikelola secara fleksibel:

- `tanggal`: (String) Format YYYY-MM-DD.
- `sesi`: (String) "Siang" atau "Malam".
- `ntk20` / `ntk50`: (Number) Jumlah kartu terjual Non-Tunai (Saldo 20 & 50).
- `tk20` / `tk50`: (Number) Jumlah kartu terjual Tunai (Saldo 20 & 50).
- `tTopup`: (Number) Total Top-up Tunai (Rp).
- `ntTopup`: (Number) Total Top-up Non-Tunai (Rp).
- `timestamp`: Field waktu transaksi untuk pengurutan.

## 🛠️ Panduan Pengembangan Lokal

Untuk menjalankan atau memodifikasi aplikasi ini di komputer lokal:

1. **Pastikan Node.js terinstall**.
2. Buka terminal, masuk ke direktori proyek.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Jalankan server pengembangan lokal:
   ```bash
   npm run dev
   ```
5. Buka `http://localhost:5173` di browser Anda.

## 🚀 Panduan Deployment

Aplikasi ini menggunakan alur *Continuous Deployment* melalui GitHub.

1. Setiap perubahan (kode baru, fitur baru, perbaikan bug) dilakukan di lingkungan lokal atau IDE.
2. Perubahan di-*commit* dan di-*push* ke branch `main` repositori `mitraragunan-hub/topup-jakcard`:
   ```bash
   git add .
   git commit -m "deskripsi fitur yang diubah"
   git push origin main
   ```
3. Layanan hosting yang terhubung (seperti Vercel atau Netlify) akan mendeteksi perubahan tersebut secara otomatis dan memulai proses *build*.
4. Setelah 1-2 menit, pembaruan akan langsung aktif (*live*) di alamat web aplikasi. Pengguna hanya perlu me-*refresh* halaman (F5) untuk mendapatkan versi terbaru.

---
*Dokumentasi ini diperbarui untuk merefleksikan arsitektur sistem terbaru termasuk penambahan fitur detail Laporan Bulanan/Tahunan Siang & Malam.*

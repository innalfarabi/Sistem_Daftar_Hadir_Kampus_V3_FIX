# Sistem Daftar Hadir Kampus

## Deployment setelah revisi
1. Ganti isi Code.gs dan Index.html dengan file terbaru.
2. Simpan semua file.
3. Apps Script: Deploy > Manage deployments.
4. Edit deployment Web app, buat versi baru, lalu Deploy.
5. Buka URL Web App terbaru.

## Login Admin
ID: admin
Password: admin

Admin wajib memilih tombol Admin. User wajib memilih tombol User.

## Catatan
Jangan membuka Index.html langsung dari komputer. Fitur login memakai google.script.run dan hanya berjalan pada URL Web App Google Apps Script.


## Revisi v2.1 — Akses Rekap

- Menu **Rekap & Laporan** hanya ditampilkan ketika login dalam **mode Admin**.
- Pada mode User, menu Rekap disembunyikan pada navigasi desktop dan mobile.
- Jika fungsi `switchTab('rekap')` dipanggil secara paksa, sistem akan menolak dan kembali ke Dashboard.
- Fungsi pemuatan data rekap juga memiliki pengaman role di frontend.
- Backend `getReport()` tetap memvalidasi sesi sebagai Admin, sehingga User tidak dapat mengambil data rekap melalui pemanggilan fungsi server.

### Setelah mengganti file
1. Simpan `Code.gs` dan `Index.html`.
2. Deploy > Manage deployments.
3. Edit Web App.
4. Pilih **New version**.
5. Deploy dan buka kembali URL Web App.

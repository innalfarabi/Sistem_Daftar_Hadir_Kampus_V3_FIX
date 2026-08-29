# V3 - Perbaikan Web App Google Apps Script

Perbaikan utama:
- `doGet()` menggunakan `createHtmlOutputFromFile()` agar serving HTML lebih sederhana.
- `Index.html` tetap bisa dibuka lokal untuk testing; tidak lagi memaksa koneksi Apps Script.
- Login lokal tetap memiliki simulasi admin `admin/admin`.
- Saat dijalankan sebagai Web App, `google.script.run` otomatis dipakai untuk database.
- Semua button dibuat `type="button"` agar tidak menyebabkan navigasi/submit tak sengaja.
- Ditambahkan `<base target="_top">` dan pencegahan submit form untuk kompatibilitas HTML Service iframe.
- Rekap & Laporan hanya ditampilkan dan dapat diakses oleh Admin.
- User/Admin switch dan show password tetap tersedia.

## Instalasi
1. Di Apps Script, hapus isi `Code.gs`, tempel `Code.gs` dari paket ini.
2. Hapus isi `Index.html`, tempel `Index.html` dari paket ini.
3. Simpan.
4. Jalankan `setupDatabase()` sekali.
5. Deploy > Manage deployments > Edit.
6. Pilih `New version`, lalu Deploy.
7. Buka URL `/exec` dari deployment tersebut.
8. Jangan gunakan file HTML lokal sebagai URL produksi. File lokal hanya untuk uji tampilan/fungsi simulasi.

## Login Admin
ID: `admin`
Password: `admin`

## Catatan penting
Jika deployment lama masih terbuka di tab browser, tutup tab tersebut dan buka kembali URL `/exec` setelah membuat versi deployment baru.

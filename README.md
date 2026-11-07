# Menu Mingguan

Perencana 7 set menu rumahan Indonesia per minggu: generate menu (utama + pendamping + menu anak),
daftar belanja per kategori yang tersimpan seminggu, atur ulang urutan hari, tandai sudah dimasak,
detail resep, dan favorit.

Ada dua versi yang memakai data resep yang sama:

| Folder | Isi |
| --- | --- |
| `web/` | Web app gaya iPhone — bisa langsung dicoba di browser dan di iPhone (Add to Home Screen) |
| `ios/MenuMingguan.swiftpm/` | Aplikasi SwiftUI (iOS 17+) — dibuka di Xcode atau Swift Playgrounds |
| `data/` | Sumber data: `menus.json` (daftar menu & pasangan), `ingredients.json` (kosakata bahan), `recipes/part-*.json` (resep) |
| `tools/` | `build_data.py` (gabungkan data), `check_part.py` (validasi resep) |

## Versi online

https://juliansl.github.io/daily-menu/ — otomatis diperbarui setiap kali ada push ke `main`
(workflow `.github/workflows/pages.yml`). Di iPhone: buka di Safari → Share → Add to Home Screen.

## Menjalankan web app di komputer

```bash
python -m http.server 5173 --directory web
```

Buka http://localhost:5173. Data (menu minggu ini, centang belanja, favorit) tersimpan di browser.

**Di iPhone:** web app harus bisa diakses dari iPhone. Cara cepat di jaringan Wi-Fi yang sama: jalankan
perintah di atas, lalu buka `http://<IP-komputer>:5173` di Safari iPhone → tombol Share → **Add to Home Screen**.
Untuk mode offline penuh (service worker), web app perlu di-host lewat HTTPS, misalnya GitHub Pages atau Netlify
(cukup unggah isi folder `web/`).

## Menjalankan aplikasi SwiftUI

- **Mac:** buka folder `ios/MenuMingguan.swiftpm` di Xcode 15+, pilih simulator iPhone, tekan Run.
  Untuk memasang di iPhone sendiri, pilih Team (Apple ID) di pengaturan Signing.
- **iPad tanpa Mac:** salin folder `MenuMingguan.swiftpm` ke iPad (mis. lewat iCloud Drive), buka di aplikasi
  **Swift Playgrounds**, lalu tekan Run.

Kode SwiftUI ditulis di Windows dan belum pernah dikompilasi. Kalau Xcode menampilkan error saat build pertama,
salin pesan error-nya untuk diperbaiki.

## Mengubah data menu atau resep

1. Edit `data/menus.json` (tambah/hapus menu, pasangan pendamping default, tanda ramah anak, favorit awal)
   atau file di `data/recipes/` (bahan & langkah). Bahan wajib memakai `id` dari `data/ingredients.json`;
   `qty` ditulis dalam unit bahan tersebut (atau `null` untuk "secukupnya").
2. Validasi: `python tools/check_part.py data/recipes/part-a.json`
3. Gabungkan: `python tools/build_data.py` — memperbarui `web/data.js` dan `ios/MenuMingguan.swiftpm/Resources/appdata.json`.

Asumsi data saat ini: resep dewasa untuk 4 porsi, menu anak untuk 2 porsi; minggu dimulai Senin
(jika hari ini bukan Senin, menu dibuat untuk minggu depan). Bahan "stok dapur" (garam, gula, minyak,
merica, kaldu bubuk) otomatis tercentang di daftar belanja.

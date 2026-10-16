# 🧪 TestCase Buddy

Agen chat mungil yang membantu membuat test case dari deskripsi fitur. Dikembangkan dengan bantuan IBM Bob untuk Capstone Project IBM SkillsBuild x Hacktiv8.

## Fitur

- Antarmuka chat: ketik deskripsi fitur, agen membalas dengan tabel test case
- Mengenali empat jenis fitur: Login, Pendaftaran, Upload File, dan Pembayaran
- Aturan di deskripsi (misalnya "minimal 8 karakter", "5 kali gagal", "15 menit") ikut dipakai di test case
- Tabel berisi ID, Skenario, Tipe (Positif/Negatif/Edge), Pra-kondisi, Langkah, Data Uji, Hasil yang Diharapkan, dan Prioritas
- Tombol contoh cepat untuk langsung mencoba

## Cara menjalankan

1. Unduh `index.html`, `style.css`, dan `script.js` ke satu folder.
2. Buka `index.html` di browser.
3. Ketik deskripsi fitur, misalnya:
   > Fitur login: pengguna memasukkan email dan password. Password minimal 8 karakter. Setelah 5 kali gagal, akun terkunci 15 menit.

Tanpa instalasi, library, atau API key.

## Cara kerja

Agen ini berbasis aturan (rule-based). Ia mendeteksi kata kunci pada deskripsi untuk menentukan jenis fitur, lalu menyusun test case dari template dan angka yang ditemukan di deskripsi. Agen ini tidak memanggil model AI.

## Teknologi

HTML, CSS, dan JavaScript tanpa framework.

## Proses pengembangan

Dibangun dengan prompt tiga layer di IBM Bob (Role & Context, Task & Requirements, Constraints & Output) dan disempurnakan dalam tiga iterasi. Setiap iterasi hanya merevisi layer yang bermasalah. Pelajaran utamanya: hasil AI perlu dicek ulang, terutama soal angka 🔎

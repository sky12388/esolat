---
marp: true
theme: default
paginate: true
header: 'e-Solat Display System'
footer: 'Skywalker Consortium (SSM: AS0463209-A) | Carl Kelana: +60 10-318 4047'
style: |
  section {
    background-color: #021a14;
    color: #f8fafc;
    font-family: 'Outfit', -apple-system, sans-serif;
    padding: 35px 40px;
  }
  h1 {
    color: #fbbf24;
    font-weight: 900;
  }
  h2 {
    color: #34d399;
    font-weight: 800;
  }
  h3 {
    color: #ffffff;
    font-weight: 700;
  }
  table {
    font-size: 15px;
    border-collapse: collapse;
    width: 100%;
  }
  th {
    background-color: #064e3b;
    color: #fbbf24;
    padding: 8px;
  }
  td {
    padding: 8px;
    border-bottom: 1px solid #1e293b;
  }
  .card {
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 12px 16px;
    margin: 8px 0;
  }
  .tv-box {
    background: #090d16;
    border: 3px solid #10b981;
    border-radius: 12px;
    padding: 15px;
    margin: 10px 0;
  }
---

# 🕌 e-Solat Display System
## Sistem Paparan Digital & Pengurusan Kariah Pintar
**Solusi Autonomi 24/7 Berasaskan Debian Linux untuk Masjid & Surau Moden**

---
* **Entiti:** Skywalker Consortium (SSM: AS0463209-A)
* **Pegawai Perhubungan:** Carl Kelana Abdul Latiff
* **WhatsApp / Telefon:** [+60 10-318 4047](https://wa.me/60103184047?text=Assalamualaikum%20En%20Carl,%20saya%20berminat%20dengan%20Sistem%20e-Solat%20Display)
* **Emel Rasmi:** skywalker.co@proton.me

---

# 🌟 Visi Pemerkasaan Masjid Pintar

* 🕌 **Ketepatan Ibadah:** Penyelarasan takwim solat rasmi JAKIM secara automatik mengikut zon kariah tanpa perlu pelarasan jam manual.
* 📢 **Komunikasi Pantas:** Hebahan aktiviti, kuliah mingguan, dan pengumuman segera disiarkan secara dinamik di skrin televisyen dewan solat.
* 💳 **Infaq Tanpa Tunai:** Memudahkan jemaah menyumbang ke tabung pembangunan & kebajikan surau melalui imbasan Kod QR DuitNow.
* 📲 **Kemudahan AJK:** Pengurusan paparan yang boleh dikendalikan dengan mudah oleh barisan AJK terus melalui telefon pintar.

---

# 🛡️ Ketahanan Enjin & Senibina Sistem

* 🐧 **Enjin Debian Linux 64-bit**
  * Beroperasi secara kendiri 24/7 dengan kestabilan tahap pelayan industri. Kebal virus, sifar gangguan restart paksa, dan memastikan paparan kekal lancar setiap masa.
* ⚡ **Perlindungan Auto-Recovery**
  * Dilengkapi mekanisme Auto-Boot & Kiosk Recovery. Sekiranya berlaku gangguan bekalan elektrik (blackout), sistem terus menyala dan memulihkan paparan TV secara automatik.
* 📶 **100% Autonomi Luar Talian (Offline Autonomy)**
  * Seluruh kalendar takwim solat JAKIM setahun penuh disimpan di dalam pangkalan data tempatan (local SQLite). Beroperasi 100% tepat selama 365 hari tanpa internet.

---

# 🎯 Keupayaan Teras Sistem (Core Features)

* 🕌 **Integrasi Penuh Takwim JAKIM**
  * Selaras automatik mengikut zon rasmi negeri di seluruh Semenanjung, Sabah, dan Sarawak (cth: SGR01, WLY01, KDH02).
* 🔊 **Audio Azan & Peringatan Iqamah ke PA Sistem**
  * Sambung ke amplifier surau untuk nada amaran pra-azan, alunan azan, dan bunyi isyarat detik iqamah secara automatik.
* ⏱️ **Kiraan Detik (Countdown) Solat & Iqamah**
  * Memaparkan baki masa tepat menuju waktu azan dan selang masa menunggu iqamah yang boleh dilaraskan (5–15 minit).
* 📢 **Hebahan Teks Berjalan (Running Ticker)**
  * Bar mesej teks bergerak bagi menghebahkan makluman kariah, jadual kuliah harian, dan peringatan adab surau.

---

# 📲 Kawalan Pantas Mobile Admin App (PWA)

**Kawal dan kemas kini paparan TV terus dari telefon pintar AJK.**

* 💬 **Tukar Teks Hebahan Serta-merta:** Taip mesej pengumuman di telefon, teks terus berjalan di skrin TV dewan solat.
* 🖼️ **Muat Naik Poster Tanpa Pendrive:** Pilih gambar dari galeri telefon AJK dan muat naik terus ke TV jemaah.
* 🔒 **Akses Rangkaian Tempatan Selamat:** Dilindungi kata laluan pentadbir melalui Wi-Fi surau. Menyokong Android, iOS, iPad, & Laptop.
* ✨ **Pelayar Web Mudah:** Boleh dibuka terus melalui pelayar web telefon pintar tanpa perlu muat turun aplikasi tambahan.

---

# 📱 Simulasi Antaramuka: Mobile Admin Panel

<div class="card" style="border: 2px solid #f59e0b;">
  <b>🕌 e-Solat Admin • Surau Darul Taqwa</b> | Status: <span style="color:#34d399;">🟢 Kiosk Online</span><br>
  <hr style="margin:6px 0; opacity:0.3;">
  <b>Tab Navigasi:</b> [📢 Teks Hebahan] &bull; [🖼️ Poster Kuliah] &bull; [⏱️ Waktu Solat] &bull; [⚙️ Tetapan Sistem]<br>
  <hr style="margin:6px 0; opacity:0.3;">
  <b>Borang Hebahan Semasa:</b><br>
  <i>"Selamat Datang ke Surau Darul Taqwa. Kuliah Maghrib Perdana malam ini..."</i><br>
  <hr style="margin:6px 0; opacity:0.3;">
  <b>Tindakan:</b> [💾 Simpan & Papar ke TV Serta-merta] ➔ <i>Mesej bertukar dalam 1 saat di TV jemaah.</i>
</div>

* **Keistimewaan:** Tiada pemasangan perisian rumit — buka terus melalui pelayar web telefon pintar barisan AJK.

---

# 🎛️ Modul Lengkap Admin Panel

* 📢 **Modul Hebahan Pintar:** Tulis mesej pengumuman kariah, hebahan solat jenazah, dan aktiviti surau terus ke running ticker TV.
* 🖼️ **Pengurus Media & Galeri Poster:** Muat naik gambar poster ceramah mingguan terus dari galeri telefon dan tetapkan masa putaran.
* ⏱️ **Pelaras Waktu Solat & Iqamah:** Pilihan zon JAKIM automatik, pelarasan minit (+/-) dan selang detik iqamah mengikut solat.
* 💳 **Pengurusan Infaq & Kawalan Kiosk:** Kemas kini Kod QR DuitNow bank surau dan butang kawalan pantas gelap skrin / but semula.

---

# 📺 Simulasi TV: Mod 1 — Paparan Standard / Takwim Rasmi Penuh (Default)

<div class="tv-box">
  <b>SURAU DARUL TAQWA (ZON SGR01)</b> | Jam: <b>12:45:30</b> | 16 Rabiulawal 1448H<br>
  <hr style="margin:6px 0; opacity:0.3;">
  <b>6 Kotak Solat:</b> Imsak (05:42) | Subuh (05:52) | Syuruk (07:05) | <b>⭐ Zohor (13:10)</b> | Asar (16:22) | Maghrib (19:15)<br>
  <hr style="margin:6px 0; opacity:0.3;">
  <b>Kiri (65%):</b> Slaid Poster Kuliah & Makluman Kariah<br>
  <b>Kanan (35%):</b> Kiraan Detik Solat Zohor (- 00:24:30) & Info DuitNow<br>
  <hr style="margin:6px 0; opacity:0.3;">
  <b>Ticker:</b> <i>Selamat Datang &bull; Sila senyapkan telefon bimbit &bull; Gotong-royong Ahad ini 8.00 pagi.</i>
</div>

* **Fungsi:** Paparan harian jemaah dengan takwim dominan dan selingan poster kuliah kariah.

---

# 📺 Simulasi TV: Mod 2 — Masuk Waktu Azan & Panggilan Solat

<div class="tv-box" style="border-color:#f59e0b; background:#1c1302;">
  <div style="color:#fbbf24; font-weight:bold; font-size:22px; text-align:center;">🔔 MASUK WAKTU SOLAT</div>
  <div style="font-size:26px; text-align:center; margin:10px 0;">حَيَّ عَلَى الصَّلَاةِ</div>
  <div style="font-size:20px; font-weight:bold; text-align:center; color:#ffffff;">AZAN ZOHOR — 13:10 (ZON SGR01)</div>
  <hr style="margin:8px 0; opacity:0.3;">
  <div style="text-align:center; font-size:14px; color:#cbd5e1;">
    🔊 <b>Alunan Azan Sedang Berkumandang ke PA Sistem</b><br>
    Jemaah diseru menyahut azan dan bersiap sedia untuk solat berjemaah.
  </div>
</div>

* **Fungsi:** Skrin bertukar tema kontra tinggi secara automatik mengikut waktu solat JAKIM.

---

# 📺 Simulasi TV: Mod 3 — Mod Iqamah & Rapatkan Saf (Countdown)

<div class="tv-box" style="border-color:#06b6d4; background:#02181e;">
  <div style="color:#38bdf8; font-weight:bold; text-align:center;">PANGGILAN SOLAT ZOHOR — KIRAAN DETIK IQAMAH</div>
  <div style="color:#fbbf24; font-size:36px; font-weight:900; text-align:center; margin:6px 0;">- 01:00</div>
  <div style="background:rgba(6,182,212,0.15); border:1px solid #06b6d4; border-radius:8px; padding:8px; text-align:center; font-size:14px;">
    سَوُّوا صُفُوفَكُمْ فَإِنَّ تَسْوِيَةَ الصَّفِّ مِنْ تَمَامِ الصَّلَاةِ<br>
    <i>"Luruskan dan rapatkan saf kamu, sesungguhnya meluruskan saf adalah sebahagian daripada kesempurnaan solat."</i> (HR Bukhari & Muslim)
  </div>
  <div style="text-align:center; color:#f87171; font-weight:bold; margin-top:6px; font-size:13px;">
    📴 SILA MATIKAN / SENYAPKAN TELEFON BIMBIT ANDA
  </div>
</div>

* **Fungsi:** Kiraan detik menuju iqamah dengan peringatan hadis saf dan mematikan telefon bimbit.

---

# 📺 Simulasi TV: Mod 4 — Mod Solat Khusyuk (Screen Blanking)

<div class="tv-box" style="border-color:#334155; background:#030712; color:#64748b;">
  <div style="display:flex; justify-content:space-between; font-size:12px; opacity:0.4;">
    <span>13:18:45</span>
    <span>ZOHOR</span>
  </div>
  <div style="text-align:center; padding:30px 0; opacity:0.5;">
    <div style="font-size:30px; margin-bottom:8px;">🕌</div>
    <div style="color:#e2e8f0; font-weight:bold; font-size:18px;">SOLAT BERJEMAAH SEDANG DIDIRIKAN</div>
    <div style="font-size:12px; margin-top:4px;">Skrin digelapkan secara automatik demi memelihara ketertiban ibadah jemaah.</div>
  </div>
  <div style="text-align:center; font-size:10px; opacity:0.3;">
    Skrin akan kembali menyala secara automatik selepas tempoh solat tamat.
  </div>
</div>

* **Fungsi:** Sifar silau cahaya semasa solat berlangsung.

---

# 📺 Simulasi TV: Mod 5 — Mod Dwi-Skrin & Fokus Kuliah

<div class="tv-box" style="border-color:#a855f7; background:#14081c;">
  <div style="display:flex; gap:12px;">
    <div style="flex:2; background:rgba(168,85,247,0.2); border:1px solid #a855f7; border-radius:8px; padding:10px;">
      <span style="background:#a855f7; color:#000; font-size:10px; font-weight:bold; padding:2px 6px; rounded:4px;">🔴 SIARAN KULIAH</span>
      <h3 style="color:#fff; margin:6px 0; font-size:16px;">Tazkirah: Menghidupkan 10 Malam Terakhir</h3>
      <p style="font-size:12px; color:#e2e8f0;">Penceramah: Prof. Madya Dato' Dr. Haji Asri</p>
    </div>
    <div style="flex:1; background:rgba(15,23,42,0.9); border:1px solid #334155; border-radius:8px; padding:10px; font-size:11px;">
      <b>ISYAK: 20:25</b><br>
      Subuh: 05:52<br>
      Zohor: 13:10<br>
      Asar: 16:22<br>
      Maghrib: 19:15
    </div>
  </div>
</div>

* **Fungsi:** Siaran slaid kuliah / live stream serentak bersama paparan takwim waktu solat seterusnya.

---

# 📺 Simulasi TV: Mod 6 — Tabung Infaq & Wakaf Digital

<div class="tv-box" style="border-color:#ec4899; background:#180a15;">
  <div style="display:flex; gap:15px; align-items:center;">
    <div style="background:#fff; color:#000; padding:10px; border-radius:10px; text-align:center; width:130px;">
      <span style="color:#e11d48; font-weight:bold; font-size:10px;">DuitNow QR</span>
      <div style="font-size:36px; margin:5px 0;">📱</div>
      <span style="font-size:9px; font-weight:bold;">Imbas Bank / e-Wallet</span>
    </div>
    <div style="flex:1;">
      <span style="background:#831843; color:#fbcfe8; font-size:10px; padding:2px 6px; font-weight:bold;">💖 TABUNG WAKAF SURAU</span>
      <h3 style="color:#fff; margin:4px 0; font-size:15px;">SURAU DARUL TAQWA</h3>
      <div style="background:#0f172a; padding:6px; border-radius:6px; font-size:12px; margin:4px 0;">
        Bank Islam: <b style="color:#fbbf24;">1203 8010 0987 65</b>
      </div>
      <div style="font-size:11px; color:#cbd5e1;">Sasaran Kutipan: <b>90% Tercapai</b></div>
    </div>
  </div>
</div>

* **Fungsi:** Menggalakkan kutipan dana dan infaq jemaah secara tanpa tunai (*cashless*).

---

# 🚀 Hubungi Kami & Sesi Demonstrasi

**Tempah Sesi Demonstrasi Percuma di Surau Anda Sekarang!**

* 👤 **Pegawai Perhubungan & Pemasaran:** Carl Kelana Abdul Latiff
* 🏢 **Entiti:** Skywalker Consortium (SSM: AS0463209-A)
* 📱 **WhatsApp / Telefon:** [+60 10-318 4047](https://wa.me/60103184047?text=Assalamualaikum%20En%20Carl,%20saya%20berminat%20dengan%20Sistem%20e-Solat%20Display)
* ✉️ **Emel Rasmi:** skywalker.co@proton.me

---
### **Terima Kasih & Sesi Soal Jawab (Q&A)**

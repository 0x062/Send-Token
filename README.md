# Auto Send Token 🤖💸

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg) ![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.x-brightgreen.svg) ![Ethers.js](https://img.shields.io/badge/Ethers.js-v6-blue.svg)

Skrip Node.js canggih untuk **mengirim (Auto Send)** saldo token ERC20 dari **banyak *wallet*** ke **satu alamat tujuan** secara otomatis. Dibangun dengan `ethers.js`, skrip ini dirancang untuk efisiensi dan ketahanan, cocok untuk mengkonsolidasikan aset di berbagai *wallet*.

---

## 🚀 Fitur Utama

* **Multi-Wallet:** Membaca dan memproses *private key* dari file `privatekey.txt`.
* **Multi-Token:** Mendukung daftar token ERC20 yang dapat dikonfigurasi.
* **Konfigurasi Mudah:** Menggunakan file `.env` untuk pengaturan RPC dan alamat tujuan.
* **Cek Gas Cerdas:** Memverifikasi saldo ETH *sebelum* mengirim token untuk memastikan cukup biaya gas. ⛽
* **Gas EIP-1559:** Mendukung dan menggunakan estimasi biaya gas modern.
* **Retry Logic:** Dilengkapi mekanisme *retry* otomatis untuk mengatasi gangguan jaringan sementara. 💪
* **Logging Keren:** Menggunakan `chalk` (jika Anda menambahkannya) untuk *output* konsol yang berwarna dan mudah dibaca. 📊
* **Metadata Caching:** Mengambil data token (nama, simbol, desimal) sekali saja untuk efisiensi. ⚡

---

## 📚 Prasyarat

Sebelum memulai, pastikan Anda memiliki:

* [Node.js](https://nodejs.org/) (Direkomendasikan versi 18.x atau lebih tinggi)
* [Git](https://git-scm.com/)

---

## ⚙️ Instalasi & Pengaturan

1.  **Clone Repository:**
    ```bash
    git clone [URL_REPOSITORY_ANDA]
    cd [NAMA_DIREKTORI_ANDA]
    ```

2.  **Install Dependensi:**
    Pastikan semua dependensi di `package.json` Anda terinstal:
    ```bash
    npm install
    ```
    *(Pastikan dependensi seperti `chalk`, `ethers`, `dotenv`, dll., sesuai dengan yang Anda gunakan di `send.js` dan terdaftar di `package.json`)*

3.  **Buat File Kunci Pribadi:**
    Buat file bernama `privatekey.txt` di direktori utama dan isi dengan daftar *private key* Anda, **satu *private key* per baris**.
    ```
    0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
    ```

4.  **Buat File Konfigurasi (`.env`):**
    Buat file bernama `.env` di direktori utama dan isi dengan konfigurasi berikut:
    ```dotenv
    # URL RPC dari provider Anda (misalnya: Infura, Alchemy, atau node Anda sendiri)
    RPC_URL="[https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID](https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID)"

    # Alamat wallet tujuan kemana semua token akan dikirim
    TO_ADDRESS="0xYOUR_DESTINATION_WALLET_ADDRESS"
    ```
    Ganti nilai di atas dengan URL RPC dan alamat tujuan Anda yang sebenarnya.

5.  **(Opsional) Sesuaikan Daftar Token:**
    Buka file `send.js` dan ubah array `tokenAddresses` sesuai dengan token yang ingin Anda proses.

---

## ⚡ Penggunaan

Cara paling mudah dan direkomendasikan untuk menjalankan *script* ini adalah menggunakan perintah `npm start`, karena ini akan secara otomatis menggunakan konfigurasi dari `package.json` Anda (termasuk *flag* `--expose-gc`):

```bash
npm start

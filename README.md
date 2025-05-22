**erc20-batch-transfer**

Batch transfer tool untuk ERC-20 tokens dengan retry logic, concurrency control, dan batch processing untuk VPS dengan memori terbatas.

---

## 🚀 Fitur Utama

* **Cache Metadata Token**: Mengambil dan menyimpan nama, simbol, dan desimal token pada startup.
* **EIP-1559 Fee**: Menghitung `maxFeePerGas` dan `maxPriorityFeePerGas` dari block terbaru (`baseFeePerGas`) dan `getFeeData()`.
* **Retry Logic**: Exponential back-off dengan `promise-retry` (2 retries, factor 1.5, timeout 500ms) untuk mengatasi transient errors.
* **Concurrency Control**:

  * **Token**: `p-limit(5)` untuk maksimal 5 transfer token paralel per wallet.
  * **Wallet Batch**: Memproses 10 wallet per batch, memastikan memory footprint rendah.
* **Garbage Collection** (opsional): `--expose-gc` dan `global.gc()` untuk membersihkan memori setelah tiap batch.
* **Logging Informatif**: Menampilkan saldo, estimasi gas, fee, hash tx, block confirmation, dan summary batch.

## 💡 Evaluasi & Skor (Tanpa Aspek Keamanan)

| Aspek                              | Skor (0–100) |
| ---------------------------------- | :----------: |
| Kelengkapan Fitur                  |      90      |
| Concurrency & Throughput           |      85      |
| Keandalan (retry & back-off)       |      90      |
| Modularitas & Kebersihan Kode      |      80      |
| Observability (logging & feedback) |      75      |
| Nonce & Edge Cases                 |      70      |
| **Total**                          |  **84/100**  |

> *"Skrip sudah sangat baik dalam cara kerja: modular, reliable, dan performa terkendali. Peningkatan kecil pada paralelisasi wallet, pengelolaan nonce, dan summary result akan mendorong skor ke atas."*

## 🛠️ Quick Start

```bash
# Clone repository
git clone https://github.com/username/erc20-batch-transfer.git
cd erc20-batch-transfer

# Install dependencies
npm install

# Salin dan atur environment variables
cp .env.example .env
# Edit .env: isi RPC_URL dan TO_ADDRESS

# Tambahkan private key per baris di privatekey.txt
```

## 🚦 Penggunaan

```bash
# Jalankan skrip dengan GC exposed
npm start
```

Contoh output:

```bash
🔌 Starting Batch Transfer with Retry Logic
🎛️ Processing wallet batch: 10 wallets
🚀 Processing Wallet: 0xAbC...
🔹 USDT: saldo 12.345
⛽ estGas: 52345, gasLimit: 62814
⛽ maxPriorityFee: 2000000000
⛽ maxFee: 100000000000
📤 Tx hash: 0x...
✅ USDT terkirim di block 1234567
✅ Batch selesai, memori dibersihkan
🎉 All wallets processed.
```

## 🧩 Struktur Project

```
├── index.js          # Skrip utama
├── privatekey.txt    # Daftar private key
├── package.json      # Dependency dan scripts
├── .env.example      # Contoh environment variables
└── README.md         # Dokumentasi ini
```

## 🤝 Kontribusi

1. Fork repository
2. Buat branch fitur (`git checkout -b feature/xxx`)
3. Commit perubahan (`git commit -m 'Add feature'`)
4. Push ke branch (`git push origin feature/xxx`)
5. Buka Pull Request

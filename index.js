const express = require('express');
const midtransClient = require('midtrans-client');
const cors = require('cors');

const app = express();
app.use(cors()); // Mengizinkan request dari domain lain (Flutter app)
app.use(express.json()); // Mengizinkan body request dalam format JSON

// =============================================
// INISIALISASI MIDTRANS
// =============================================

// Snap: digunakan untuk menampilkan halaman pembayaran Midtrans (UI lengkap)
// Dipakai untuk: Dana
const snap = new midtransClient.Snap({
  isProduction: false, // false = mode sandbox/testing, true = mode production (uang asli)
  serverKey: process.env.MIDTRANS_SERVER_KEY, // Server key diambil dari environment variable Railway
});

// Core API: digunakan untuk transaksi langsung tanpa UI Midtrans
// Dipakai untuk: Virtual Account (BCA, BRI, dll), GoPay, ShopeePay
const core = new midtransClient.CoreApi({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY, // Client key untuk autentikasi tambahan
});

// =============================================
// ROUTE 1: CREATE TRANSACTION (SNAP)
// =============================================
// Digunakan untuk: Dana
// Cara kerja: Generate token Snap yang bisa dipakai untuk membuka
// halaman pembayaran Midtrans di WebView Flutter
// Parameter enabledPayments: filter metode pembayaran yang muncul di halaman Snap
// Contoh: enabledPayments: ['dana'] → hanya Dana yang muncul
app.post('/create-transaction', async (req, res) => {
  try {
    const { orderId, amount, name, email, enabledPayments } = req.body;
    const parameter = {
      transaction_details: {
        order_id: orderId,       // ID unik transaksi (format: INV/timestamp)
        gross_amount: amount,    // Total harga dalam rupiah
      },
      customer_details: {
        first_name: name,        // Nama pembeli
        email: email,            // Email pembeli
      },
    };

    // Jika ada filter metode pembayaran, tambahkan ke parameter
    if (enabledPayments && enabledPayments.length > 0) {
      parameter.enabled_payments = enabledPayments;
    }

    const token = await snap.createTransaction(parameter);
    res.json({ token: token.token }); // Kirim token ke Flutter
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// ROUTE 2: CREATE VIRTUAL ACCOUNT
// =============================================
// Digunakan untuk: Transfer Bank (BCA, BRI, BNI, Mandiri, BSI)
// Cara kerja: Generate nomor Virtual Account unik untuk setiap transaksi
// User transfer ke nomor VA tersebut, Midtrans otomatis verifikasi
// VA berlaku selama 24 jam
app.post('/create-va', async (req, res) => {
  try {
    const { orderId, amount, bank, name, email } = req.body;
    const parameter = {
      payment_type: 'bank_transfer',
      transaction_details: {
        order_id: orderId,
        gross_amount: amount,
      },
      customer_details: {
        first_name: name,
        email: email,
      },
      bank_transfer: {
        bank: bank.toLowerCase(), // Nama bank dalam huruf kecil (bca, bri, bni, mandiri, bsi)
      },
    };

    const response = await core.charge(parameter);
    res.json({
      vaNumber: response.va_numbers?.[0]?.va_number || response.permata_va_number, // Nomor VA
      bank: response.va_numbers?.[0]?.bank || 'permata',                            // Nama bank
      orderId: response.order_id,
      grossAmount: response.gross_amount,
      transactionStatus: response.transaction_status, // Status: pending, settlement, dll
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// ROUTE 3: CREATE GOPAY
// =============================================
// Digunakan untuk: GoPay
// Cara kerja: Generate QR Code dan deeplink GoPay
// - QR Code: user scan pakai app Gojek
// - Deeplink: link yang langsung membuka app Gojek di HP
// Berlaku selama 15 menit
app.post('/create-gopay', async (req, res) => {
  try {
    const { orderId, amount, name, email } = req.body;
    const parameter = {
      payment_type: 'gopay',
      transaction_details: {
        order_id: orderId,
        gross_amount: amount,
      },
      customer_details: {
        first_name: name,
        email: email,
      },
      gopay: {
        enable_callback: false, // Tidak perlu callback URL untuk sandbox
      },
    };

    const response = await core.charge(parameter);

    // Ambil URL QR Code dari response actions Midtrans
    const qrUrl = response.actions?.find(a => a.name === 'generate-qr-code')?.url || '';
    // Ambil deeplink untuk membuka langsung app Gojek
    const deeplink = response.actions?.find(a => a.name === 'deeplink-redirect')?.url || '';

    res.json({
      qrUrl,      // URL gambar QR Code
      deeplink,   // Link untuk buka app Gojek langsung
      orderId: response.order_id,
      grossAmount: response.gross_amount,
      transactionStatus: response.transaction_status,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// ROUTE 4: CREATE SHOPEEPAY
// =============================================
// Digunakan untuk: ShopeePay
// Cara kerja: Generate deeplink ShopeePay
// - Deeplink: link yang langsung membuka app Shopee di HP untuk konfirmasi bayar
// Berbeda dengan GoPay, ShopeePay tidak punya QR Code — hanya deeplink
// Berlaku selama 15 menit
app.post('/create-shopeepay', async (req, res) => {
  try {
    const { orderId, amount, name, email } = req.body;
    const parameter = {
      payment_type: 'shopeepay',
      transaction_details: {
        order_id: orderId,
        gross_amount: amount,
      },
      customer_details: {
        first_name: name,
        email: email,
      },
      shopeepay: {
        callback_url: 'https://racik-backend-production.up.railway.app', // URL redirect setelah bayar
      },
    };

    const response = await core.charge(parameter);

    // Ambil deeplink untuk membuka langsung app Shopee
    const deeplink = response.actions?.find(a => a.name === 'deeplink-redirect')?.url || '';

    res.json({
      deeplink,   // Link untuk buka app Shopee langsung
      orderId: response.order_id,
      grossAmount: response.gross_amount,
      transactionStatus: response.transaction_status,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// JALANKAN SERVER
// =============================================
// PORT diambil dari environment variable Railway
// Kalau tidak ada, pakai port 3000 (untuk testing lokal)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server jalan di port ' + PORT));

const express = require('express');
const midtransClient = require('midtrans-client');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const snap = new midtransClient.Snap({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY,
});

const core = new midtransClient.CoreApi({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

// Route Snap (yang lama)
app.post('/create-transaction', async (req, res) => {
  try {
    const { orderId, amount, name, email } = req.body;
    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: amount,
      },
      customer_details: {
        first_name: name,
        email: email,
      },
    };
    const token = await snap.createTransaction(parameter);
    res.json({ token: token.token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Route Virtual Account (baru)
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
        bank: bank.toLowerCase(),
      },
    };
    const response = await core.charge(parameter);
    res.json({
      vaNumber: response.va_numbers?.[0]?.va_number || response.permata_va_number,
      bank: response.va_numbers?.[0]?.bank || 'permata',
      orderId: response.order_id,
      grossAmount: response.gross_amount,
      transactionStatus: response.transaction_status,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server jalan di port ' + PORT));

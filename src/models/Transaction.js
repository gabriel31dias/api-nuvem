const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  storeId: {
    type: String,
    required: true,
    index: true
  },
  orderId: {
    type: String,
    required: true,
    index: true
  },
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  nuvemshopTransactionId: String,
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'BRL'
  },
  paymentMethod: {
    type: String,
    enum: ['credit_card', 'debit_card', 'pix', 'boleto'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'authorized', 'paid', 'cancelled', 'refunded', 'failed'],
    default: 'pending'
  },
  paycoResponse: Object,
  customerData: {
    name: String,
    email: String,
    document: String
  },
  cardData: {
    lastFourDigits: String,
    brand: String,
    holderName: String
  },
  installments: Number,
  events: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    details: Object
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Transaction', transactionSchema);

const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  storeId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  accessToken: {
    type: String,
    required: true
  },
  storeName: String,
  storeUrl: String,
  paymentProviderId: String,
  paycoSettings: {
    apiKey: String,
    enabled: {
      type: Boolean,
      default: false
    },
    paymentMethods: {
      creditCard: {
        enabled: { type: Boolean, default: true },
        installments: { type: Number, default: 12 }
      },
      debitCard: {
        enabled: { type: Boolean, default: true }
      },
      pix: {
        enabled: { type: Boolean, default: true }
      },
      boleto: {
        enabled: { type: Boolean, default: false }
      }
    }
  },
  installedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Store', storeSchema);

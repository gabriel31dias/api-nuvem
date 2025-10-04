const express = require('express');
const router = express.Router();
const Store = require('../models/Store.sqlite');
const NuvemshopAPI = require('../config/nuvemshop');

// Obter configurações do Payment Provider
router.get('/:storeId', async (req, res) => {
  try {
    const store = await Store.findOne({ storeId: req.params.storeId });

    if (!store) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    res.json({
      storeId: store.storeId,
      paymentProviderId: store.paymentProviderId,
      settings: store.paycoSettings,
      installedAt: store.installedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Atualizar configurações do Payment Provider
router.put('/:storeId/settings', async (req, res) => {
  try {
    const { paymentMethods, enabled } = req.body;

    const store = await Store.findOneAndUpdate(
      { storeId: req.params.storeId },
      {
        'paycoSettings.enabled': enabled,
        'paycoSettings.paymentMethods': paymentMethods,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!store) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    // Atualiza o Payment Provider na Nuvemshop
    const nuvemshopAPI = new NuvemshopAPI(store.accessToken, store.storeId);

    const checkoutOptions = [];

    if (paymentMethods?.creditCard?.enabled) {
      checkoutOptions.push({
        id: 'payco_credit_card',
        name: 'Cartão de Crédito',
        description: `Pague com cartão de crédito em até ${paymentMethods.creditCard.installments}x`,
        logo_url: 'https://seu-dominio.com/credit-card-icon.png',
        supported_billing_countries: ['BR'],
        checkout_js_url: `${process.env.BACKEND_URL || 'http://localhost:3000'}/static/checkout.js`,
        kind: 'credit_card'
      });
    }

    if (paymentMethods?.debitCard?.enabled) {
      checkoutOptions.push({
        id: 'payco_debit_card',
        name: 'Cartão de Débito',
        description: 'Pagamento à vista com cartão de débito',
        logo_url: 'https://seu-dominio.com/debit-card-icon.png',
        supported_billing_countries: ['BR'],
        checkout_js_url: `${process.env.BACKEND_URL || 'http://localhost:3000'}/static/checkout.js`,
        kind: 'debit_card'
      });
    }

    if (paymentMethods?.pix?.enabled) {
      checkoutOptions.push({
        id: 'payco_pix',
        name: 'PIX',
        description: 'Pagamento instantâneo via PIX',
        logo_url: 'https://seu-dominio.com/pix-icon.png',
        supported_billing_countries: ['BR'],
        checkout_js_url: `${process.env.BACKEND_URL || 'http://localhost:3000'}/static/checkout.js`,
        kind: 'pix'
      });
    }

    if (paymentMethods?.boleto?.enabled) {
      checkoutOptions.push({
        id: 'payco_boleto',
        name: 'Boleto Bancário',
        description: 'Boleto com vencimento em 3 dias úteis',
        logo_url: 'https://seu-dominio.com/boleto-icon.png',
        supported_billing_countries: ['BR'],
        checkout_js_url: `${process.env.BACKEND_URL || 'http://localhost:3000'}/static/checkout.js`,
        kind: 'boleto'
      });
    }

    await nuvemshopAPI.updatePaymentProvider(store.paymentProviderId, {
      checkout_payment_options: checkoutOptions,
      enabled: enabled
    });

    res.json({
      success: true,
      settings: store.paycoSettings
    });
  } catch (error) {
    console.error('Erro ao atualizar configurações:', error);
    res.status(500).json({ error: error.message });
  }
});

// Desinstalar app
router.delete('/:storeId', async (req, res) => {
  try {
    const store = await Store.findOneAndDelete({ storeId: req.params.storeId });

    if (!store) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    res.json({ success: true, message: 'App desinstalado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

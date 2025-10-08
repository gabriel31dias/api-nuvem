const express = require('express');
const router = express.Router();
const Store = require('../models/Store.sqlite');
const NuvemshopAPI = require('../config/nuvemshop');

// Mock mode habilitado por padrão para integracao2
const USE_MOCKS = true;

// Obter configurações do Payment Provider
router.get('/:storeId', async (req, res) => {
  try {
    const store = await Store.findOne({ storeId: req.params.storeId });

    if (!store) {
      return res.status(404).json({
        error: 'Loja não encontrada',
        _integration: 'integracao2'
      });
    }

    res.json({
      storeId: store.storeId,
      paymentProviderId: store.paymentProviderId,
      settings: store.paycoSettings,
      installedAt: store.installedAt,
      _integration: 'integracao2',
      _mock: USE_MOCKS
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Atualizar configurações do Payment Provider
router.put('/:storeId/settings', async (req, res) => {
  try {
    const { paymentMethods, enabled } = req.body;

    console.log('[PaymentProvider Integracao2] Updating settings:', {
      storeId: req.params.storeId,
      enabled,
      paymentMethods
    });

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
      return res.status(404).json({
        error: 'Loja não encontrada',
        _integration: 'integracao2'
      });
    }

    // Atualiza o Payment Provider na Nuvemshop
    if (!USE_MOCKS) {
      const nuvemshopAPI = new NuvemshopAPI(store.accessToken, store.storeId);

      const checkoutOptions = [];

      if (paymentMethods?.creditCard?.enabled) {
        checkoutOptions.push({
          id: 'payco_credit_card_integracao2',
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
          id: 'payco_debit_card_integracao2',
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
          id: 'payco_pix_integracao2',
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
          id: 'payco_boleto_integracao2',
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

      console.log('[PaymentProvider Integracao2] Nuvemshop updated');
    } else {
      console.log('[PaymentProvider Integracao2] Skipping Nuvemshop update (MOCK mode)');
    }

    res.json({
      success: true,
      settings: store.paycoSettings,
      _integration: 'integracao2',
      _mock: USE_MOCKS
    });
  } catch (error) {
    console.error('[PaymentProvider Integracao2] Error updating settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Desinstalar app
router.delete('/:storeId', async (req, res) => {
  try {
    console.log('[PaymentProvider Integracao2] Uninstalling app for store:', req.params.storeId);

    const store = await Store.findOneAndDelete({ storeId: req.params.storeId });

    if (!store) {
      return res.status(404).json({
        error: 'Loja não encontrada',
        _integration: 'integracao2'
      });
    }

    console.log('[PaymentProvider Integracao2] App uninstalled successfully');

    res.json({
      success: true,
      message: 'App integracao2 desinstalado com sucesso',
      _integration: 'integracao2'
    });
  } catch (error) {
    console.error('[PaymentProvider Integracao2] Error uninstalling app:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

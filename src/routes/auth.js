const express = require('express');
const router = express.Router();
const NuvemshopAPI = require('../config/nuvemshop');
const Store = require('../models/Store.sqlite');

router.get('/install', async (req, res) => {
  try {
    const { code } = req.query;

    const tokenData = await NuvemshopAPI.install(code);
    const { access_token, user_id, scope, token_type } = tokenData;

    // Salva ou atualiza a loja no banco
    let store = await Store.findOne({ storeId: user_id.toString() });

    if (store) {
      store.access_token = access_token;
      store.scope = scope;
      store.token_type = token_type;
      store.storeId = user_id.toString();
      store.save = async function() {
        return Store.update(this);
      };
      await store.save();
    } else {
      store = await Store.create({
        store_id: user_id,
        access_token: access_token,
        scope: scope,
        token_type: token_type,
      });
    }

    console.log('✅ App instalado com sucesso para a loja:', user_id);


    const nuvemshopAPI = new NuvemshopAPI(access_token, user_id);

    const paymentProviderData = {
      name: 'Payco',
      description: 'Gateway de pagamento Payco - Aceite cartões, PIX e boleto',
      logo_urls: {
        '400x120': 'https://seu-dominio.com/logo-400x120.png',
        '160x100': 'https://seu-dominio.com/logo-160x100.png'
      },
      configuration_url: `https://swd-sigma.vercel.app/config`,
      support_url: 'https://payco.com.br/suporte',
      supported_currencies: ['BRL'],
      supported_payment_methods: [
        {
          payment_method_type: 'credit_card',
          payment_methods: ['visa', 'mastercard', 'amex', 'elo', 'hipercard']
        },
        {
          payment_method_type: 'debit_card',
          payment_methods: ['visa_debit', 'mastercard_debit']
        },
        {
          payment_method_type: 'pix',
          payment_methods: ['pix']
        },
        {
          payment_method_type: 'boleto',
          payment_methods: ['boleto']
        }
      ],
      checkout_js_url: `https://api.dev.codiguz.com/storage/v1/object/public/scripts/checkout2.js`,
      checkout_payment_options: [
        {
          id: 'payco_credit_card',
          name: 'Cartão de Crédito',
          description: 'Pague com cartão de crédito em até 12x',
          logo_url: 'https://seu-dominio.com/credit-card-icon.png',
          supported_billing_countries: ['BR'],
          supported_payment_method_types: ['credit_card'],
          integration_type: 'transparent'
        },
        {
          id: 'payco_pix',
          name: 'PIX',
          description: 'Pagamento instantâneo via PIX',
          logo_url: 'https://seu-dominio.com/pix-icon.png',
          supported_billing_countries: ['BR'],
          supported_payment_method_types: ['pix'],
          integration_type: 'redirect'
        }
      ],
      rates_definition: {
        percentage: '2.99',
        flat_fee: {
          value: '0.39',
          currency: 'BRL'
        }
      },
      enabled: true
    };

    const paymentProvider = await nuvemshopAPI.createPaymentProvider(paymentProviderData);

    console.log(paymentProvider)

    return res.send(`
      <h2>✅ Aplicativo instalado com sucesso!</h2>
      <p>Loja ID: ${user_id}</p>
      <p>Token salvo com sucesso.</p>
    `);
  } catch (error) {
    console.error('❌ Erro ao instalar o app:', error.response?.data || error.message);
    res.status(500).send('Erro ao instalar o aplicativo.', error.response?.data);
  }
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Código de autorização não fornecido' });
  }

  try {
    const authData = await NuvemshopAPI.getAccessToken(code);
    const { access_token, user_id } = authData;

    // Salva ou atualiza a loja no banco
    const store = await Store.findOneAndUpdate(
      { storeId: user_id.toString() },
      {
        storeId: user_id.toString(),
        accessToken: access_token,
        installedAt: new Date()
      },
      { upsert: true, new: true }
    );

    // Cria o Payment Provider na Nuvemshop
    const nuvemshopAPI = new NuvemshopAPI(access_token, user_id);

    const paymentProviderData = {
      name: 'Payco',
      description: 'Gateway de pagamento Payco - Aceite cartões, PIX e boleto',
      logo_urls: {
        '400x120': 'https://seu-dominio.com/logo-400x120.png',
        '160x100': 'https://seu-dominio.com/logo-160x100.png'
      },
      configuration_url: `https://swd-sigma.vercel.app/config`,
      support_url: 'https://payco.com.br/suporte',
      supported_currencies: ['BRL'],
      supported_payment_methods: [
        {
          payment_method_type: 'credit_card',
          payment_methods: ['visa', 'mastercard', 'amex', 'elo', 'hipercard']
        },
        {
          payment_method_type: 'debit_card',
          payment_methods: ['visa_debit', 'mastercard_debit']
        },
        {
          payment_method_type: 'pix',
          payment_methods: ['pix']
        },
        {
          payment_method_type: 'boleto',
          payment_methods: ['boleto']
        }
      ],
      checkout_js_url: `${process.env.BACKEND_URL || 'http://localhost:3000'}/static/checkout.js`,
      checkout_payment_options: [
        {
          id: 'payco_credit_card',
          name: 'Cartão de Crédito',
          description: 'Pague com cartão de crédito em até 12x',
          logo_url: 'https://seu-dominio.com/credit-card-icon.png',
          supported_billing_countries: ['BR'],
          supported_payment_method_types: ['credit_card'],
          integration_type: 'transparent'
        },
        {
          id: 'payco_pix',
          name: 'PIX',
          description: 'Pagamento instantâneo via PIX',
          logo_url: 'https://seu-dominio.com/pix-icon.png',
          supported_billing_countries: ['BR'],
          supported_payment_method_types: ['pix'],
          integration_type: 'redirect'
        }
      ],
      rates_definition: {
        percentage: '2.99',
        flat_fee: {
          value: '0.39',
          currency: 'BRL'
        }
      },
      enabled: true
    };

    const paymentProvider = await nuvemshopAPI.createPaymentProvider(paymentProviderData);

    // Salva o ID do payment provider
    store.paymentProviderId = paymentProvider.id;
    await store.save();

    // Redireciona para o frontend com sucesso
    res.redirect(`${process.env.FRONTEND_URL}/success?store_id=${user_id}`);
  } catch (error) {
    console.error('Erro no callback OAuth:', error);
    res.redirect(`${process.env.FRONTEND_URL}/error?message=${encodeURIComponent(error.message)}`);
  }
});

// Verifica se uma loja está instalada
router.get('/status/:storeId', async (req, res) => {
  try {
    const store = await Store.findOne({ storeId: req.params.storeId });

    if (!store) {
      return res.status(404).json({ installed: false });
    }

    res.json({
      installed: true,
      storeName: store.storeName,
      enabled: store.paycoSettings?.enabled || false
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

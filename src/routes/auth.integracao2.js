const express = require('express');
const router = express.Router();
const NuvemshopAPI = require('../config/nuvemshop');
const Store = require('../models/Store.sqlite');

// Mock mode habilitado por padrão para integracao2
const USE_MOCKS = true;

router.get('/install', async (req, res) => {
  try {
    const { code } = req.query;

    const IS_LOCAL_TEST = USE_MOCKS || process.env.NODE_ENV === 'development' || !code || code === 'test';

    let tokenData, paymentProvider;

    if (IS_LOCAL_TEST) {
      tokenData = {
        access_token: 'mock_access_token_integracao2_' + Date.now(),
        user_id: 999888 + Math.floor(Math.random() * 1000),
        scope: 'read_products,write_products,read_orders,write_orders',
        token_type: 'bearer'
      };

      paymentProvider = {
        id: 'mock_provider_integracao2_' + Date.now(),
        name: 'Payco Integracao2',
        enabled: true
      };

      console.log('🧪 MODO MOCK INTEGRACAO2: Instalação mockada');
    } else {
      tokenData = await NuvemshopAPI.install(code);
      const nuvemshopAPI = new NuvemshopAPI(tokenData.access_token, tokenData.user_id);

      const paymentProviderData = {
        name: 'Payco Integracao2',
        description: 'Gateway de pagamento Payco Integracao2 - Aceite cartões, PIX e boleto',
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
        checkout_js_url: `${process.env.BACKEND_URL || 'https://api-nuvem-mqgt.onrender.com'}/checkout2.js`,
        enabled_payment_methods: ['credit_card', 'debit_card', 'pix', 'boleto'],
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
            id: 'payco_debit_card',
            name: 'Cartão de Débito',
            description: 'Pagamento à vista com cartão de débito',
            logo_url: 'https://seu-dominio.com/debit-card-icon.png',
            supported_billing_countries: ['BR'],
            supported_payment_method_types: ['debit_card'],
            integration_type: 'transparent'
          },
          {
            id: 'payco_pix',
            name: 'PIX',
            description: 'Pagamento instantâneo via PIX',
            logo_url: 'https://seu-dominio.com/pix-icon.png',
            supported_billing_countries: ['BR'],
            supported_payment_method_types: ['pix'],
            integration_type: 'transparent'
          },
          {
            id: 'payco_boleto',
            name: 'Boleto Bancário',
            description: 'Boleto com vencimento em 3 dias úteis',
            logo_url: 'https://seu-dominio.com/boleto-icon.png',
            supported_billing_countries: ['BR'],
            supported_payment_method_types: ['boleto'],
            integration_type: 'external'
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

      paymentProvider = await nuvemshopAPI.createPaymentProvider(paymentProviderData);
    }

    const { access_token, user_id, scope, token_type } = tokenData;

    // Salva ou atualiza a loja no banco
    let store = await Store.findOne({ storeId: user_id.toString() });

    if (store) {
      console.log('ja tem loja - atualizando')
      store.access_token = access_token;
      store.scope = scope;
      store.token_type = token_type;
      store.storeId = user_id.toString();
      store.paymentProviderId = paymentProvider.id;
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
        paymentProviderId: paymentProvider.id
      });
    }

    console.log('✅ App integracao2 instalado com sucesso para a loja:', user_id);
    console.log('📦 Payment Provider ID:', paymentProvider.id);

    return res.send(`
      <h2>✅ Aplicativo Integracao2 instalado com sucesso!</h2>
      <p>Loja ID: ${user_id}</p>
      <p>Token salvo com sucesso.</p>
      <p>Payment Provider ID: ${paymentProvider.id}</p>
      ${IS_LOCAL_TEST ? '<p><strong>🧪 MODO MOCK INTEGRACAO2 ATIVO</strong></p>' : ''}
    `);
  } catch (error) {
    console.error('❌ Erro ao instalar o app integracao2:', error.response?.data || error.message);
    res.status(500).send('Erro ao instalar o aplicativo integracao2.');
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
      name: 'Payco Integracao2',
      description: 'Gateway de pagamento Payco Integracao2 - Aceite cartões, PIX e boleto',
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
      checkout_js_url: `${process.env.BACKEND_URL || 'https://api-nuvem-mqgt.onrender.com'}/checkout2.js`,
      enabled_payment_methods: ['credit_card', 'debit_card', 'pix', 'boleto'],
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
          id: 'payco_debit_card',
          name: 'Cartão de Débito',
          description: 'Pagamento à vista com cartão de débito',
          logo_url: 'https://seu-dominio.com/debit-card-icon.png',
          supported_billing_countries: ['BR'],
          supported_payment_method_types: ['debit_card'],
          integration_type: 'transparent'
        },
        {
          id: 'payco_pix',
          name: 'PIX',
          description: 'Pagamento instantâneo via PIX',
          logo_url: 'https://seu-dominio.com/pix-icon.png',
          supported_billing_countries: ['BR'],
          supported_payment_method_types: ['pix'],
          integration_type: 'transparent'
        },
        {
          id: 'payco_boleto',
          name: 'Boleto Bancário',
          description: 'Boleto com vencimento em 3 dias úteis',
          logo_url: 'https://seu-dominio.com/boleto-icon.png',
          supported_billing_countries: ['BR'],
          supported_payment_method_types: ['boleto'],
          integration_type: 'external'
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
    console.error('Erro no callback OAuth integracao2:', error);
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
      enabled: store.paycoSettings?.enabled || false,
      integration: 'integracao2'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Busca informações da loja na API da Nuvemshop
router.get('/store/:storeId', async (req, res) => {
  try {
    const { storeId } = req.params;

    const IS_LOCAL_TEST = USE_MOCKS || process.env.NODE_ENV === 'development';

    if (IS_LOCAL_TEST) {
      // Busca a última loja cadastrada no banco
      const stores = await Store.findAll();
      const lastStore = stores[stores.length - 1];

      const mockStoreInfo = {
        id: lastStore?.storeId || 999888,
        name: {
          pt: 'Loja Teste Mock Integracao2',
          es: 'Tienda Test Mock Integracao2',
          en: 'Mock Test Store Integracao2'
        },
        url: 'https://loja-teste-mock-integracao2.nuvemshop.com.br',
        original_domain: 'loja-teste-mock-integracao2',
        main_language: 'pt',
        languages: ['pt', 'es', 'en'],
        currencies: ['BRL'],
        country: 'BR',
        email: 'contato@lojamock-integracao2.com.br',
        phone: '+55 11 99999-8888',
        address: 'Rua Teste Integracao2, 456',
        city: 'São Paulo',
        province: 'SP',
        zipcode: '01234-567',
        business_name: 'Loja Mock Integracao2 LTDA',
        business_id: '12.345.678/0001-99',
        plan_name: 'premium',
        created_at: lastStore?.created_at || new Date().toISOString(),
        admin_language: 'pt'
      };

      return res.json({
        storeId: lastStore?.storeId || storeId,
        storeInfo: mockStoreInfo,
        localData: {
          paymentProviderId: lastStore?.paymentProviderId || 'mock_provider_integracao2_123',
          installedAt: lastStore?.created_at || new Date().toISOString(),
          scope: lastStore?.scope || 'read_products,write_products,read_orders,write_orders'
        },
        gatewayConfig: {
          paycoApiKey: lastStore?.paycoApiKey || null,
          paycoClientId: lastStore?.paycoClientId || null,
          enabled: lastStore?.enabled === 1,
          paymentMethods: lastStore?.paymentMethods ? JSON.parse(lastStore.paymentMethods) : []
        },
        _mock: true,
        _integration: 'integracao2'
      });
    }

    // Busca a loja no banco de dados
    const store = await Store.findOne({ storeId });

    if (!store) {
      return res.status(404).json({
        error: 'Loja não encontrada',
        message: 'Esta loja não está instalada no sistema integracao2'
      });
    }

    // Instancia a API da Nuvemshop com as credenciais da loja
    const nuvemshopAPI = new NuvemshopAPI(store.access_token, storeId);

    // Busca as informações da loja na API da Nuvemshop
    const storeInfo = await nuvemshopAPI.getStoreInfo();

    // Retorna as informações combinadas
    res.json({
      storeId,
      storeInfo,
      localData: {
        paymentProviderId: store.paymentProviderId,
        installedAt: store.created_at,
        scope: store.scope
      },
      gatewayConfig: {
        paycoApiKey: store.paycoApiKey || null,
        paycoClientId: store.paycoClientId || null,
        enabled: store.enabled === 1,
        paymentMethods: store.paymentMethods ? JSON.parse(store.paymentMethods) : []
      },
      _integration: 'integracao2'
    });
  } catch (error) {
    console.error('❌ Erro ao buscar informações da loja integracao2:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Erro ao buscar informações da loja',
      message: error.response?.data?.message || error.message
    });
  }
});

// Salva as configurações do gateway da loja
router.post('/store/:storeId/config', async (req, res) => {
  try {
    const { storeId } = req.params;
    const { paycoApiKey, paycoClientId, enabled, paymentMethods } = req.body;

    // Busca a loja no banco de dados
    const store = await Store.findOne({ storeId });

    if (!store) {
      return res.status(404).json({
        error: 'Loja não encontrada',
        message: 'Esta loja não está instalada no sistema integracao2'
      });
    }

    // Atualiza as configurações
    store.paycoApiKey = paycoApiKey;
    store.paycoClientId = paycoClientId;
    store.enabled = enabled ? 1 : 0;
    store.paymentMethods = paymentMethods ? JSON.stringify(paymentMethods) : null;

    // Define o método save para usar Store.update
    store.save = async function() {
      return Store.update(this);
    };

    await store.save();

    res.json({
      success: true,
      message: 'Configurações salvas com sucesso (integracao2)',
      config: {
        paycoApiKey: store.paycoApiKey,
        paycoClientId: store.paycoClientId,
        enabled: store.enabled === 1,
        paymentMethods: store.paymentMethods ? JSON.parse(store.paymentMethods) : []
      },
      _integration: 'integracao2'
    });
  } catch (error) {
    console.error('❌ Erro ao salvar configurações integracao2:', error.message);
    res.status(500).json({
      error: 'Erro ao salvar configurações',
      message: error.message
    });
  }
});

module.exports = router;

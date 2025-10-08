const express = require('express');
const router = express.Router();
const Store = require('../models/Store.sqlite');
const Transaction = require('../models/Transaction.sqlite');
const NuvemshopAPI = require('../config/nuvemshop');
const PaycoAPI = require('../config/payco');

// Mock mode habilitado por padrão para integracao2
const USE_MOCKS = true;

/**
 * Mock da API Payco para integracao2
 */
class MockPaycoAPI {
  async createCreditCardPayment(paymentData) {
    console.log('[MockPayco Integracao2] Simulando pagamento cartão de crédito:', paymentData);

    // Simula aprovação de 80% dos pagamentos
    const isApproved = Math.random() > 0.2;

    if (!isApproved) {
      return {
        success: false,
        error: 'Cartão recusado pelo banco emissor',
        error_code: 'CARD_DECLINED'
      };
    }

    return {
      success: true,
      transaction_id: `mock_cc_integracao2_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'authorized',
      authorization_code: `AUTH${Math.floor(Math.random() * 1000000)}`,
      raw_response: {
        id: `mock_cc_integracao2_${Date.now()}`,
        status: 'approved',
        message: 'Pagamento aprovado (MOCK INTEGRACAO2)'
      }
    };
  }

  async createDebitCardPayment(paymentData) {
    console.log('[MockPayco Integracao2] Simulando pagamento cartão de débito:', paymentData);

    const isApproved = Math.random() > 0.15;

    if (!isApproved) {
      return {
        success: false,
        error: 'Saldo insuficiente',
        error_code: 'INSUFFICIENT_FUNDS'
      };
    }

    return {
      success: true,
      transaction_id: `mock_dc_integracao2_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'authorized',
      authorization_code: `AUTH${Math.floor(Math.random() * 1000000)}`,
      raw_response: {
        id: `mock_dc_integracao2_${Date.now()}`,
        status: 'approved',
        message: 'Pagamento aprovado (MOCK INTEGRACAO2)'
      }
    };
  }

  async createPixPayment(paymentData) {
    console.log('[MockPayco Integracao2] Simulando pagamento PIX:', paymentData);

    const mockQrCode = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const mockPixCode = `00020126580014br.gov.bcb.pix01364d3e3e3e-4d4d-4d4d-4d4d-4d4d4d4d4d4d52040000530398654${paymentData.amount.toFixed(2)}5802BR5925MOCK INTEGRACAO2 PAYCO6009SAO PAULO62070503***6304ABCD`;

    return {
      success: true,
      transaction_id: `mock_pix_integracao2_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      pix_qr_code: mockQrCode,
      pix_code: mockPixCode,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      raw_response: {
        id: `mock_pix_integracao2_${Date.now()}`,
        status: 'pending',
        qr_code: mockPixCode,
        qr_code_base64: mockQrCode,
        message: 'PIX gerado com sucesso (MOCK INTEGRACAO2)'
      }
    };
  }

  async createBoletoPayment(paymentData) {
    console.log('[MockPayco Integracao2] Simulando pagamento Boleto:', paymentData);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    const barcode = `34191.79001 01043.510047 91020.150008 1 ${Date.now().toString().substr(-14)}`;

    return {
      success: true,
      transaction_id: `mock_boleto_integracao2_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      boleto_url: `https://mock-integracao2.payco.com.br/boleto/${Date.now()}.pdf`,
      barcode: barcode,
      due_date: dueDate.toISOString(),
      raw_response: {
        id: `mock_boleto_integracao2_${Date.now()}`,
        status: 'pending',
        digitable_line: barcode,
        message: 'Boleto gerado com sucesso (MOCK INTEGRACAO2)'
      }
    };
  }

  async getPaymentStatus(transactionId) {
    console.log('[MockPayco Integracao2] Consultando status:', transactionId);

    // Simula que PIX/Boleto foram pagos aleatoriamente
    const isPaid = Math.random() > 0.7;

    return {
      success: true,
      status: isPaid ? 'authorized' : 'pending',
      paid: isPaid,
      raw_response: {
        status: isPaid ? 'paid' : 'pending',
        message: 'Status consultado (MOCK INTEGRACAO2)'
      }
    };
  }

  async refundPayment(transactionId, amount) {
    console.log('[MockPayco Integracao2] Processando reembolso:', transactionId);

    return {
      success: true,
      refund_id: `mock_refund_integracao2_${Date.now()}`,
      status: 'refunded',
      raw_response: {
        id: `mock_refund_integracao2_${Date.now()}`,
        message: 'Reembolso processado (MOCK INTEGRACAO2)'
      }
    };
  }

  mapStatus(status) {
    const statusMap = {
      'approved': 'authorized',
      'paid': 'authorized',
      'authorized': 'authorized',
      'pending': 'pending',
      'processing': 'pending',
      'waiting_payment': 'pending',
      'rejected': 'rejected',
      'failed': 'rejected',
      'cancelled': 'cancelled',
      'refunded': 'refunded',
      'chargeback': 'refunded'
    };
    return statusMap[status] || status;
  }
}

/**
 * Processar pagamento via Payco Gateway (com mocks)
 */
router.post('/process', async (req, res) => {
  try {
    const {
      store_id,
      order_id,
      amount,
      currency = 'BRL',
      payment_method,
      card_data,
      customer,
      installments = 1
    } = req.body;

    console.log('[Payment Integracao2] Processing payment:', {
      store_id,
      order_id,
      amount,
      payment_method,
      mock: USE_MOCKS
    });

    // Busca a loja
    const store = await Store.findOne({ storeId: store_id });
    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Loja não encontrada',
        code: 'store_not_found'
      });
    }

    // Verifica se o gateway está habilitado
    if (!store.paycoSettings?.enabled && store.enabled !== 1) {
      return res.status(403).json({
        success: false,
        error: 'Gateway Payco Integracao2 não está habilitado',
        code: 'gateway_disabled'
      });
    }

    // Usa mock ou API real com credenciais da loja
    const paycoAPI = new PaycoAPI(store.paycoClientId, store.paycoApiKey);

    let paycoResponse;

    // Processa conforme o método de pagamento
    switch (payment_method) {
      case 'credit_card':
        paycoResponse = await paycoAPI.createCreditCardPayment({
          amount,
          currency,
          card_data,
          customer,
          installments,
          order_id,
          description: `Pedido ${order_id} - ${store.storeName || store.storeId} (Integracao2)`
        });
        break;

      case 'debit_card':
        paycoResponse = await paycoAPI.createDebitCardPayment({
          amount,
          currency,
          card_data,
          customer,
          order_id,
          description: `Pedido ${order_id} - ${store.storeName || store.storeId} (Integracao2)`
        });
        break;

      case 'pix':
        paycoResponse = await paycoAPI.createPixPayment({
          amount,
          currency,
          customer,
          order_id,
          description: `Pedido ${order_id} - ${store.storeName || store.storeId} (Integracao2)`,
          expiration_minutes: 30
        });
        break;

      case 'boleto':
        paycoResponse = await paycoAPI.createBoletoPayment({
          amount,
          currency,
          customer,
          order_id,
          description: `Pedido ${order_id} - ${store.storeName || store.storeId} (Integracao2)`,
          due_days: 3
        });
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Método de pagamento inválido',
          code: 'invalid_payment_method'
        });
    }

    // Se o pagamento falhou
    if (!paycoResponse.success) {
      console.error('[Payment Integracao2] Payment failed:', paycoResponse);

      return res.status(400).json({
        success: false,
        error: paycoResponse.error,
        code: paycoResponse.error_code
      });
    }

    // Cria a transação no banco local
    const transaction = new Transaction({
      storeId: store_id,
      orderId: order_id,
      transactionId: paycoResponse.transaction_id,
      amount,
      currency,
      paymentMethod: payment_method,
      status: paycoResponse.status,
      paycoResponse: paycoResponse.raw_response,
      customerData: {
        name: customer.name,
        email: customer.email,
        document: customer.document
      },
      cardData: card_data ? {
        lastFourDigits: card_data.number?.slice(-4),
        brand: card_data.brand,
        holderName: card_data.holder_name
      } : undefined,
      installments: payment_method === 'credit_card' ? installments : 1,
      events: [{
        status: paycoResponse.status,
        timestamp: new Date(),
        details: { message: 'Transação criada via Payco (INTEGRACAO2 MOCK)' }
      }]
    });

    await transaction.save();

    console.log('[Payment Integracao2] Transaction saved:', transaction.transactionId);

    // Cria a transação na Nuvemshop (se não for mock completo)
    try {
      const nuvemshopAPI = new NuvemshopAPI(store.accessToken, store_id);

      const nuvemshopTransaction = await nuvemshopAPI.createTransaction({
        order_id: order_id,
        amount: amount.toString(),
        currency: currency,
        status: paycoResponse.status,
        payment_method_id: `payco_${payment_method}_integracao2`,
        external_id: paycoResponse.transaction_id
      });

      // Atualiza com o ID da Nuvemshop
      transaction.nuvemshopTransactionId = nuvemshopTransaction.id;
      await transaction.save();

      console.log('[Payment Integracao2] Nuvemshop transaction created:', nuvemshopTransaction.id);
    } catch (error) {
      console.error('[Payment Integracao2] Error creating Nuvemshop transaction:', error);
      // Continua mesmo se falhar na Nuvemshop
    }

    // Resposta de sucesso
    const response = {
      success: true,
      id: paycoResponse.transaction_id,
      transaction_id: paycoResponse.transaction_id,
      status: paycoResponse.status,
      _mock: USE_MOCKS,
      _integration: 'integracao2'
    };

    // Adiciona dados específicos do método de pagamento
    if (payment_method === 'pix') {
      response.pix_qr_code = paycoResponse.pix_qr_code;
      response.pix_code = paycoResponse.pix_code;
      response.expires_at = paycoResponse.expires_at;
    } else if (payment_method === 'boleto') {
      response.boleto_url = paycoResponse.boleto_url;
      response.barcode = paycoResponse.barcode;
      response.due_date = paycoResponse.due_date;
      response.redirect_url = paycoResponse.boleto_url;
    } else {
      response.authorization_code = paycoResponse.authorization_code;
    }

    res.json(response);

  } catch (error) {
    console.error('[Payment Integracao2] Error processing payment:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'internal_error'
    });
  }
});

/**
 * Consultar status de pagamento (para polling do PIX)
 */
router.get('/check/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    console.log('[Payment Integracao2] Checking payment status:', transactionId);

    // Busca transação local
    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transação não encontrada'
      });
    }

    // Se já foi pago, retorna direto
    if (transaction.status === 'authorized' || transaction.status === 'paid') {
      return res.json({
        paid: true,
        status: transaction.status,
        transaction_id: transactionId,
        _integration: 'integracao2'
      });
    }

    // Consulta status (mock ou real) com credenciais da loja
    const store = await Store.findOne({ storeId: transaction.storeId });
    const paycoAPI = USE_MOCKS ? new MockPaycoAPI() : new PaycoAPI(store.paycoClientId, store.paycoApiKey);
    const statusResponse = await paycoAPI.getPaymentStatus(transactionId);

    if (statusResponse.success && statusResponse.paid) {
      // Atualiza status local
      const updatedEvents = transaction.events || [];
      updatedEvents.push({
        status: 'authorized',
        timestamp: new Date(),
        details: { message: 'Pagamento confirmado (INTEGRACAO2)' }
      });

      await Transaction.updateTransaction(transactionId, {
        status: 'authorized',
        events: updatedEvents
      });

      // Atualiza na Nuvemshop (reutiliza store já carregada)
      try {
        const nuvemshopAPI = new NuvemshopAPI(store.accessToken, transaction.storeId);

        if (transaction.nuvemshopTransactionId) {
          await nuvemshopAPI.createTransactionEvent(transaction.nuvemshopTransactionId, {
            status: 'authorized',
            amount: transaction.amount.toString()
          });
        }
      } catch (error) {
        console.error('[Payment Integracao2] Error updating Nuvemshop:', error);
      }

      return res.json({
        paid: true,
        status: 'authorized',
        transaction_id: transactionId,
        _integration: 'integracao2'
      });
    }

    res.json({
      paid: false,
      status: transaction.status,
      transaction_id: transactionId,
      _integration: 'integracao2'
    });

  } catch (error) {
    console.error('[Payment Integracao2] Error checking payment status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Consultar status de transação
 */
router.get('/status/:transactionId', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      transactionId: req.params.transactionId
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    res.json({
      transactionId: transaction.transactionId,
      status: transaction.status,
      amount: transaction.amount,
      paymentMethod: transaction.paymentMethod,
      createdAt: transaction.createdAt,
      events: transaction.events,
      _integration: 'integracao2'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Cancelar/reembolsar pagamento
 */
router.post('/refund/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { amount } = req.body;

    console.log('[Payment Integracao2] Refunding payment:', transactionId);

    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    if (transaction.status === 'refunded') {
      return res.status(400).json({ error: 'Transação já foi reembolsada' });
    }

    // Processa reembolso (mock ou real) com credenciais da loja
    const store = await Store.findOne({ storeId: transaction.storeId });
    const paycoAPI = USE_MOCKS ? new MockPaycoAPI() : new PaycoAPI(store.paycoClientId, store.paycoApiKey);
    const refundResponse = await paycoAPI.refundPayment(transactionId, amount);

    if (!refundResponse.success) {
      return res.status(400).json({
        error: refundResponse.error,
        code: 'refund_failed'
      });
    }

    // Atualiza a transação
    const updatedEvents = transaction.events || [];
    updatedEvents.push({
      status: 'refunded',
      timestamp: new Date(),
      details: {
        message: 'Reembolso processado (INTEGRACAO2)',
        refund_id: refundResponse.refund_id,
        amount: amount || transaction.amount
      }
    });

    await Transaction.updateTransaction(transactionId, {
      status: 'refunded',
      events: updatedEvents
    });

    // Atualiza na Nuvemshop (reutiliza store já carregada)
    try {
      const nuvemshopAPI = new NuvemshopAPI(store.accessToken, transaction.storeId);

      if (transaction.nuvemshopTransactionId) {
        await nuvemshopAPI.createTransactionEvent(transaction.nuvemshopTransactionId, {
          status: 'refunded',
          amount: (amount || transaction.amount).toString()
        });
      }
    } catch (error) {
      console.error('[Payment Integracao2] Error updating Nuvemshop:', error);
    }

    res.json({
      success: true,
      transactionId,
      status: 'refunded',
      refund_id: refundResponse.refund_id,
      _mock: USE_MOCKS,
      _integration: 'integracao2'
    });

  } catch (error) {
    console.error('[Payment Integracao2] Error refunding payment:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

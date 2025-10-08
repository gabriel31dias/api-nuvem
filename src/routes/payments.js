const express = require('express');
const router = express.Router();
const Store = require('../models/Store.sqlite');
const Transaction = require('../models/Transaction.sqlite');
const NuvemshopAPI = require('../config/nuvemshop');
const PaycoAPI = require('../config/payco');

/**
 * Processar pagamento via Payco Gateway
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

    console.log('[Payment] Processing payment:', {
      store_id,
      order_id,
      amount,
      payment_method
    });

    const store = await Store.findOne({ storeId: store_id });
    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Loja não encontrada',
        code: 'store_not_found'
      });
    }

    if (!store.paycoSettings?.enabled) {
      return res.status(403).json({
        success: false,
        error: 'Gateway Payco não está habilitado',
        code: 'gateway_disabled'
      });
    }

    const paycoAPI = new PaycoAPI(store.paycoClientId, store.paycoApiKey);

    let paycoResponse;

    switch (payment_method) {
      case 'credit_card':
        paycoResponse = await paycoAPI.createCreditCardPayment({
          amount,
          currency,
          card_data,
          customer,
          installments,
          order_id,
          description: `Pedido ${order_id} - ${store.storeName || store.storeId}`
        });
        break;

      case 'debit_card':
        paycoResponse = await paycoAPI.createDebitCardPayment({
          amount,
          currency,
          card_data,
          customer,
          order_id,
          description: `Pedido ${order_id} - ${store.storeName || store.storeId}`
        });
        break;

      case 'pix':
        paycoResponse = await paycoAPI.createPixPayment({
          amount,
          currency,
          customer,
          order_id,
          description: `Pedido ${order_id} - ${store.storeName || store.storeId}`,
          expiration_minutes: 30
        });
        break;

      case 'boleto':
        paycoResponse = await paycoAPI.createBoletoPayment({
          amount,
          currency,
          customer,
          order_id,
          description: `Pedido ${order_id} - ${store.storeName || store.storeId}`,
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
      console.error('[Payment] Payment failed:', paycoResponse);

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
        details: { message: 'Transação criada via Payco' }
      }]
    });

    await transaction.save();

    console.log('[Payment] Transaction saved:', transaction.transactionId);

    // Cria a transação na Nuvemshop
    try {
      const nuvemshopAPI = new NuvemshopAPI(store.accessToken, store_id);

      const nuvemshopTransaction = await nuvemshopAPI.createTransaction({
        order_id: order_id,
        amount: amount.toString(),
        currency: currency,
        status: paycoResponse.status,
        payment_method_id: `payco_${payment_method}`,
        external_id: paycoResponse.transaction_id
      });

      // Atualiza com o ID da Nuvemshop
      transaction.nuvemshopTransactionId = nuvemshopTransaction.id;
      await transaction.save();

      console.log('[Payment] Nuvemshop transaction created:', nuvemshopTransaction.id);
    } catch (error) {
      console.error('[Payment] Error creating Nuvemshop transaction:', error);
      // Continua mesmo se falhar na Nuvemshop
    }

    // Resposta de sucesso
    const response = {
      success: true,
      id: paycoResponse.transaction_id,
      transaction_id: paycoResponse.transaction_id,
      status: paycoResponse.status
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
    console.error('[Payment] Error processing payment:', error);
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

    console.log('[Payment] Checking payment status:', transactionId);

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
        transaction_id: transactionId
      });
    }

    const store = await Store.findOne({ storeId: transaction.storeId });
    const paycoAPI = new PaycoAPI(store.paycoClientId, store.paycoApiKey);
    const statusResponse = await paycoAPI.getPaymentStatus(transactionId);

    if (statusResponse.success && statusResponse.paid) {
      const updatedEvents = transaction.events || [];
      updatedEvents.push({
        status: 'authorized',
        timestamp: new Date(),
        details: { message: 'Pagamento confirmado' }
      });

      await Transaction.updateTransaction(transactionId, {
        status: 'authorized',
        events: updatedEvents
      });

      try {
        const nuvemshopAPI = new NuvemshopAPI(store.accessToken, transaction.storeId);

        if (transaction.nuvemshopTransactionId) {
          await nuvemshopAPI.createTransactionEvent(transaction.nuvemshopTransactionId, {
            status: 'authorized',
            amount: transaction.amount.toString()
          });
        }
      } catch (error) {
        console.error('[Payment] Error updating Nuvemshop:', error);
      }

      return res.json({
        paid: true,
        status: 'authorized',
        transaction_id: transactionId
      });
    }

    res.json({
      paid: false,
      status: transaction.status,
      transaction_id: transactionId
    });

  } catch (error) {
    console.error('[Payment] Error checking payment status:', error);
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
      events: transaction.events
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
    const { amount } = req.body; // Opcional: reembolso parcial

    console.log('[Payment] Refunding payment:', transactionId);

    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    if (transaction.status === 'refunded') {
      return res.status(400).json({ error: 'Transação já foi reembolsada' });
    }

    const store = await Store.findOne({ storeId: transaction.storeId });
    const paycoAPI = new PaycoAPI(store.paycoClientId, store.paycoApiKey);
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
        message: 'Reembolso processado',
        refund_id: refundResponse.refund_id,
        amount: amount || transaction.amount
      }
    });

    await Transaction.updateTransaction(transactionId, {
      status: 'refunded',
      events: updatedEvents
    });

    try {
      const nuvemshopAPI = new NuvemshopAPI(store.accessToken, transaction.storeId);

      if (transaction.nuvemshopTransactionId) {
        await nuvemshopAPI.createTransactionEvent(transaction.nuvemshopTransactionId, {
          status: 'refunded',
          amount: (amount || transaction.amount).toString()
        });
      }
    } catch (error) {
      console.error('[Payment] Error updating Nuvemshop:', error);
    }

    res.json({
      success: true,
      transactionId,
      status: 'refunded',
      refund_id: refundResponse.refund_id
    });

  } catch (error) {
    console.error('[Payment] Error refunding payment:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

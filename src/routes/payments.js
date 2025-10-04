const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Store = require('../models/Store.sqlite');
const Transaction = require('../models/Transaction.sqlite');
const NuvemshopAPI = require('../config/nuvemshop');

// Simula chamada ao gateway Payco
async function processPaycoPayment(paymentData) {


  const { amount, paymentMethod, cardData, customerData, installments } = paymentData;

  return new Promise((resolve) => {
    setTimeout(() => {
      const success = Math.random() > 0.1; // 90% de sucesso para teste

      if (success) {
        resolve({
          success: true,
          transactionId: `PAYCO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          status: paymentMethod === 'pix' ? 'pending' : 'authorized',
          authorizationCode: Math.random().toString(36).substr(2, 9).toUpperCase(),
          pixQrCode: paymentMethod === 'pix' ? `00020126580014br.gov.bcb.pix0136${crypto.randomUUID()}5204000053039865802BR` : null,
          boletoUrl: paymentMethod === 'boleto' ? `https://payco.com.br/boleto/${crypto.randomUUID()}` : null
        });
      } else {
        resolve({
          success: false,
          error: 'Pagamento recusado',
          errorCode: 'INSUFFICIENT_FUNDS'
        });
      }
    }, 1000);
  });
}

// Processar pagamento
router.post('/process', async (req, res) => {
  try {
    const {
      storeId,
      orderId,
      amount,
      currency = 'BRL',
      paymentMethod,
      cardData,
      customerData,
      installments = 1
    } = req.body;

    // Busca a loja
    const store = await Store.findOne({ storeId });
    if (!store) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    if (!store.paycoSettings?.enabled) {
      return res.status(403).json({ error: 'Gateway Payco não está habilitado' });
    }

    // Processa o pagamento no gateway Payco
    const paycoResponse = await processPaycoPayment({
      amount,
      paymentMethod,
      cardData,
      customerData,
      installments
    });

    if (!paycoResponse.success) {
      return res.status(400).json({
        success: false,
        error: paycoResponse.error,
        errorCode: paycoResponse.errorCode
      });
    }

    // Cria a transação no banco local
    const transaction = new Transaction({
      storeId,
      orderId,
      transactionId: paycoResponse.transactionId,
      amount,
      currency,
      paymentMethod,
      status: paycoResponse.status,
      paycoResponse,
      customerData: {
        name: customerData.name,
        email: customerData.email,
        document: customerData.document
      },
      cardData: cardData ? {
        lastFourDigits: cardData.number.slice(-4),
        brand: cardData.brand,
        holderName: cardData.holderName
      } : undefined,
      installments,
      events: [{
        status: paycoResponse.status,
        timestamp: new Date(),
        details: { message: 'Transação criada' }
      }]
    });

    await transaction.save();

    // Cria a transação na Nuvemshop
    const nuvemshopAPI = new NuvemshopAPI(store.accessToken, storeId);

    const nuvemshopTransaction = await nuvemshopAPI.createTransaction({
      order_id: orderId,
      amount: amount.toString(),
      currency: currency,
      status: paycoResponse.status,
      payment_method_id: `payco_${paymentMethod}`,
      external_id: paycoResponse.transactionId
    });

    // Atualiza com o ID da Nuvemshop
    transaction.nuvemshopTransactionId = nuvemshopTransaction.id;
    await transaction.save();

    res.json({
      success: true,
      transactionId: paycoResponse.transactionId,
      status: paycoResponse.status,
      authorizationCode: paycoResponse.authorizationCode,
      pixQrCode: paycoResponse.pixQrCode,
      boletoUrl: paycoResponse.boletoUrl
    });

  } catch (error) {
    console.error('Erro ao processar pagamento:', error);
    res.status(500).json({ error: error.message });
  }
});

// Consultar status de pagamento
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

// Cancelar/reembolsar pagamento
router.post('/refund/:transactionId', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      transactionId: req.params.transactionId
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    if (transaction.status === 'refunded') {
      return res.status(400).json({ error: 'Transação já foi reembolsada' });
    }

    // AQUI VOCÊ FARIA O REEMBOLSO NO SEU GATEWAY PAYCO

    // Atualiza a transação
    const updatedEvents = transaction.events || [];
    updatedEvents.push({
      status: 'refunded',
      timestamp: new Date(),
      details: { message: 'Reembolso processado' }
    });

    await Transaction.updateTransaction(transaction.transactionId, {
      status: 'refunded',
      events: updatedEvents
    });

    // Atualiza na Nuvemshop
    const store = await Store.findOne({ storeId: transaction.storeId });
    const nuvemshopAPI = new NuvemshopAPI(store.accessToken, transaction.storeId);

    await nuvemshopAPI.createTransactionEvent(transaction.nuvemshopTransactionId, {
      status: 'refunded',
      amount: transaction.amount.toString()
    });

    res.json({
      success: true,
      transactionId: transaction.transactionId,
      status: 'refunded'
    });
  } catch (error) {
    console.error('Erro ao reembolsar pagamento:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

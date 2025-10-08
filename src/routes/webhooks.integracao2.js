const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Store = require('../models/Store.sqlite');
const Transaction = require('../models/Transaction.sqlite');
const NuvemshopAPI = require('../config/nuvemshop');

// Middleware para validar assinatura do webhook (se o Payco enviar)
function validateWebhookSignature(req, res, next) {
  const signature = req.headers['x-payco-signature'];
  const webhookSecret = process.env.PAYCO_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.log('[Webhook Integracao2] No webhook secret configured, skipping validation');
    return next(); // Em desenvolvimento, pode não ter
  }

  if (!signature) {
    console.log('[Webhook Integracao2] No signature provided');
    return res.status(401).json({ error: 'Assinatura não fornecida' });
  }

  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    console.log('[Webhook Integracao2] Invalid signature');
    return res.status(401).json({ error: 'Assinatura inválida' });
  }

  next();
}

// Webhook do Payco - recebe atualizações de status de pagamento
router.post('/payco', validateWebhookSignature, async (req, res) => {
  try {
    const { transactionId, status, event, data } = req.body;

    console.log('[Webhook Integracao2] Payco webhook received:', { transactionId, status, event });

    // Busca a transação
    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
      console.log('[Webhook Integracao2] Transaction not found:', transactionId);
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    // Mapeia status do Payco para status da Nuvemshop
    const statusMap = {
      'payment.authorized': 'authorized',
      'payment.paid': 'paid',
      'payment.cancelled': 'cancelled',
      'payment.refunded': 'refunded',
      'payment.failed': 'failed'
    };

    const newStatus = statusMap[event] || status;

    // Atualiza a transação local
    const updatedEvents = transaction.events || [];
    updatedEvents.push({
      status: newStatus,
      timestamp: new Date(),
      details: {
        ...(data || {}),
        source: 'payco_webhook_integracao2'
      }
    });

    await Transaction.updateTransaction(transaction.transactionId, {
      status: newStatus,
      events: updatedEvents
    });

    console.log('[Webhook Integracao2] Transaction updated:', { transactionId, newStatus });

    // Notifica a Nuvemshop sobre a mudança de status
    const store = await Store.findOne({ storeId: transaction.storeId });

    if (store && transaction.nuvemshopTransactionId) {
      const nuvemshopAPI = new NuvemshopAPI(store.accessToken, transaction.storeId);

      await nuvemshopAPI.createTransactionEvent(transaction.nuvemshopTransactionId, {
        status: newStatus,
        amount: transaction.amount.toString()
      });

      console.log('[Webhook Integracao2] Nuvemshop updated:', newStatus);
    }

    res.json({
      success: true,
      message: 'Webhook processado com sucesso (integracao2)',
      _integration: 'integracao2'
    });
  } catch (error) {
    console.error('[Webhook Integracao2] Error processing Payco webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook da Nuvemshop - recebe notificações de pedidos
router.post('/nuvemshop', async (req, res) => {
  try {
    const { event, store_id, id } = req.body;

    console.log('[Webhook Integracao2] Nuvemshop webhook received:', { event, store_id, id });

    // Eventos possíveis: order/created, order/updated, order/paid, order/cancelled, etc.

    if (event === 'order/created') {
      // Novo pedido criado
      console.log('[Webhook Integracao2] New order created:', id);
    } else if (event === 'order/cancelled') {
      // Pedido cancelado - cancelar pagamento se houver
      const transactions = await Transaction.find({
        storeId: store_id.toString(),
        orderId: id.toString(),
        status: { $in: ['authorized', 'paid'] }
      });

      console.log('[Webhook Integracao2] Cancelling transactions for order:', id, `(${transactions.length} found)`);

      for (const transaction of transactions) {
        // AQUI VOCÊ CANCELARIA NO SEU GATEWAY PAYCO

        const updatedEvents = transaction.events || [];
        updatedEvents.push({
          status: 'cancelled',
          timestamp: new Date(),
          details: {
            message: 'Pedido cancelado na Nuvemshop',
            source: 'nuvemshop_webhook_integracao2'
          }
        });

        await Transaction.updateTransaction(transaction.transactionId, {
          status: 'cancelled',
          events: updatedEvents
        });

        console.log('[Webhook Integracao2] Transaction cancelled:', transaction.transactionId);
      }
    }

    res.json({
      success: true,
      _integration: 'integracao2'
    });
  } catch (error) {
    console.error('[Webhook Integracao2] Error processing Nuvemshop webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para simular mudança de status (apenas para testes)
router.post('/simulate-status-change', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Não disponível em produção',
      _integration: 'integracao2'
    });
  }

  try {
    const { transactionId, status } = req.body;

    console.log('[Webhook Integracao2] Simulating status change:', { transactionId, status });

    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    const updatedEvents = transaction.events || [];
    updatedEvents.push({
      status: status,
      timestamp: new Date(),
      details: {
        message: 'Status alterado manualmente (teste integracao2)',
        source: 'manual_simulation_integracao2'
      }
    });

    await Transaction.updateTransaction(transaction.transactionId, {
      status: status,
      events: updatedEvents
    });

    console.log('[Webhook Integracao2] Transaction status updated:', { transactionId, status });

    // Notifica a Nuvemshop
    const store = await Store.findOne({ storeId: transaction.storeId });

    if (store && transaction.nuvemshopTransactionId) {
      const nuvemshopAPI = new NuvemshopAPI(store.accessToken, transaction.storeId);

      await nuvemshopAPI.createTransactionEvent(transaction.nuvemshopTransactionId, {
        status: status,
        amount: transaction.amount.toString()
      });

      console.log('[Webhook Integracao2] Nuvemshop notified');
    }

    res.json({
      success: true,
      transaction,
      _integration: 'integracao2',
      _mock: true
    });
  } catch (error) {
    console.error('[Webhook Integracao2] Error simulating status change:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

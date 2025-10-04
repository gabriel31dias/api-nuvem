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
    return next(); // Em desenvolvimento, pode não ter
  }

  if (!signature) {
    return res.status(401).json({ error: 'Assinatura não fornecida' });
  }

  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Assinatura inválida' });
  }

  next();
}

// Webhook do Payco - recebe atualizações de status de pagamento
router.post('/payco', validateWebhookSignature, async (req, res) => {
  try {
    const { transactionId, status, event, data } = req.body;

    console.log('Webhook Payco recebido:', { transactionId, status, event });

    // Busca a transação
    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
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
      details: data || {}
    });

    await Transaction.updateTransaction(transaction.transactionId, {
      status: newStatus,
      events: updatedEvents
    });

    // Notifica a Nuvemshop sobre a mudança de status
    const store = await Store.findOne({ storeId: transaction.storeId });

    if (store && transaction.nuvemshopTransactionId) {
      const nuvemshopAPI = new NuvemshopAPI(store.accessToken, transaction.storeId);

      await nuvemshopAPI.createTransactionEvent(transaction.nuvemshopTransactionId, {
        status: newStatus,
        amount: transaction.amount.toString()
      });

      console.log('Status atualizado na Nuvemshop:', newStatus);
    }

    res.json({ success: true, message: 'Webhook processado com sucesso' });
  } catch (error) {
    console.error('Erro ao processar webhook Payco:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook da Nuvemshop - recebe notificações de pedidos
router.post('/nuvemshop', async (req, res) => {
  try {
    const { event, store_id, id } = req.body;

    console.log('Webhook Nuvemshop recebido:', { event, store_id, id });

    // Eventos possíveis: order/created, order/updated, order/paid, order/cancelled, etc.

    if (event === 'order/created') {
      // Novo pedido criado
      console.log('Novo pedido criado:', id);
    } else if (event === 'order/cancelled') {
      // Pedido cancelado - cancelar pagamento se houver
      const transactions = await Transaction.find({
        storeId: store_id.toString(),
        orderId: id.toString(),
        status: { $in: ['authorized', 'paid'] }
      });

      for (const transaction of transactions) {
        // AQUI VOCÊ CANCELARIA NO SEU GATEWAY PAYCO

        const updatedEvents = transaction.events || [];
        updatedEvents.push({
          status: 'cancelled',
          timestamp: new Date(),
          details: { message: 'Pedido cancelado na Nuvemshop' }
        });

        await Transaction.updateTransaction(transaction.transactionId, {
          status: 'cancelled',
          events: updatedEvents
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao processar webhook Nuvemshop:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para simular mudança de status (apenas para testes)
router.post('/simulate-status-change', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Não disponível em produção' });
  }

  try {
    const { transactionId, status } = req.body;

    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    const updatedEvents = transaction.events || [];
    updatedEvents.push({
      status: status,
      timestamp: new Date(),
      details: { message: 'Status alterado manualmente (teste)' }
    });

    await Transaction.updateTransaction(transaction.transactionId, {
      status: status,
      events: updatedEvents
    });

    // Notifica a Nuvemshop
    const store = await Store.findOne({ storeId: transaction.storeId });

    if (store && transaction.nuvemshopTransactionId) {
      const nuvemshopAPI = new NuvemshopAPI(store.accessToken, transaction.storeId);

      await nuvemshopAPI.createTransactionEvent(transaction.nuvemshopTransactionId, {
        status: status,
        amount: transaction.amount.toString()
      });
    }

    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

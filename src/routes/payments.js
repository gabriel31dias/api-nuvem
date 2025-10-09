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

    // Aplica valores padrão caso dados do customer não estejam completos
    const customerData = {
      name: customer?.name || 'João Silva',
      email: customer?.email || 'joao@exemplo.com',
      document: customer?.document || '48001582817',
      phone: customer?.phone || '11999999999'
    };

    console.log('[Payment] Processing payment:', {
      store_id,
      order_id,
      amount,
      payment_method,
      customer: customerData
    });

    // Avisa se estiver usando dados padrão
    if (customerData.email === 'joao@exemplo.com') {
      console.warn('[Payment] WARNING: Using default customer data');
    }

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
          customer: customerData,
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
          customer: customerData,
          order_id,
          description: `Pedido ${order_id} - ${store.storeName || store.storeId}`
        });
        break;

      case 'pix':
        paycoResponse = await paycoAPI.createPixPayment({
          amount,
          currency,
          customer: customerData,
          order_id,
          description: `Pedido ${order_id} - ${store.storeName || store.storeId}`,
          expiration_minutes: 30
        });
        break;

      case 'boleto':
        paycoResponse = await paycoAPI.createBoletoPayment({
          amount,
          currency,
          customer: customerData,
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
        name: customerData.name,
        email: customerData.email,
        document: customerData.document,
        phone: customerData.phone
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
      // URL para exibir o QR Code do PIX
      response.pix_url = `${req.protocol}://${req.get('host')}/pix/${paycoResponse.transaction_id}`;
      response.redirect_url = response.pix_url;
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
 * Página para exibir QR Code do PIX
 */
router.get('/pix/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    console.log('[Payment] Fetching PIX data for:', transactionId);

    // Busca transação local
    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
      return res.status(404).send('<h1>Transação não encontrada</h1>');
    }

    if (transaction.paymentMethod !== 'pix') {
      return res.status(400).send('<h1>Esta transação não é um pagamento PIX</h1>');
    }

    // Extrai dados do PIX da resposta do Payco
    const pixData = transaction.paycoResponse;
    const pixQrCode = pixData?.pix_qr_code || pixData?.qr_code;
    const pixCode = pixData?.pix_code || pixData?.code;

    if (!pixQrCode && !pixCode) {
      return res.status(400).send('<h1>Dados do PIX não disponíveis</h1>');
    }

    // Renderiza página HTML com QR Code
    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pagamento PIX</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
          }
          h1 {
            color: #333;
            font-size: 24px;
            margin-bottom: 10px;
          }
          .amount {
            font-size: 32px;
            font-weight: bold;
            color: #00a650;
            margin: 20px 0;
          }
          .status {
            display: inline-block;
            padding: 8px 20px;
            background: #fff3cd;
            color: #856404;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 30px;
          }
          .status.paid {
            background: #d4edda;
            color: #155724;
          }
          .qrcode {
            background: white;
            padding: 20px;
            border-radius: 12px;
            display: inline-block;
            margin: 20px 0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          }
          .qrcode img {
            max-width: 250px;
            width: 100%;
            height: auto;
          }
          .pix-code {
            margin-top: 30px;
          }
          .pix-code label {
            display: block;
            font-size: 14px;
            color: #666;
            margin-bottom: 10px;
            font-weight: 500;
          }
          .code-container {
            display: flex;
            gap: 10px;
            margin-top: 10px;
          }
          .code-input {
            flex: 1;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            background: #f8f8f8;
          }
          .copy-btn {
            padding: 12px 24px;
            background: #00a650;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s;
          }
          .copy-btn:hover {
            background: #008f42;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,166,80,0.3);
          }
          .copy-btn.copied {
            background: #155724;
          }
          .info {
            margin-top: 30px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 12px;
          }
          .info p {
            color: #666;
            font-size: 14px;
            line-height: 1.6;
            margin: 8px 0;
          }
          .checking {
            margin-top: 20px;
            color: #ff9800;
            font-size: 14px;
            font-weight: 600;
          }
          .success {
            margin-top: 20px;
            padding: 20px;
            background: #d4edda;
            border-radius: 12px;
            color: #155724;
          }
          .success h2 {
            margin-bottom: 10px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Pagamento via PIX</h1>
          <div class="amount">R$ ${(transaction.amount / 100).toFixed(2)}</div>
          <div class="status" id="status">⏱️ Aguardando pagamento</div>

          <div id="payment-area">
            ${pixQrCode ? `
              <div class="qrcode">
                <img src="data:image/png;base64,${pixQrCode}" alt="QR Code PIX" />
              </div>
            ` : ''}

            ${pixCode ? `
              <div class="pix-code">
                <label>Ou copie o código PIX:</label>
                <div class="code-container">
                  <input type="text" value="${pixCode}" readonly id="pix-code-input" class="code-input" />
                  <button onclick="copyCode()" class="copy-btn" id="copy-btn">Copiar</button>
                </div>
              </div>
            ` : ''}

            <div class="info">
              <p>✓ Escaneie o QR Code com o app do seu banco</p>
              <p>✓ Ou copie e cole o código no seu app de pagamentos</p>
              <p>✓ O pagamento será confirmado automaticamente</p>
            </div>

            <div class="checking" id="checking">
              Verificando pagamento...
            </div>
          </div>
        </div>

        <script>
          function copyCode() {
            const input = document.getElementById('pix-code-input');
            const btn = document.getElementById('copy-btn');

            input.select();
            input.setSelectionRange(0, 99999);
            document.execCommand('copy');

            btn.textContent = '✓ Copiado!';
            btn.classList.add('copied');

            setTimeout(() => {
              btn.textContent = 'Copiar';
              btn.classList.remove('copied');
            }, 2000);
          }

          // Polling para verificar se o pagamento foi realizado
          let checkInterval = setInterval(async () => {
            try {
              const response = await fetch('/payments/check/${transactionId}');
              const data = await response.json();

              if (data.paid) {
                clearInterval(checkInterval);

                document.getElementById('status').textContent = '✓ Pagamento confirmado!';
                document.getElementById('status').classList.add('paid');
                document.getElementById('checking').style.display = 'none';

                document.getElementById('payment-area').innerHTML = \`
                  <div class="success">
                    <h2>✓ Pagamento confirmado!</h2>
                    <p>Seu pedido está sendo processado.</p>
                    <p style="margin-top: 15px;">Você pode fechar esta página.</p>
                  </div>
                \`;

                // Redireciona de volta para a loja após 3 segundos
                setTimeout(() => {
                  window.close();
                }, 3000);
              }
            } catch (error) {
              console.error('Erro ao verificar pagamento:', error);
            }
          }, 5000); // Verifica a cada 5 segundos

          // Para o polling após 30 minutos
          setTimeout(() => {
            clearInterval(checkInterval);
            document.getElementById('checking').textContent = '⚠️ Tempo expirado. Por favor, gere um novo PIX.';
            document.getElementById('checking').style.color = '#f44336';
          }, 30 * 60 * 1000);
        </script>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('[Payment] Error displaying PIX page:', error);
    res.status(500).send('<h1>Erro ao carregar página do PIX</h1>');
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

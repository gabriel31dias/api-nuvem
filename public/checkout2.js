/**
 * Payco Payment Gateway - Nuvemshop Checkout Integration
 * Implementação seguindo a documentação oficial da Nuvemshop
 * https://tiendanube.github.io/api-documentation/resources/checkout
 */

(function() {
  'use strict';

  // Configuração da API
  const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : (window.PAYCO_BACKEND_URL || 'https://api-nuvem-mqgt.onrender.com');

  const DEBUG = true; // Sempre ativado para debug

  function log(...args) {
    if (DEBUG) console.log('[Payco]', ...args);
  }

  // Log da configuração inicial
  log('=== PAYCO CHECKOUT INITIALIZED ===');
  log('API_URL:', API_URL);
  log('Hostname:', window.location.hostname);
  log('DEBUG mode:', DEBUG);

  /**
   * Função principal que é chamada pela Nuvemshop
   * LoadCheckoutPaymentContext é injetado pela Nuvemshop no checkout
   */
  if (typeof LoadCheckoutPaymentContext !== 'undefined') {
    LoadCheckoutPaymentContext(function(Checkout, PaymentOptions) {
      log('LoadCheckoutPaymentContext initialized', { Checkout, PaymentOptions });

      // Obtém dados do checkout
      const checkoutData = Checkout.getData();
      log('Checkout data:', checkoutData);
      log('Available keys in checkoutData:', Object.keys(checkoutData));
      log('Customer/Contact data:', checkoutData.customer || checkoutData.contact);
      log('Billing address:', checkoutData.billing_address);
      log('Shipping address:', checkoutData.shipping_address);
      log('Order data:', checkoutData.order);
      log('Complete checkout structure:', JSON.stringify(checkoutData, null, 2));

      // ============================================
      // CARTÃO DE CRÉDITO - Transparent Integration
      // ============================================
      const CreditCardPayment = PaymentOptions.Transparent.CardPayment({
        id: 'payco_credit_card',
        version: 'v2',

        fields: {
          card_number: {
            selector: '#payco-card-number',
            placeholder: '0000 0000 0000 0000'
          },
          card_holder_name: {
            selector: '#payco-card-holder',
            placeholder: 'Nome como está no cartão'
          },
          card_expiration: {
            selector: '#payco-card-expiry',
            placeholder: 'MM/AA'
          },
          card_cvv: {
            selector: '#payco-card-cvv',
            placeholder: 'CVV'
          }
        },

        onLoad: function() {
          log('Credit card payment option loaded');
          renderCreditCardForm();
        },

        onDataChange: function() {
          log('Card data changed');
        },

        onSubmit: function(callback) {
          log('Credit card payment submitted');

          const cardNumber = document.getElementById('payco-card-number').value.replace(/\s/g, '');
          const cardData = {
            number: cardNumber,
            holder_name: document.getElementById('payco-card-holder').value,
            expiration: document.getElementById('payco-card-expiry').value,
            cvv: document.getElementById('payco-card-cvv').value,
            brand: detectCardBrand(cardNumber)
          };

          const installments = document.getElementById('payco-installments')?.value || 1;

          // Validação
          if (!validateCardData(cardData)) {
            callback({
              success: false,
              error_code: 'invalid_card_data'
            });
            return;
          }

          // Processa o pagamento via backend próprio
          const checkoutData = Checkout.getData();
          log('Checkout data for payment:', checkoutData);

          // Extrai dados do cliente usando função auxiliar
          const customerData = extractCustomerData(checkoutData);

          const paymentPayload = {
            store_id: checkoutData.store?.id || checkoutData.storeId,
            order_id: checkoutData.order?.id || checkoutData.orderId || checkoutData.id || 'temp_' + Date.now(),
            amount: checkoutData.order?.total || checkoutData.total || checkoutData.totalPrice,
            currency: checkoutData.order?.currency || checkoutData.currency || 'BRL',
            payment_method: 'credit_card',
            card_data: cardData,
            customer: customerData,
            installments: parseInt(installments)
          };

          log('Payment payload for credit card:', JSON.stringify(paymentPayload, null, 2));

          fetch(API_URL + '/payments/process', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(paymentPayload)
          })
          .then(function(response) {
            log('Response status:', response.status);
            log('Response ok:', response.ok);

            return response.json().then(function(data) {
              log('Response data:', data);
              if (!response.ok) {
                return Promise.reject(data);
              }
              return data;
            });
          })
          .then(function(response) {
            log('Payment processed successfully:', response);

            // Verifica se a resposta tem os dados necessários
            if (!response.transaction_id && !response.id) {
              log('ERROR: No transaction_id in response');
              throw new Error('Transaction ID not received from backend');
            }

            const transactionId = response.transaction_id || response.id;
            log('Using transaction_id:', transactionId);

            // Retorna sucesso com dados da transação
            callback({
              success: true,
              transaction_id: transactionId,
              status: response.status || 'authorized'
            });
          })
          .catch(function(error) {
            log('Payment error:', error);
            log('Error details:', JSON.stringify(error));

            const errorCode = error.code || error.error_code || error.error || 'payment_processing_error';
            const errorMessage = error.message || error.error || 'Erro ao processar pagamento';

            log('Error code:', errorCode);
            log('Error message:', errorMessage);

            Checkout.showErrorCode(errorCode);
            callback({
              success: false,
              error_code: errorCode,
              error_message: errorMessage
            });
          });
        }
      });

      // ============================================
      // CARTÃO DE DÉBITO - Transparent Integration
      // ============================================
      const DebitCardPayment = PaymentOptions.Transparent.CardPayment({
        id: 'payco_debit_card',
        version: 'v2',

        fields: {
          card_number: {
            selector: '#payco-debit-number',
            placeholder: '0000 0000 0000 0000'
          },
          card_holder_name: {
            selector: '#payco-debit-holder',
            placeholder: 'Nome como está no cartão'
          },
          card_expiration: {
            selector: '#payco-debit-expiry',
            placeholder: 'MM/AA'
          },
          card_cvv: {
            selector: '#payco-debit-cvv',
            placeholder: 'CVV'
          }
        },

        onLoad: function() {
          log('Debit card payment option loaded');
          renderDebitCardForm();
        },

        onSubmit: function(callback) {
          log('Debit card payment submitted');

          const cardNumber = document.getElementById('payco-debit-number').value.replace(/\s/g, '');
          const cardData = {
            number: cardNumber,
            holder_name: document.getElementById('payco-debit-holder').value,
            expiration: document.getElementById('payco-debit-expiry').value,
            cvv: document.getElementById('payco-debit-cvv').value,
            brand: detectCardBrand(cardNumber)
          };

          if (!validateCardData(cardData)) {
            callback({
              success: false,
              error_code: 'invalid_card_data'
            });
            return;
          }

          const checkoutData = Checkout.getData();
          log('Checkout data for debit payment:', checkoutData);

          // Extrai dados do cliente usando função auxiliar
          const customerData = extractCustomerData(checkoutData);

          const paymentPayload = {
            store_id: checkoutData.store?.id || checkoutData.storeId,
            order_id: checkoutData.order?.id || checkoutData.orderId || checkoutData.id || 'temp_' + Date.now(),
            amount: checkoutData.order?.total || checkoutData.total || checkoutData.totalPrice,
            currency: checkoutData.order?.currency || checkoutData.currency || 'BRL',
            payment_method: 'debit_card',
            card_data: cardData,
            customer: customerData
          };

          log('Payment payload for debit card:', JSON.stringify(paymentPayload, null, 2));

          fetch(API_URL + '/payments/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentPayload)
          })
          .then(function(response) {
            log('Debit response status:', response.status);
            log('Debit response ok:', response.ok);

            return response.json().then(function(data) {
              log('Debit response data:', data);
              if (!response.ok) {
                return Promise.reject(data);
              }
              return data;
            });
          })
          .then(function(response) {
            log('Debit payment processed:', response);

            // Verifica se a resposta tem os dados necessários
            if (!response.transaction_id && !response.id) {
              log('ERROR: No transaction_id in debit response');
              throw new Error('Transaction ID not received from backend');
            }

            const transactionId = response.transaction_id || response.id;
            log('Using debit transaction_id:', transactionId);

            // Retorna sucesso com dados da transação
            callback({
              success: true,
              transaction_id: transactionId,
              status: response.status || 'authorized'
            });
          })
          .catch(function(error) {
            log('Debit payment error:', error);
            log('Debit error details:', JSON.stringify(error));

            const errorCode = error.code || error.error_code || error.error || 'payment_processing_error';
            const errorMessage = error.message || error.error || 'Erro ao processar pagamento';

            log('Debit error code:', errorCode);
            log('Debit error message:', errorMessage);

            Checkout.showErrorCode(errorCode);
            callback({
              success: false,
              error_code: errorCode,
              error_message: errorMessage
            });
          });
        }
      });

      // ============================================
      // PIX - Transparent Integration (exibe QR Code diretamente no checkout)
      // ============================================
      const PixPayment = PaymentOptions.Transparent.Iframe({
        id: 'payco_pix',
        version: 'v2',

        onLoad: function() {
          log('PIX payment option loaded');
          renderPixInfo();
        },

        onSubmit: function(callback) {
          log('PIX payment submitted');

          const checkoutData = Checkout.getData();
          const customerData = extractCustomerData(checkoutData);

          const paymentPayload = {
            store_id: checkoutData.store?.id || checkoutData.storeId,
            order_id: checkoutData.order?.id || checkoutData.orderId || checkoutData.id || 'temp_' + Date.now(),
            amount: checkoutData.order?.total || checkoutData.total || checkoutData.totalPrice,
            currency: checkoutData.order?.currency || checkoutData.currency || 'BRL',
            payment_method: 'pix',
            customer: customerData
          };

          log('Payment payload for PIX:', JSON.stringify(paymentPayload, null, 2));

          // Gera o PIX
          fetch(API_URL + '/payments/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentPayload)
          })
          .then(function(response) {
            log('PIX response status:', response.status);
            log('PIX response ok:', response.ok);

            return response.json().then(function(data) {
              log('PIX response data:', data);
              if (!response.ok) {
                return Promise.reject(data);
              }
              return data;
            });
          })
          .then(function(response) {
            log('PIX generated:', response);

            // Valida se tem os dados necessários
            if (!response.transaction_id && !response.id) {
              log('ERROR: No transaction_id in PIX response');
              throw new Error('Transaction ID not received from backend');
            }

            const transactionId = response.transaction_id || response.id;
            const qrCode = response.pix_qr_code;
            const pixCode = response.pix_code;

            log('PIX Transaction ID:', transactionId);
            log('PIX QR Code present:', !!qrCode);
            log('PIX Code present:', !!pixCode);

            // Renderiza o QR Code diretamente na página
            renderPixQRCode(qrCode, pixCode);

            // Retorna sucesso
            callback({
              success: true,
              transaction_id: transactionId,
              status: 'pending'
            });

            // Inicia polling para verificar pagamento
            log('Starting PIX polling for transaction:', transactionId);
            setTimeout(function() {
              startPixPolling(transactionId, Checkout, callback);
            }, 5000);
          })
          .catch(function(error) {
            log('PIX error:', error);
            renderPixError(error.message || error.error || 'Erro ao gerar PIX');
            Checkout.showErrorCode(error.code || error.error || 'pix_generation_error');
            callback({
              success: false,
              error_code: error.code || error.error || 'pix_generation_error'
            });
          });
        }
      });

      // ============================================
      // BOLETO - External Redirect Integration
      // ============================================
      const BoletoPayment = PaymentOptions.ExternalPayment({
        id: 'payco_boleto',
        version: 'v2',

        onLoad: function() {
          log('Boleto payment option loaded');
          renderBoletoInfo();
        },

        onSubmit: function(callback) {
          log('Boleto payment submitted');

          const checkoutData = Checkout.getData();
          log('Checkout data for boleto:', checkoutData);

          // Extrai dados do cliente usando função auxiliar
          const customerData = extractCustomerData(checkoutData);
          const billingAddress = checkoutData.billing_address || checkoutData.customer?.billing_address || {};

          const paymentPayload = {
            store_id: checkoutData.store?.id || checkoutData.storeId,
            order_id: checkoutData.order?.id || checkoutData.orderId || checkoutData.id || 'temp_' + Date.now(),
            amount: checkoutData.order?.total || checkoutData.total || checkoutData.totalPrice,
            currency: checkoutData.order?.currency || checkoutData.currency || 'BRL',
            payment_method: 'boleto',
            customer: {
              ...customerData,
              address: billingAddress
            }
          };

          log('Payment payload for boleto:', JSON.stringify(paymentPayload, null, 2));

          fetch(API_URL + '/payments/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentPayload)
          })
          .then(function(response) {
            return response.json().then(function(data) {
              return response.ok ? data : Promise.reject(data);
            });
          })
          .then(function(response) {
            log('Boleto generated:', response);

            // Retorna sucesso com redirect URL
            callback({
              success: true,
              transaction_id: response.transaction_id,
              redirect_url: response.boleto_url || response.redirect_url
            });
          })
          .catch(function(error) {
            log('Boleto error:', error);
            Checkout.showErrorCode(error.code || error.error || 'boleto_generation_error');
            callback({
              success: false,
              error_code: error.code || error.error || 'boleto_generation_error'
            });
          });
        }
      });

      // Adiciona todas as opções de pagamento ao checkout
      Checkout.addPaymentOption(CreditCardPayment);
      Checkout.addPaymentOption(DebitCardPayment);
      Checkout.addPaymentOption(PixPayment);
      Checkout.addPaymentOption(BoletoPayment);

      log('All payment options added to checkout');
    });
  }

  // ============================================
  // FUNÇÕES AUXILIARES
  // ============================================

  /**
   * Extrai dados do customer de forma robusta com valores padrão
   */
  function extractCustomerData(checkoutData) {
    log('Extracting customer data from:', checkoutData);

    // Tenta diferentes locais onde os dados podem estar
    const customer = checkoutData.customer || {};
    const contact = checkoutData.contact || {};
    const billing = checkoutData.billing_address || {};
    const shipping = checkoutData.shipping_address || {};
    const orderCustomer = checkoutData.order?.customer || {};

    // Prioridade: contact > customer > billing > shipping > order.customer
    // Com valores padrão caso não encontre
    const extractedData = {
      name: contact.name ||
            customer.name ||
            billing.name ||
            shipping.name ||
            orderCustomer.name ||
            'João Silva',
      email: contact.email ||
             customer.email ||
             billing.email ||
             orderCustomer.email ||
             'joao@exemplo.com',
      document: contact.identification_number ||
                contact.document ||
                customer.identification_number ||
                customer.document ||
                billing.identification ||
                billing.identification_number ||
                shipping.identification ||
                '48001582817',
      phone: contact.phone ||
             customer.phone ||
             billing.phone ||
             shipping.phone ||
             '11999999999'
    };

    log('Extracted customer data:', extractedData);
    log('Contact data available:', contact);
    log('Customer data available:', customer);
    log('Billing data available:', billing);
    log('Shipping data available:', shipping);

    // Aviso se estiver usando dados padrão
    if (extractedData.name === 'João Silva') {
      log('WARNING: Using default customer name');
    }
    if (extractedData.email === 'joao@exemplo.com') {
      log('WARNING: Using default customer email');
    }
    if (extractedData.document === '48001582817') {
      log('WARNING: Using default customer document');
    }

    return extractedData;
  }

  /**
   * Renderiza formulário de cartão de crédito
   */
  function renderCreditCardForm() {
    const container = document.querySelector('[data-payment-option="payco_credit_card"]');
    if (!container) return;

    container.innerHTML = `
      <div class="payco-form">
        <div class="payco-field">
          <label for="payco-card-number">Número do Cartão</label>
          <input type="text" id="payco-card-number" maxlength="19" autocomplete="cc-number" />
          <div id="payco-card-brand" class="payco-brand"></div>
        </div>

        <div class="payco-field">
          <label for="payco-card-holder">Nome no Cartão</label>
          <input type="text" id="payco-card-holder" autocomplete="cc-name" />
        </div>

        <div class="payco-row">
          <div class="payco-field">
            <label for="payco-card-expiry">Validade</label>
            <input type="text" id="payco-card-expiry" placeholder="MM/AA" maxlength="5" autocomplete="cc-exp" />
          </div>

          <div class="payco-field">
            <label for="payco-card-cvv">CVV</label>
            <input type="text" id="payco-card-cvv" maxlength="4" autocomplete="cc-csc" />
          </div>
        </div>

        <div class="payco-field">
          <label for="payco-installments">Parcelas</label>
          <select id="payco-installments">
            <option value="1">1x sem juros</option>
            <option value="2">2x sem juros</option>
            <option value="3">3x sem juros</option>
            <option value="6">6x sem juros</option>
            <option value="12">12x sem juros</option>
          </select>
        </div>
      </div>
    `;

    attachCardMasks('payco-card-number', 'payco-card-expiry', 'payco-card-cvv', 'payco-card-brand');
    injectStyles();
  }

  /**
   * Renderiza formulário de cartão de débito
   */
  function renderDebitCardForm() {
    const container = document.querySelector('[data-payment-option="payco_debit_card"]');
    if (!container) return;

    container.innerHTML = `
      <div class="payco-form">
        <div class="payco-field">
          <label for="payco-debit-number">Número do Cartão</label>
          <input type="text" id="payco-debit-number" maxlength="19" autocomplete="cc-number" />
          <div id="payco-debit-brand" class="payco-brand"></div>
        </div>

        <div class="payco-field">
          <label for="payco-debit-holder">Nome no Cartão</label>
          <input type="text" id="payco-debit-holder" autocomplete="cc-name" />
        </div>

        <div class="payco-row">
          <div class="payco-field">
            <label for="payco-debit-expiry">Validade</label>
            <input type="text" id="payco-debit-expiry" placeholder="MM/AA" maxlength="5" autocomplete="cc-exp" />
          </div>

          <div class="payco-field">
            <label for="payco-debit-cvv">CVV</label>
            <input type="text" id="payco-debit-cvv" maxlength="4" autocomplete="cc-csc" />
          </div>
        </div>
      </div>
    `;

    attachCardMasks('payco-debit-number', 'payco-debit-expiry', 'payco-debit-cvv', 'payco-debit-brand');
    injectStyles();
  }

  /**
   * Renderiza informações do PIX
   */
  function renderPixInfo() {
    const container = document.querySelector('[data-payment-option="payco_pix"]');
    if (!container) {
      log('ERROR: PIX container not found!');
      return;
    }

    log('Rendering PIX info in container:', container);

    container.innerHTML = `
      <div class="payco-form">
        <div class="payco-info">
          <p>✓ Pagamento instantâneo</p>
          <p>✓ Aprovação em até 2 minutos</p>
          <p>✓ Disponível 24h por dia</p>
          <p style="margin-top: 15px; font-size: 13px; color: #666;">
            O QR Code será exibido após confirmar o pedido
          </p>
        </div>
      </div>
    `;

    injectStyles();
  }


  /**
   * Renderiza QR Code do PIX no container
   */
  function renderPixQRCode(qrCodeImage, pixCode) {
    const container = document.querySelector('[data-payment-option="payco_pix"]');
    if (!container) return;

    container.innerHTML = `
      <div class="payco-form">
        <div class="payco-qrcode">
          <h4>Escaneie o QR Code:</h4>
          ${qrCodeImage ? `<img src="data:image/png;base64,${qrCodeImage}" alt="QR Code PIX" />` : ''}
          ${pixCode ? `
            <div class="payco-pix-code">
              <label>Ou copie o código PIX:</label>
              <input type="text" value="${pixCode}" readonly id="payco-pix-code-input" />
              <button onclick="
                document.getElementById('payco-pix-code-input').select();
                document.execCommand('copy');
                this.textContent = 'Copiado!';
                setTimeout(() => this.textContent = 'Copiar', 2000);
              ">Copiar</button>
            </div>
          ` : ''}
          <p class="payco-waiting">Aguardando pagamento...</p>
        </div>
      </div>
    `;

    injectStyles();
  }

  /**
   * Renderiza erro do PIX
   */
  function renderPixError(errorMessage) {
    const container = document.querySelector('[data-payment-option="payco_pix"]');
    if (!container) return;

    container.innerHTML = `
      <div class="payco-form">
        <div class="payco-error">
          <p>❌ ${errorMessage}</p>
          <p>Por favor, tente novamente ou escolha outro método de pagamento.</p>
        </div>
      </div>
    `;

    injectStyles();
  }

  /**
   * Renderiza informações do Boleto
   */
  function renderBoletoInfo() {
    const container = document.querySelector('[data-payment-option="payco_boleto"]');
    if (!container) return;

    container.innerHTML = `
      <div class="payco-form">
        <div class="payco-info">
          <p>✓ Vencimento em 3 dias úteis</p>
          <p>✓ Pagamento em qualquer banco ou lotérica</p>
          <p>✓ Confirmação em até 2 dias úteis</p>
        </div>
      </div>
    `;

    injectStyles();
  }

  /**
   * Anexa máscaras aos campos de cartão
   */
  function attachCardMasks(numberId, expiryId, cvvId, brandId) {
    const numberInput = document.getElementById(numberId);
    const expiryInput = document.getElementById(expiryId);
    const cvvInput = document.getElementById(cvvId);
    const brandEl = document.getElementById(brandId);

    if (numberInput) {
      numberInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\s/g, '');
        e.target.value = value.match(/.{1,4}/g)?.join(' ') || value;

        // Detecta bandeira
        const brand = detectCardBrand(value);
        if (brandEl && brand !== 'unknown') {
          brandEl.textContent = brand.toUpperCase();
          brandEl.style.display = 'block';
        }
      });
    }

    if (expiryInput) {
      expiryInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) {
          value = value.slice(0, 2) + '/' + value.slice(2, 4);
        }
        e.target.value = value;
      });
    }

    if (cvvInput) {
      cvvInput.addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/\D/g, '');
      });
    }
  }

  /**
   * Valida dados do cartão
   */
  function validateCardData(data) {
    if (!data.number || data.number.length < 13) {
      return false;
    }
    if (!data.holder_name || data.holder_name.length < 3) {
      return false;
    }
    if (!data.expiration || !data.expiration.match(/^\d{2}\/\d{2}$/)) {
      return false;
    }
    if (!data.cvv || data.cvv.length < 3) {
      return false;
    }
    return true;
  }

  /**
   * Detecta bandeira do cartão
   */
  function detectCardBrand(number) {
    const cleaned = number.replace(/\s/g, '');
    if (/^4/.test(cleaned)) return 'visa';
    if (/^5[1-5]/.test(cleaned)) return 'mastercard';
    if (/^3[47]/.test(cleaned)) return 'amex';
    if (/^(636368|438935|504175|451416|636297|5067|4576|4011)/.test(cleaned)) return 'elo';
    if (/^(3841|60)/.test(cleaned)) return 'hipercard';
    return 'unknown';
  }

  /**
   * Polling para verificar pagamento PIX
   */
  function startPixPolling(transactionId, Checkout, callback) {
    let attempts = 0;
    const maxAttempts = 60; // 30 minutos

    const checkPayment = function() {
      if (attempts >= maxAttempts) {
        log('PIX polling timeout after 30 minutes');
        renderPixError('Tempo de espera expirado. Por favor, tente novamente.');
        return;
      }

      fetch(API_URL + '/payments/check/' + transactionId)
        .then(response => response.json())
        .then(data => {
          log('PIX polling response:', data);
          if (data.paid) {
            log('PIX payment confirmed!');

            // Atualiza a interface mostrando sucesso
            const container = document.querySelector('[data-payment-option="payco_pix"]');
            if (container) {
              container.innerHTML = `
                <div class="payco-form">
                  <div class="payco-success" style="text-align: center; padding: 20px;">
                    <h3 style="color: #00a650; margin-bottom: 10px;">✓ Pagamento confirmado!</h3>
                    <p>Seu pedido está sendo processado.</p>
                  </div>
                </div>
              `;
            }

            // Notifica sucesso para finalizar o checkout
            callback({
              success: true,
              transaction_id: transactionId
            });
          } else {
            attempts++;
            setTimeout(checkPayment, 10000); // Verifica a cada 10 segundos
          }
        })
        .catch(error => {
          log('Polling error:', error);
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(checkPayment, 10000);
          }
        });
    };

    // Inicia o primeiro check após 5 segundos
    setTimeout(checkPayment, 5000);
  }

  /**
   * Injeta estilos CSS
   */
  function injectStyles() {
    if (document.getElementById('payco-styles')) return;

    const style = document.createElement('style');
    style.id = 'payco-styles';
    style.textContent = `
      .payco-form {
        padding: 15px;
      }
      .payco-field {
        margin-bottom: 15px;
      }
      .payco-field label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
        font-size: 14px;
      }
      .payco-field input,
      .payco-field select {
        width: 100%;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
      }
      .payco-field input:focus,
      .payco-field select:focus {
        outline: none;
        border-color: #00a650;
      }
      .payco-row {
        display: flex;
        gap: 15px;
      }
      .payco-row .payco-field {
        flex: 1;
      }
      .payco-brand {
        margin-top: 5px;
        font-size: 12px;
        font-weight: 600;
        color: #00a650;
        display: none;
      }
      .payco-info {
        padding: 15px;
        background: #f5f5f5;
        border-radius: 4px;
      }
      .payco-info p {
        margin: 8px 0;
        font-size: 14px;
      }
      .payco-qrcode {
        text-align: center;
        padding: 20px;
      }
      .payco-qrcode img {
        max-width: 250px;
        margin: 15px auto;
      }
      .payco-pix-code {
        margin-top: 15px;
      }
      .payco-pix-code input {
        width: calc(100% - 80px);
        padding: 8px;
        margin-right: 10px;
      }
      .payco-pix-code button {
        padding: 8px 16px;
        background: #00a650;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      .payco-waiting {
        margin-top: 15px;
        font-weight: 600;
        color: #ff9800;
      }
      .payco-error {
        padding: 15px;
        background: #ffebee;
        border-radius: 4px;
        border-left: 4px solid #f44336;
      }
      .payco-error p {
        margin: 8px 0;
        font-size: 14px;
        color: #c62828;
      }
    `;
    document.head.appendChild(style);
  }

})();

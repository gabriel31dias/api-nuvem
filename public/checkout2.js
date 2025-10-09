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

  const DEBUG = window.location.hostname === 'localhost';

  function log(...args) {
    if (DEBUG) console.log('[Payco]', ...args);
  }

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

          const paymentPayload = {
            store_id: checkoutData.store?.id,
            order_id: checkoutData.order?.id,
            amount: checkoutData.order?.total,
            currency: checkoutData.order?.currency || 'BRL',
            payment_method: 'credit_card',
            card_data: cardData,
            customer: {
              name: checkoutData.customer?.name,
              email: checkoutData.customer?.email,
              document: checkoutData.customer?.identification_number,
              phone: checkoutData.customer?.phone
            },
            installments: parseInt(installments)
          };

          fetch(API_URL + '/payments/process', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(paymentPayload)
          })
          .then(function(response) {
            return response.json().then(function(data) {
              return response.ok ? data : Promise.reject(data);
            });
          })
          .then(function(response) {
            log('Payment processed successfully:', response);

            // Agora sim, usa Checkout.processPayment para criar a Transaction na Nuvemshop
            return Checkout.processPayment({
              transaction_id: response.transaction_id,
              status: response.status
            }).then(function() {
              return response;
            });
          })
          .then(function(response) {
            callback({
              success: true,
              transaction_id: response.transaction_id
            });
          })
          .catch(function(error) {
            log('Payment error:', error);
            Checkout.showErrorCode(error.code || error.error || 'payment_processing_error');
            callback({
              success: false,
              error_code: error.code || error.error || 'payment_processing_error'
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

          const paymentPayload = {
            store_id: checkoutData.store?.id,
            order_id: checkoutData.order?.id,
            amount: checkoutData.order?.total,
            currency: checkoutData.order?.currency || 'BRL',
            payment_method: 'debit_card',
            card_data: cardData,
            customer: {
              name: checkoutData.customer?.name,
              email: checkoutData.customer?.email,
              document: checkoutData.customer?.identification_number,
              phone: checkoutData.customer?.phone
            }
          };

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
            log('Debit payment processed:', response);
            return Checkout.processPayment({
              transaction_id: response.transaction_id,
              status: response.status
            }).then(function() { return response; });
          })
          .then(function(response) {
            callback({
              success: true,
              transaction_id: response.transaction_id
            });
          })
          .catch(function(error) {
            log('Debit payment error:', error);
            Checkout.showErrorCode(error.code || error.error || 'payment_processing_error');
            callback({
              success: false,
              error_code: error.code || error.error || 'payment_processing_error'
            });
          });
        }
      });

      // ============================================
      // PIX - External Redirect Integration
      // ============================================
      const PixPayment = PaymentOptions.ExternalPayment({
        id: 'payco_pix',
        version: 'v2',

        onLoad: function() {
          log('PIX payment option loaded');
          renderPixInfo();
        },

        onSubmit: function(callback) {
          log('PIX payment submitted');

          const checkoutData = Checkout.getData();

          const paymentPayload = {
            store_id: checkoutData.store?.id,
            order_id: checkoutData.order?.id,
            amount: checkoutData.order?.total,
            currency: checkoutData.order?.currency || 'BRL',
            payment_method: 'pix',
            customer: {
              name: checkoutData.customer?.name,
              email: checkoutData.customer?.email,
              document: checkoutData.customer?.identification_number,
              phone: checkoutData.customer?.phone
            }
          };

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
            log('PIX generated:', response);

            // Cria a Transaction na Nuvemshop
            return Checkout.processPayment({
              transaction_id: response.transaction_id,
              status: response.status
            }).then(function() {
              return response;
            });
          })
          .then(function(response) {
            // Mostra o QR Code do PIX
            if (response.pix_qr_code || response.pix_code) {
              showPixQRCode(response.pix_qr_code, response.pix_code);

              // Inicia polling para verificar pagamento
              startPixPolling(response.transaction_id, Checkout, callback);
            } else {
              callback({
                success: true,
                transaction_id: response.transaction_id,
                redirect_url: response.redirect_url
              });
            }
          })
          .catch(function(error) {
            log('PIX error:', error);
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

          const paymentPayload = {
            store_id: checkoutData.store?.id,
            order_id: checkoutData.order?.id,
            amount: checkoutData.order?.total,
            currency: checkoutData.order?.currency || 'BRL',
            payment_method: 'boleto',
            customer: {
              name: checkoutData.customer?.name,
              email: checkoutData.customer?.email,
              document: checkoutData.customer?.identification_number,
              phone: checkoutData.customer?.phone,
              address: checkoutData.customer?.billing_address
            }
          };

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

            return Checkout.processPayment({
              transaction_id: response.transaction_id,
              status: response.status
            }).then(function() {
              return response;
            });
          })
          .then(function(response) {
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
    if (!container) return;

    container.innerHTML = `
      <div class="payco-form">
        <div class="payco-info">
          <p>✓ Pagamento instantâneo via PIX</p>
          <p>✓ Aprovação imediata</p>
          <p>✓ Disponível 24/7</p>
        </div>
        <div id="payco-pix-qrcode" style="display: none;"></div>
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
   * Exibe QR Code do PIX
   */
  function showPixQRCode(qrCodeImage, pixCode) {
    const container = document.getElementById('payco-pix-qrcode');
    if (!container) return;

    container.innerHTML = `
      <div class="payco-qrcode">
        <h4>Escaneie o QR Code:</h4>
        ${qrCodeImage ? `<img src="${qrCodeImage}" alt="QR Code PIX" />` : ''}
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
    `;

    container.style.display = 'block';
  }

  /**
   * Polling para verificar pagamento PIX
   */
  function startPixPolling(transactionId, Checkout, callback) {
    let attempts = 0;
    const maxAttempts = 60; // 30 minutos

    const checkPayment = function() {
      if (attempts >= maxAttempts) {
        return;
      }

      fetch(API_URL + '/payments/check/' + transactionId)
        .then(response => response.json())
        .then(data => {
          if (data.paid) {
            callback({
              success: true,
              transaction_id: transactionId
            });
          } else {
            attempts++;
            setTimeout(checkPayment, 30000);
          }
        })
        .catch(error => {
          log('Polling error:', error);
        });
    };

    setTimeout(checkPayment, 10000);
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
    `;
    document.head.appendChild(style);
  }

})();

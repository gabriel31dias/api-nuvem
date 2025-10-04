// Script de Checkout para Nuvemshop
// Este arquivo é carregado no checkout da loja

(function() {
  'use strict';

  const BACKEND_URL = 'http://localhost:3000'; // Alterar para URL de produção

  // Inicialização do checkout
  window.PaycoCheckout = {
    init: function(options) {
      console.log('Payco Checkout iniciado', options);

      const { storeId, orderId, amount, currency, paymentMethod } = options;

      // Cria o formulário de pagamento
      this.renderPaymentForm(paymentMethod, {
        storeId,
        orderId,
        amount,
        currency
      });
    },

    renderPaymentForm: function(paymentMethod, data) {
      const container = document.getElementById('payco-checkout-container');

      if (!container) {
        console.error('Container do checkout não encontrado');
        return;
      }

      let formHtml = '';

      if (paymentMethod === 'credit_card' || paymentMethod === 'debit_card') {
        formHtml = this.getCreditCardForm(paymentMethod);
      } else if (paymentMethod === 'pix') {
        formHtml = this.getPixForm();
      } else if (paymentMethod === 'boleto') {
        formHtml = this.getBoletoForm();
      }

      container.innerHTML = formHtml;

      // Adiciona listeners aos formulários
      this.attachFormListeners(paymentMethod, data);
    },

    getCreditCardForm: function(type) {
      const title = type === 'credit_card' ? 'Cartão de Crédito' : 'Cartão de Débito';

      return `
        <div class="payco-form">
          <h3>${title}</h3>
          <form id="payco-card-form">
            <div class="form-group">
              <label>Número do Cartão</label>
              <input type="text" id="card-number" placeholder="0000 0000 0000 0000" maxlength="19" required>
            </div>
            <div class="form-group">
              <label>Nome no Cartão</label>
              <input type="text" id="card-holder" placeholder="Nome como está no cartão" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Validade</label>
                <input type="text" id="card-expiry" placeholder="MM/AA" maxlength="5" required>
              </div>
              <div class="form-group">
                <label>CVV</label>
                <input type="text" id="card-cvv" placeholder="123" maxlength="4" required>
              </div>
            </div>
            ${type === 'credit_card' ? `
              <div class="form-group">
                <label>Parcelas</label>
                <select id="installments">
                  <option value="1">1x sem juros</option>
                  <option value="2">2x sem juros</option>
                  <option value="3">3x sem juros</option>
                  <option value="6">6x sem juros</option>
                  <option value="12">12x sem juros</option>
                </select>
              </div>
            ` : ''}
            <button type="submit" class="btn-submit">Finalizar Pagamento</button>
          </form>
          <div id="payco-message"></div>
        </div>
      `;
    },

    getPixForm: function() {
      return `
        <div class="payco-form">
          <h3>Pagamento via PIX</h3>
          <form id="payco-pix-form">
            <p>Clique no botão abaixo para gerar o QR Code do PIX</p>
            <button type="submit" class="btn-submit">Gerar QR Code PIX</button>
          </form>
          <div id="payco-pix-qrcode"></div>
          <div id="payco-message"></div>
        </div>
      `;
    },

    getBoletoForm: function() {
      return `
        <div class="payco-form">
          <h3>Boleto Bancário</h3>
          <form id="payco-boleto-form">
            <p>Clique no botão abaixo para gerar o boleto</p>
            <button type="submit" class="btn-submit">Gerar Boleto</button>
          </form>
          <div id="payco-boleto-link"></div>
          <div id="payco-message"></div>
        </div>
      `;
    },

    attachFormListeners: function(paymentMethod, data) {
      if (paymentMethod === 'credit_card' || paymentMethod === 'debit_card') {
        this.attachCardFormListener(paymentMethod, data);
      } else if (paymentMethod === 'pix') {
        this.attachPixFormListener(data);
      } else if (paymentMethod === 'boleto') {
        this.attachBoletoFormListener(data);
      }
    },

    attachCardFormListener: function(paymentMethod, data) {
      const form = document.getElementById('payco-card-form');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const cardNumber = document.getElementById('card-number').value.replace(/\s/g, '');
        const cardHolder = document.getElementById('card-holder').value;
        const cardExpiry = document.getElementById('card-expiry').value;
        const cardCvv = document.getElementById('card-cvv').value;
        const installments = paymentMethod === 'credit_card'
          ? document.getElementById('installments').value
          : 1;

        this.processPayment({
          ...data,
          paymentMethod: paymentMethod,
          cardData: {
            number: cardNumber,
            holderName: cardHolder,
            expiry: cardExpiry,
            cvv: cardCvv,
            brand: this.detectCardBrand(cardNumber)
          },
          installments: parseInt(installments),
          customerData: this.getCustomerData()
        });
      });

      // Máscara para número do cartão
      document.getElementById('card-number').addEventListener('input', function(e) {
        let value = e.target.value.replace(/\s/g, '');
        let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
        e.target.value = formattedValue;
      });

      // Máscara para validade
      document.getElementById('card-expiry').addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) {
          value = value.slice(0, 2) + '/' + value.slice(2, 4);
        }
        e.target.value = value;
      });
    },

    attachPixFormListener: function(data) {
      const form = document.getElementById('payco-pix-form');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        this.processPayment({
          ...data,
          paymentMethod: 'pix',
          customerData: this.getCustomerData()
        });
      });
    },

    attachBoletoFormListener: function(data) {
      const form = document.getElementById('payco-boleto-form');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        this.processPayment({
          ...data,
          paymentMethod: 'boleto',
          customerData: this.getCustomerData()
        });
      });
    },

    processPayment: async function(paymentData) {
      const messageEl = document.getElementById('payco-message');
      messageEl.innerHTML = '<p class="loading">Processando pagamento...</p>';

      try {
        const response = await fetch(`${BACKEND_URL}/payments/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(paymentData)
        });

        const result = await response.json();

        if (result.success) {
          if (paymentData.paymentMethod === 'pix' && result.pixQrCode) {
            this.showPixQrCode(result.pixQrCode);
          } else if (paymentData.paymentMethod === 'boleto' && result.boletoUrl) {
            this.showBoletoLink(result.boletoUrl);
          } else {
            messageEl.innerHTML = '<p class="success">Pagamento aprovado! Redirecionando...</p>';
            setTimeout(() => {
              window.location.href = '/checkout/success';
            }, 2000);
          }
        } else {
          messageEl.innerHTML = `<p class="error">Erro: ${result.error}</p>`;
        }
      } catch (error) {
        messageEl.innerHTML = '<p class="error">Erro ao processar pagamento. Tente novamente.</p>';
        console.error('Erro:', error);
      }
    },

    showPixQrCode: function(qrCode) {
      const container = document.getElementById('payco-pix-qrcode');
      container.innerHTML = `
        <div class="pix-qrcode">
          <p>Escaneie o QR Code com seu aplicativo de banco:</p>
          <div class="qrcode-placeholder">${qrCode}</div>
          <p>Ou copie o código:</p>
          <input type="text" value="${qrCode}" readonly>
          <button onclick="navigator.clipboard.writeText('${qrCode}')">Copiar Código</button>
        </div>
      `;
    },

    showBoletoLink: function(url) {
      const container = document.getElementById('payco-boleto-link');
      container.innerHTML = `
        <div class="boleto-link">
          <p>Boleto gerado com sucesso!</p>
          <a href="${url}" target="_blank" class="btn-boleto">Visualizar/Imprimir Boleto</a>
        </div>
      `;
    },

    detectCardBrand: function(number) {
      const firstDigit = number[0];
      const firstTwo = number.slice(0, 2);

      if (firstDigit === '4') return 'visa';
      if (firstTwo >= '51' && firstTwo <= '55') return 'mastercard';
      if (firstTwo === '34' || firstTwo === '37') return 'amex';
      if (firstTwo === '60' || firstTwo === '65') return 'discover';
      if (firstTwo === '35') return 'jcb';

      return 'unknown';
    },

    getCustomerData: function() {
      // Pega dados do cliente do formulário da Nuvemshop
      return {
        name: document.querySelector('[name="customer[name]"]')?.value || '',
        email: document.querySelector('[name="customer[email]"]')?.value || '',
        document: document.querySelector('[name="customer[document]"]')?.value || ''
      };
    }
  };

})();

const axios = require('axios');
const paycoAuthService = require('./paycoAuth');

const PAYCO_API_BASE_URL = process.env.PAYCO_API_URL || 'https://api.payments.payco.com.br';

/**
 * Cliente para integração com Payco Payments Gateway
 */
class PaycoAPI {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey || process.env.PAYCO_API_KEY;
    this.apiSecret = apiSecret || process.env.PAYCO_API_SECRET;
    this.baseURL = PAYCO_API_BASE_URL;
  }

  /**
   * Retorna headers de autenticação com OAuth token
   */
  async getHeaders() {
    const oauthToken = await paycoAuthService.getToken(this.apiSecret, this.apiKey);

    return {
      'Authorization': `Bearer ${oauthToken}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Cria uma transação de cartão de crédito
   * @param {Object} paymentData - Dados do pagamento
   */
  async createCreditCardPayment(paymentData) {
    console.log('paymentData card credit', paymentData)

    try {
      const {
        amount,
        currency = 'BRL',
        card_data,
        customer,
        installments = 1,
        order_id,
        description
      } = paymentData;

      const payload = {
        amount: parseFloat(amount),
        currency,
        payment_method: 'credit_card',
        card: {
          number: card_data.number,
          holder_name: card_data.holder_name,
          expiration_month: card_data.expiration.split('/')[0],
          expiration_year: '20' + card_data.expiration.split('/')[1],
          cvv: card_data.cvv
        },
        customer: {
          name: customer.name,
          email: customer.email,
          document: customer.document,
          phone: customer.phone
        },
        installments,
        external_reference: order_id,
        description: description || `Pedido #${order_id}`
      };

      console.log('[Payco] Creating credit card payment:', { order_id, amount });

      const response = await axios.post(
        `${this.baseURL}/payments/credit-card`,
        payload,
        { headers: await this.getHeaders() }
      );

      console.log('[Payco] Payment created successfully:', response.data);

      return {
        success: true,
        transaction_id: response.data.id || response.data.transaction_id,
        status: this.mapStatus(response.data.status),
        authorization_code: response.data.authorization_code,
        raw_response: response.data
      };
    } catch (error) {
      console.error('[Payco] Error creating credit card payment:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data?.message || error.message,
        error_code: error.response?.data?.code || 'PAYMENT_ERROR',
        raw_error: error.response?.data
      };
    }
  }

  /**
   * Cria uma transação de cartão de débito
   * @param {Object} paymentData - Dados do pagamento
   */
  async createDebitCardPayment(paymentData) {
    console.log('paymentData card debit', paymentData)

    try {
      const {
        amount,
        currency = 'BRL',
        card_data,
        customer,
        order_id,
        description
      } = paymentData;

      const payload = {
        amount: parseFloat(amount),
        currency,
        payment_method: 'debit_card',
        card: {
          number: card_data.number,
          holder_name: card_data.holder_name,
          expiration_month: card_data.expiration.split('/')[0],
          expiration_year: '20' + card_data.expiration.split('/')[1],
          cvv: card_data.cvv
        },
        customer: {
          name: customer.name,
          email: customer.email,
          document: customer.document,
          phone: customer.phone
        },
        external_reference: order_id,
        description: description || `Pedido #${order_id}`
      };

      console.log('[Payco] Creating debit card payment:', { order_id, amount });

      const response = await axios.post(
        `${this.baseURL}/payments/debit-card`,
        payload,
        { headers: await this.getHeaders() }
      );

      console.log('[Payco] Debit payment created successfully:', response.data);

      return {
        success: true,
        transaction_id: response.data.id || response.data.transaction_id,
        status: this.mapStatus(response.data.status),
        authorization_code: response.data.authorization_code,
        raw_response: response.data
      };
    } catch (error) {
      console.error('[Payco] Error creating debit card payment:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data?.message || error.message,
        error_code: error.response?.data?.code || 'PAYMENT_ERROR',
        raw_error: error.response?.data
      };
    }
  }

  /**
   * Cria uma transação PIX
   * @param {Object} paymentData - Dados do pagamento
   */
  async createPixPayment(paymentData) {
    try {
      const {
        amount,
        currency = 'BRL',
        customer,
        order_id,
        description,
        expiration_minutes = 30
      } = paymentData;

      console.log('paymentData pix', paymentData)

      const payload = {
        amount: parseFloat(amount),
        currency,
        payment_method: 'pix',
        customer: {
          name: customer.name,
          email: customer.email,
          document: customer.document,
          phone: customer.phone
        },
        expiration_minutes,
        external_reference: order_id,
        description: description || `Pedido #${order_id}`
      };

      console.log('[Payco] Creating PIX payment:', { order_id, amount });
      const header = await this.getHeaders();
      console.log('header', header)

      const response = await axios.post(
        `${this.baseURL}/payments/pix`,
        payload,
        { headers: header}
      );

      console.log('[Payco] PIX created successfully:', response.data);

      return {
        success: true,
        transaction_id: response.data.id || response.data.transaction_id,
        status: 'pending',
        pix_qr_code: response.data.qr_code_base64 || response.data.qr_code_image,
        pix_code: response.data.qr_code || response.data.pix_copy_paste,
        expires_at: response.data.expires_at,
        raw_response: response.data
      };
    } catch (error) {
      console.error('[Payco] Error creating PIX payment:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data?.message || error.message,
        error_code: error.response?.data?.code || 'PIX_ERROR',
        raw_error: error.response?.data
      };
    }
  }

  /**
   * Cria uma transação de Boleto
   * @param {Object} paymentData - Dados do pagamento
   */
  async createBoletoPayment(paymentData) {
    console.log('paymentData boleto', paymentData)

    try {
      const {
        amount,
        currency = 'BRL',
        customer,
        order_id,
        description,
        due_days = 3
      } = paymentData;

      const payload = {
        amount: parseFloat(amount),
        currency,
        payment_method: 'boleto',
        customer: {
          name: customer.name,
          email: customer.email,
          document: customer.document,
          phone: customer.phone,
          address: customer.address
        },
        due_days,
        external_reference: order_id,
        description: description || `Pedido #${order_id}`
      };

      console.log('[Payco] Creating Boleto payment:', { order_id, amount });

      const response = await axios.post(
        `${this.baseURL}/payments/boleto`,
        payload,
        { headers: await this.getHeaders() }
      );

      console.log('[Payco] Boleto created successfully:', response.data);

      return {
        success: true,
        transaction_id: response.data.id || response.data.transaction_id,
        status: 'pending',
        boleto_url: response.data.boleto_url || response.data.pdf_url,
        barcode: response.data.barcode || response.data.digitable_line,
        due_date: response.data.due_date,
        raw_response: response.data
      };
    } catch (error) {
      console.error('[Payco] Error creating Boleto payment:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data?.message || error.message,
        error_code: error.response?.data?.code || 'BOLETO_ERROR',
        raw_error: error.response?.data
      };
    }
  }

  /**
   * Consulta status de uma transação
   * @param {String} transactionId - ID da transação
   */
  async getPaymentStatus(transactionId) {
    try {
      console.log('[Payco] Checking payment status:', transactionId);

      const response = await axios.get(
        `${this.baseURL}/payments/${transactionId}`,
        { headers: await this.getHeaders() }
      );

      return {
        success: true,
        status: this.mapStatus(response.data.status),
        paid: response.data.status === 'approved' || response.data.status === 'paid',
        raw_response: response.data
      };
    } catch (error) {
      console.error('[Payco] Error checking payment status:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Cancela/Reembolsa uma transação
   * @param {String} transactionId - ID da transação
   * @param {Number} amount - Valor a reembolsar (opcional, padrão é total)
   */
  async refundPayment(transactionId, amount = null) {
    try {
      console.log('[Payco] Refunding payment:', transactionId);

      const payload = amount ? { amount: parseFloat(amount) } : {};

      const response = await axios.post(
        `${this.baseURL}/payments/${transactionId}/refund`,
        payload,
        { headers: await this.getHeaders() }
      );

      return {
        success: true,
        refund_id: response.data.refund_id || response.data.id,
        status: 'refunded',
        raw_response: response.data
      };
    } catch (error) {
      console.error('[Payco] Error refunding payment:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Mapeia status da Payco para status padrão
   */
  mapStatus(paycoStatus) {
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

    return statusMap[paycoStatus] || paycoStatus;
  }
}

module.exports = PaycoAPI;

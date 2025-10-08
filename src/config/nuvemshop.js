const axios = require('axios');

const NUVEMSHOP_API_BASE_URL = 'https://api.nuvemshop.com.br/v1';
const NUVEMSHOP_AUTH_URL = 'https://www.tiendanube.com/apps/authorize/token';

class NuvemshopAPI {
  constructor(accessToken, storeId) {
    this.accessToken = accessToken;
    this.storeId = storeId;
    this.baseURL = `${NUVEMSHOP_API_BASE_URL}/${storeId}`;
  }

  getHeaders() {
    return {
      'Authentication': `bearer ${this.accessToken}`,
      'User-Agent': 'Payco Payment Gateway (contato@payco.com.br)',
      'Content-Type': 'application/json'
    };
  }

  /** =====================
   *  AUTH / INSTALL FLOW
   *  ===================== */
  static async install(code) {
    try {
      const payload = {
        client_id: process.env.NUVEMSHOP_CLIENT_ID,
        client_secret: process.env.NUVEMSHOP_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code
      };

      console.log(payload)

      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Payco Payment Gateway (contato@payco.com.br)'
      };

      const response = await axios.post(NUVEMSHOP_AUTH_URL, payload, { headers });

     
      console.log('✅ App instalado com sucesso:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao instalar app Nuvemshop:', error.response?.data || error.message);
      throw error;
    }
  }

  /** =====================
   *  PAYMENT PROVIDERS
   *  ===================== */
  async createPaymentProvider(providerData) {
    try {
      const response = await axios.post(
        `${this.baseURL}/payment_providers`,
        providerData,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Erro ao criar payment provider:', error.response?.data || error.message);
      throw error;
    }
  }

  async updatePaymentProvider(providerId, providerData) {
    try {
      const response = await axios.put(
        `${this.baseURL}/payment_providers/${providerId}`,
        providerData,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Erro ao atualizar payment provider:', error.response?.data || error.message);
      throw error;
    }
  }

  async getPaymentProvider(providerId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/payment_providers/${providerId}`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar payment provider:', error.response?.data || error.message);
      throw error;
    }
  }

  /** =====================
   *  TRANSACTIONS
   *  ===================== */
  async createTransaction(transactionData) {
    try {
      const response = await axios.post(
        `${this.baseURL}/transactions`,
        transactionData,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Erro ao criar transaction:', error.response?.data || error.message);
      throw error;
    }
  }

  async createTransactionEvent(transactionId, eventData) {
    try {
      const response = await axios.post(
        `${this.baseURL}/transactions/${transactionId}/events`,
        eventData,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Erro ao criar transaction event:', error.response?.data || error.message);
      throw error;
    }
  }

  /** =====================
   *  ORDERS
   *  ===================== */
  async getOrder(orderId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/orders/${orderId}`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar pedido:', error.response?.data || error.message);
      throw error;
    }
  }

  /** =====================
   *  STORE INFO
   *  ===================== */
  async getStoreInfo() {
    try {
      const response = await axios.get(
        `${this.baseURL}/store`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar informações da loja:', error.response?.data || error.message);
      throw error;
    }
  }

  /** =====================
   *  AUTH (token refresh)
   *  ===================== */
  static async getAccessToken(code) {
    return await NuvemshopAPI.install(code);
  }
}

module.exports = NuvemshopAPI;

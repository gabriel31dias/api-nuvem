const axios = require('axios');

/**
 * Serviço de autenticação OAuth para Payco
 * Gerencia token OAuth com cache e renovação automática por store
 */
class PaycoAuthService {
  constructor() {
    this.ssoUrl = process.env.PAYCO_SSO_URL || 'https://sso.payments.payco.com.br/realms/payco-payments/protocol/openid-connect/token';

    // Cache de tokens por store (usando paycoClientId como chave)
    this.tokenCache = new Map();
  }

  /**
   * Obtém a chave do cache para uma store
   */
  getCacheKey(paycoClientId) {
    return paycoClientId;
  }

  /**
   * Verifica se o token ainda é válido
   */
  isTokenValid(cacheEntry) {
    if (!cacheEntry || !cacheEntry.token || !cacheEntry.expiresAt) {
      return false;
    }

    // Renova o token 30 segundos antes de expirar
    const now = Date.now();
    const expiresIn = cacheEntry.expiresAt - now;
    return expiresIn > 30000;
  }

  /**
   * Obtém um novo token OAuth usando credenciais da store
   */
  async getNewToken(paycoApiKey, paycoClientId) {
    try {
      console.log(`[PaycoAuth] Requesting new OAuth token for client: ${paycoClientId}`);

      const params = new URLSearchParams();
      params.append('client_id', paycoClientId);
      params.append('client_secret', paycoApiKey);
      params.append('grant_type', 'client_credentials');

      const response = await axios.post(this.ssoUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const { access_token, expires_in } = response.data;

      // Armazena o token no cache
      const cacheKey = this.getCacheKey(paycoClientId);
      this.tokenCache.set(cacheKey, {
        token: access_token,
        expiresAt: Date.now() + (expires_in * 1000)
      });

      console.log(`[PaycoAuth] OAuth token obtained successfully for client: ${paycoClientId}`);
      console.log(`[PaycoAuth] Token expires in: ${expires_in} seconds`);

      return access_token;
    } catch (error) {
      console.error(`[PaycoAuth] Error obtaining OAuth token for client ${paycoClientId}:`, error.response?.data || error.message);
      throw new Error('Failed to obtain OAuth token: ' + (error.response?.data?.error_description || error.message));
    }
  }

  /**
   * Obtém o token válido (do cache ou novo) para uma store
   */
  async getToken(paycoApiKey, paycoClientId) {
    if (!paycoApiKey || !paycoClientId) {
      throw new Error('paycoApiKey and paycoClientId are required');
    }

    const cacheKey = this.getCacheKey(paycoClientId);
    const cacheEntry = this.tokenCache.get(cacheKey);

    if (this.isTokenValid(cacheEntry)) {
      console.log(`[PaycoAuth] Using cached OAuth token for client: ${paycoClientId}`);
      return cacheEntry.token;
    }

    return await this.getNewToken(paycoApiKey, paycoClientId);
  }

  /**
   * Força renovação do token para uma store
   */
  async refreshToken(paycoApiKey, paycoClientId) {
    console.log(`[PaycoAuth] Forcing token refresh for client: ${paycoClientId}`);
    return await this.getNewToken(paycoApiKey, paycoClientId);
  }

  /**
   * Limpa o cache do token de uma store específica
   */
  clearToken(paycoClientId) {
    if (paycoClientId) {
      console.log(`[PaycoAuth] Clearing token cache for client: ${paycoClientId}`);
      const cacheKey = this.getCacheKey(paycoClientId);
      this.tokenCache.delete(cacheKey);
    } else {
      console.log('[PaycoAuth] Clearing all token caches');
      this.tokenCache.clear();
    }
  }
}

// Instância singleton
const paycoAuthService = new PaycoAuthService();

module.exports = paycoAuthService;

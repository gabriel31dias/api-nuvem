/**
 * Teste unitário simples para pagamento PIX
 * Execute com: node test-pix.js
 */

const PaycoAPI = require('./src/config/payco');

// Mock básico do axios
const originalAxios = require('axios');
const mockResponse = {
  data: {
    id: 'pix_123456789',
    transaction_id: 'pix_123456789',
    status: 'pending',
    qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    qr_code: '00020126580014br.gov.bcb.pix0136a629532e-7693-4846-852d-1bbff6b2f8cd520400005303986540510.005802BR5913Fulano de Tal6008BRASILIA62410503***50300017br.gov.bcb.brcode01051.0.063041D3A',
    expires_at: '2024-09-19T20:36:50.000Z'
  }
};

// Testes
async function runTests() {
  console.log('=== Iniciando testes do PIX ===\n');

  // Teste 1: Validar estrutura do payload
  console.log('Teste 1: Validar estrutura do payload');
  try {
    const paycoAPI = new PaycoAPI('test_client_id', 'test_api_secret');

    const paymentData = {
      amount: 10.50,
      customer: {
        name: 'ARTHUR REIS LIMA',
        document: '14457349402',
        email: 'arthur@exemplo.com'
      },
      order_id: 'ORDER-123',
      description: 'Teste de pagamento PIX',
      expiration_minutes: 30
    };

    // Mock temporário do axios.post
    const originalPost = originalAxios.post;
    let capturedPayload = null;

    originalAxios.post = async (url, payload, config) => {
      capturedPayload = payload;
      return mockResponse;
    };

    // Mock do getHeaders
    paycoAPI.getHeaders = async () => ({
      'Authorization': 'Bearer test_token',
      'Content-Type': 'application/json'
    });

    await paycoAPI.createPixPayment(paymentData);

    // Restaura o axios original
    originalAxios.post = originalPost;

    // Validações
    console.assert(capturedPayload !== null, 'Payload deve existir');
    console.assert(capturedPayload.amount === 10.50, 'Amount deve ser 10.50');
    console.assert(capturedPayload.description === 'Teste de pagamento PIX', 'Description deve estar correta');
    console.assert(capturedPayload.customer.name === 'ARTHUR REIS LIMA', 'Customer name deve estar correto');
    console.assert(capturedPayload.customer.document.number === '14457349402', 'Document number deve estar correto');
    console.assert(capturedPayload.customer.document.type === 'CPF', 'Document type deve ser CPF');
    console.assert(capturedPayload.expiration_date !== undefined, 'Expiration date deve existir');

    console.log('✓ Payload está com a estrutura correta');
    console.log('Payload gerado:', JSON.stringify(capturedPayload, null, 2));

  } catch (error) {
    console.error('✗ Erro no teste 1:', error.message);
  }

  console.log('\n');

  // Teste 2: Validar resposta de sucesso
  console.log('Teste 2: Validar resposta de sucesso');
  try {
    const paycoAPI = new PaycoAPI('test_client_id', 'test_api_secret');

    const originalPost = originalAxios.post;
    originalAxios.post = async () => mockResponse;

    paycoAPI.getHeaders = async () => ({
      'Authorization': 'Bearer test_token',
      'Content-Type': 'application/json'
    });

    const result = await paycoAPI.createPixPayment({
      amount: 10.50,
      customer: {
        name: 'ARTHUR REIS LIMA',
        document: '14457349402'
      },
      order_id: 'ORDER-123',
      description: 'Teste'
    });

    originalAxios.post = originalPost;

    console.assert(result.success === true, 'Success deve ser true');
    console.assert(result.transaction_id === 'pix_123456789', 'Transaction ID deve estar correto');
    console.assert(result.status === 'pending', 'Status deve ser pending');
    console.assert(result.pix_qr_code !== undefined, 'QR Code deve existir');
    console.assert(result.pix_code !== undefined, 'PIX Code deve existir');

    console.log('✓ Resposta de sucesso validada corretamente');
    console.log('Resposta:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('✗ Erro no teste 2:', error.message);
  }

  console.log('\n');

  // Teste 3: Validar tratamento de erro
  console.log('Teste 3: Validar tratamento de erro');
  try {
    const paycoAPI = new PaycoAPI('test_client_id', 'test_api_secret');

    const originalPost = originalAxios.post;
    originalAxios.post = async () => {
      const error = new Error('Network Error');
      error.response = {
        data: {
          message: 'Invalid credentials',
          code: 'UNAUTHORIZED'
        }
      };
      throw error;
    };

    paycoAPI.getHeaders = async () => ({
      'Authorization': 'Bearer test_token',
      'Content-Type': 'application/json'
    });

    const result = await paycoAPI.createPixPayment({
      amount: 10.50,
      customer: {
        name: 'ARTHUR REIS LIMA',
        document: '14457349402'
      },
      order_id: 'ORDER-123',
      description: 'Teste'
    });

    originalAxios.post = originalPost;

    console.assert(result.success === false, 'Success deve ser false');
    console.assert(result.error === 'Invalid credentials', 'Error message deve estar correto');
    console.assert(result.error_code === 'UNAUTHORIZED', 'Error code deve estar correto');

    console.log('✓ Tratamento de erro validado corretamente');
    console.log('Resposta de erro:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('✗ Erro no teste 3:', error.message);
  }

  console.log('\n=== Testes concluídos ===');
}

// Executa os testes
runTests().catch(console.error);

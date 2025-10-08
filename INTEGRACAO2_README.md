# Rotas Integracao2 - Modo Mock

Este documento descreve as rotas da **Integracao2**, que são cópias das rotas originais com **modo mock habilitado por padrão**.

## 📋 Visão Geral

As rotas integracao2 foram criadas para permitir testes sem depender de APIs externas reais. Todas as chamadas para o gateway de pagamento Payco são simuladas usando mocks.

## 🗺️ Estrutura das Rotas

Todas as rotas integracao2 estão prefixadas com `/integracao2`:

### Rotas de Autenticação
- **GET** `/integracao2/auth/install` - Instalação do app (mockado)
- **GET** `/integracao2/auth/callback` - Callback OAuth
- **GET** `/integracao2/auth/status/:storeId` - Status da instalação
- **GET** `/integracao2/auth/store/:storeId` - Informações da loja (mockado)
- **POST** `/integracao2/auth/store/:storeId/config` - Salvar configurações

### Rotas de Pagamentos
- **POST** `/integracao2/payments/process` - Processar pagamento (mockado)
- **GET** `/integracao2/payments/check/:transactionId` - Verificar status do pagamento
- **GET** `/integracao2/payments/status/:transactionId` - Status da transação
- **POST** `/integracao2/payments/refund/:transactionId` - Reembolsar pagamento (mockado)

### Rotas de Webhooks
- **POST** `/integracao2/webhooks/payco` - Webhook do gateway Payco
- **POST** `/integracao2/webhooks/nuvemshop` - Webhook da Nuvemshop
- **POST** `/integracao2/webhooks/simulate-status-change` - Simular mudança de status (apenas dev)

### Rotas de Payment Provider
- **GET** `/integracao2/payment-provider/:storeId` - Obter configurações
- **PUT** `/integracao2/payment-provider/:storeId/settings` - Atualizar configurações
- **DELETE** `/integracao2/payment-provider/:storeId` - Desinstalar app

## 🎭 Comportamento dos Mocks

### Pagamentos com Cartão de Crédito/Débito
- **80% de aprovação** - Retorna status `authorized`
- **20% de recusa** - Retorna erro (cartão recusado ou saldo insuficiente)
- Gera `transaction_id` mockado: `mock_cc_integracao2_{timestamp}_{random}`
- Retorna código de autorização mockado

### Pagamentos PIX
- Sempre gera QR Code mockado (base64)
- Gera código PIX copia-e-cola mockado
- Status inicial: `pending`
- Na consulta de status, **30% de chance** de estar pago

### Pagamentos Boleto
- Gera URL mockada do boleto
- Gera código de barras mockado
- Define vencimento para 3 dias úteis
- Status inicial: `pending`
- Na consulta de status, **30% de chance** de estar pago

### Reembolsos
- Sempre bem-sucedido no mock
- Gera `refund_id` mockado
- Atualiza status para `refunded`

## 🔧 Exemplos de Uso

### Instalar App (Mock)

```bash
curl http://localhost:3000/integracao2/auth/install?code=test
```

Resposta mockada:
- `user_id`: número aleatório (999888+)
- `access_token`: mock_access_token_integracao2_{timestamp}
- `paymentProviderId`: mock_provider_integracao2_{timestamp}

### Processar Pagamento com Cartão

```bash
curl -X POST http://localhost:3000/integracao2/payments/process \
  -H "Content-Type: application/json" \
  -d '{
    "store_id": "999888",
    "order_id": "123",
    "amount": 100.00,
    "payment_method": "credit_card",
    "card_data": {
      "number": "4111111111111111",
      "holder_name": "Teste Mock",
      "expiration": "12/25",
      "cvv": "123",
      "brand": "visa"
    },
    "customer": {
      "name": "Cliente Teste",
      "email": "cliente@teste.com",
      "document": "12345678900",
      "phone": "+5511999999999"
    },
    "installments": 3
  }'
```

Resposta (80% de chance de sucesso):
```json
{
  "success": true,
  "transaction_id": "mock_cc_integracao2_1234567890_abc123",
  "status": "authorized",
  "authorization_code": "AUTH123456",
  "_mock": true,
  "_integration": "integracao2"
}
```

### Processar Pagamento PIX

```bash
curl -X POST http://localhost:3000/integracao2/payments/process \
  -H "Content-Type: application/json" \
  -d '{
    "store_id": "999888",
    "order_id": "124",
    "amount": 50.00,
    "payment_method": "pix",
    "customer": {
      "name": "Cliente Teste",
      "email": "cliente@teste.com",
      "document": "12345678900",
      "phone": "+5511999999999"
    }
  }'
```

Resposta:
```json
{
  "success": true,
  "transaction_id": "mock_pix_integracao2_1234567890_xyz789",
  "status": "pending",
  "pix_qr_code": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...",
  "pix_code": "00020126580014br.gov.bcb.pix...",
  "expires_at": "2024-10-08T12:30:00.000Z",
  "_mock": true,
  "_integration": "integracao2"
}
```

### Verificar Status de Pagamento

```bash
curl http://localhost:3000/integracao2/payments/check/mock_pix_integracao2_1234567890_xyz789
```

Resposta (se pago):
```json
{
  "paid": true,
  "status": "authorized",
  "transaction_id": "mock_pix_integracao2_1234567890_xyz789",
  "_integration": "integracao2"
}
```

### Simular Mudança de Status

```bash
curl -X POST http://localhost:3000/integracao2/webhooks/simulate-status-change \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "mock_pix_integracao2_1234567890_xyz789",
    "status": "authorized"
  }'
```

## 🔍 Diferenças da Integração Original

| Característica | Original | Integracao2 |
|---------------|----------|-------------|
| Prefixo das rotas | `/` | `/integracao2/` |
| Modo mock | Desabilitado | **Habilitado** |
| Chamadas API Payco | Reais | **Mockadas** |
| Instalação | OAuth real | **Dados mockados** |
| IDs gerados | Reais | Prefixo `mock_*_integracao2_*` |
| Logs | Padrão | Prefixo `[*Integracao2]` |
| Campo `_integration` | Ausente | `"integracao2"` |
| Campo `_mock` | Ausente | `true` |

## 📝 Identificadores de Mock

Todas as respostas das rotas integracao2 incluem identificadores para facilitar debug:

```json
{
  "_integration": "integracao2",
  "_mock": true
}
```

Todos os IDs gerados incluem o prefixo `integracao2`:
- `mock_cc_integracao2_*` - Cartão de crédito
- `mock_dc_integracao2_*` - Cartão de débito
- `mock_pix_integracao2_*` - PIX
- `mock_boleto_integracao2_*` - Boleto
- `mock_provider_integracao2_*` - Payment Provider
- `mock_access_token_integracao2_*` - Access Token

## 🧪 Testes

Para testar a integracao2:

1. Inicie o servidor:
```bash
npm start
```

2. Acesse a rota de instalação mockada:
```bash
curl http://localhost:3000/integracao2/auth/install?code=test
```

3. Use o `user_id` retornado para fazer chamadas de pagamento

4. Verifique os logs do console - todos terão o prefixo `[*Integracao2]`

## ⚙️ Configuração

O modo mock está habilitado por padrão na integracao2. Para desabilitar, edite a constante nos arquivos de rotas:

```javascript
// No início de cada arquivo de rota integracao2
const USE_MOCKS = true; // Altere para false para usar API real
```

## 🔐 Segurança

- Validação de webhook signature continua ativa (quando configurada)
- Todos os endpoints mantêm as mesmas validações
- Dados sensíveis não são logados

## 📊 Monitoramento

Todos os logs da integracao2 incluem um prefixo identificador:
- `[Payment Integracao2]` - Rotas de pagamento
- `[Webhook Integracao2]` - Rotas de webhook
- `[PaymentProvider Integracao2]` - Rotas de payment provider
- `[MockPayco Integracao2]` - Mock da API Payco

Isso facilita filtrar logs específicos da integracao2.

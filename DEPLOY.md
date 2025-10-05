# Deploy no Render

## Configuração necessária

### 1. Variáveis de Ambiente

No painel do Render, configure as seguintes variáveis de ambiente:

```
NODE_ENV=production
PORT=3000
NUVEMSHOP_CLIENT_ID=seu_client_id
NUVEMSHOP_CLIENT_SECRET=seu_client_secret
APP_URL=https://seu-app.onrender.com
FRONTEND_URL=https://seu-frontend.onrender.com
PAYCO_API_URL=https://api.payco.com.br
```

### 2. Build Command

```
npm install
```

### 3. Start Command

```
npm start
```

### 4. Banco de Dados SQLite

O aplicativo usa SQLite, que cria automaticamente o arquivo `database.sqlite` na inicialização.

**IMPORTANTE**: No Render, o sistema de arquivos é efêmero. Isso significa que:
- O banco de dados será recriado toda vez que o serviço reiniciar
- Dados serão perdidos em cada deploy ou restart

**Soluções recomendadas para produção:**

1. **Usar Render Disk** (Recomendado para SQLite):
   - No painel do Render, vá em "Disks"
   - Crie um novo disk com pelo menos 1GB
   - Monte em `/var/data`
   - Atualize a variável de ambiente: `DB_PATH=/var/data/database.sqlite`

2. **Migrar para PostgreSQL** (Recomendado para produção):
   - Render oferece PostgreSQL grátis
   - Mais robusto e adequado para produção
   - Dados persistem entre deploys

### 5. Verificação do Deploy

Após o deploy, verifique:

```bash
curl https://seu-app.onrender.com/health
```

Deve retornar:
```json
{
  "status": "ok",
  "timestamp": "2025-10-04T15:45:00.000Z"
}
```

### 6. Logs

Para verificar se o banco de dados foi inicializado corretamente, verifique os logs:

```
💾 Inicializando banco de dados SQLite...
✓ Tabela stores criada/verificada
✓ Tabela transactions criada/verificada
✓ Índices criados/verificados
✓ Banco de dados inicializado com sucesso
🚀 Servidor rodando na porta 3000
```

## Solução de Problemas

### Erro: "no such table: main.transactions"

Este erro ocorria porque as tabelas não eram criadas antes do servidor iniciar. A solução implementada:

1. Criado módulo `src/db/init.js` que inicializa o banco de forma síncrona
2. Servidor só inicia após a inicialização completa do banco
3. Tabelas são criadas de forma serial e garantida

### Banco de dados vazio após restart

Se o banco está vazio após cada restart, você precisa usar um Render Disk (veja seção 4 acima).

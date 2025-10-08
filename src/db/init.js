// Inicialização do banco de dados SQLite
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Suporta caminho customizado via variável de ambiente (útil para Render Disk)
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database.sqlite');

// Garante que o diretório existe
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`✓ Diretório do banco de dados criado: ${dbDir}`);
}

console.log(`📁 Usando banco de dados em: ${dbPath}`);
const db = new sqlite3.Database(dbPath);

function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Criar tabela stores
      db.run(`
        CREATE TABLE IF NOT EXISTS stores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          storeId TEXT UNIQUE NOT NULL,
          accessToken TEXT NOT NULL,
          storeName TEXT,
          storeUrl TEXT,
          paymentProviderId TEXT,
          paycoApiKey TEXT,
          paycoClientId TEXT,
          enabled INTEGER DEFAULT 0,
          paymentMethods TEXT,
          installedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('❌ Erro ao criar tabela stores:', err);
          return reject(err);
        }
        console.log('✓ Tabela stores criada/verificada');
      });

      // Criar tabela transactions
      db.run(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          storeId TEXT NOT NULL,
          orderId TEXT NOT NULL,
          transactionId TEXT UNIQUE NOT NULL,
          nuvemshopTransactionId TEXT,
          amount REAL NOT NULL,
          currency TEXT DEFAULT 'BRL',
          paymentMethod TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          paycoResponse TEXT,
          customerData TEXT,
          cardData TEXT,
          installments INTEGER,
          events TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('❌ Erro ao criar tabela transactions:', err);
          return reject(err);
        }
        console.log('✓ Tabela transactions criada/verificada');
      });

      // Criar índices para transactions
      db.run(`CREATE INDEX IF NOT EXISTS idx_storeId ON transactions(storeId)`, (err) => {
        if (err) console.error('⚠️  Erro ao criar índice storeId:', err);
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_orderId ON transactions(orderId)`, (err) => {
        if (err) console.error('⚠️  Erro ao criar índice orderId:', err);
        else {
          console.log('✓ Índices criados/verificados');
          resolve();
        }
      });
    });
  });
}

module.exports = { initDatabase, db };

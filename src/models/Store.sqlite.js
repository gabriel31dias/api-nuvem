// Modelo Store usando SQLite
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Criar tabela se não existir
db.run(`
  CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storeId TEXT UNIQUE NOT NULL,
    accessToken TEXT NOT NULL,
    storeName TEXT,
    storeUrl TEXT,
    paymentProviderId TEXT,
    paycoApiKey TEXT,
    enabled INTEGER DEFAULT 0,
    paymentMethods TEXT,
    installedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

class Store {
  static async findOne(query) {
    return new Promise((resolve, reject) => {
      const { storeId } = query;
      db.get('SELECT * FROM stores WHERE storeId = ?', [storeId], (err, row) => {
        if (err) reject(err);
        if (row && row.paymentMethods) {
          row.paycoSettings = {
            enabled: row.enabled === 1,
            paymentMethods: JSON.parse(row.paymentMethods)
          };
        }
        resolve(row);
      });
    });
  }

  static async findOneAndUpdate(query, update, options = {}) {
    return new Promise((resolve, reject) => {
      const { storeId } = query;

      // Verifica se existe
      db.get('SELECT * FROM stores WHERE storeId = ?', [storeId], (err, row) => {
        if (err) return reject(err);

        if (row) {
          // Atualiza
          const paymentMethods = update['paycoSettings.paymentMethods']
            ? JSON.stringify(update['paycoSettings.paymentMethods'])
            : row.paymentMethods;

          db.run(
            `UPDATE stores SET
              accessToken = COALESCE(?, accessToken),
              storeName = COALESCE(?, storeName),
              paymentProviderId = COALESCE(?, paymentProviderId),
              enabled = COALESCE(?, enabled),
              paymentMethods = COALESCE(?, paymentMethods),
              updatedAt = CURRENT_TIMESTAMP
            WHERE storeId = ?`,
            [
              update.accessToken,
              update.storeName,
              update.paymentProviderId,
              update['paycoSettings.enabled'] !== undefined ? (update['paycoSettings.enabled'] ? 1 : 0) : null,
              paymentMethods,
              storeId
            ],
            function(err) {
              if (err) return reject(err);
              Store.findOne({ storeId }).then(resolve).catch(reject);
            }
          );
        } else if (options.upsert) {
          // Insere novo
          db.run(
            `INSERT INTO stores (storeId, accessToken, installedAt)
             VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [update.storeId || storeId, update.accessToken],
            function(err) {
              if (err) return reject(err);
              Store.findOne({ storeId }).then(resolve).catch(reject);
            }
          );
        } else {
          resolve(null);
        }
      });
    });
  }

  static async findOneAndDelete(query) {
    return new Promise((resolve, reject) => {
      const { storeId } = query;

      db.get('SELECT * FROM stores WHERE storeId = ?', [storeId], (err, row) => {
        if (err) return reject(err);

        db.run('DELETE FROM stores WHERE storeId = ?', [storeId], (err) => {
          if (err) return reject(err);
          resolve(row);
        });
      });
    });
  }

  static async create(data) {
    return new Promise((resolve, reject) => {
      const { store_id, access_token, scope, token_type } = data;

      db.run(
        `INSERT INTO stores (storeId, accessToken, storeName, installedAt)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [store_id.toString(), access_token, scope || null],
        function(err) {
          if (err) return reject(err);

          Store.findOne({ storeId: store_id.toString() })
            .then(store => {
              if (store) {
                store.save = async function() {
                  return Store.update(this);
                };
              }
              resolve(store);
            })
            .catch(reject);
        }
      );
    });
  }

  static async update(storeData) {
    return new Promise((resolve, reject) => {
      const { storeId, access_token, scope } = storeData;

      db.run(
        `UPDATE stores SET
          accessToken = ?,
          storeName = ?,
          updatedAt = CURRENT_TIMESTAMP
        WHERE storeId = ?`,
        [access_token, scope || null, storeId],
        function(err) {
          if (err) return reject(err);
          Store.findOne({ storeId }).then(resolve).catch(reject);
        }
      );
    });
  }
}

module.exports = Store;

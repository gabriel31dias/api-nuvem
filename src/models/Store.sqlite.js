// Modelo Store usando SQLite
const { db } = require('../db/init');

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

  static async findAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM stores ORDER BY installedAt ASC', [], (err, rows) => {
        if (err) return reject(err);
        if (!rows) return resolve([]);

        const stores = rows.map(row => {
          if (row && row.paymentMethods) {
            row.paycoSettings = {
              enabled: row.enabled === 1,
              paymentMethods: JSON.parse(row.paymentMethods)
            };
          }
          return row;
        });
        resolve(stores);
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
      const {
        storeId,
        access_token,
        scope,
        paycoApiKey,
        paycoClientId,
        enabled,
        paymentMethods,
        paymentProviderId
      } = storeData;

      // Build dynamic UPDATE query based on provided fields
      const updates = [];
      const values = [];

      if (access_token !== undefined) {
        updates.push('accessToken = ?');
        values.push(access_token);
      }
      if (scope !== undefined) {
        updates.push('storeName = ?');
        values.push(scope);
      }
      if (paycoApiKey !== undefined) {
        updates.push('paycoApiKey = ?');
        values.push(paycoApiKey);
      }
      if (paycoClientId !== undefined) {
        updates.push('paycoClientId = ?');
        values.push(paycoClientId);
      }
      if (enabled !== undefined) {
        updates.push('enabled = ?');
        values.push(enabled);
      }
      if (paymentMethods !== undefined) {
        updates.push('paymentMethods = ?');
        values.push(paymentMethods);
      }
      if (paymentProviderId !== undefined) {
        updates.push('paymentProviderId = ?');
        values.push(paymentProviderId);
      }

      if (updates.length === 0) {
        // No fields to update
        return Store.findOne({ storeId }).then(resolve).catch(reject);
      }

      updates.push('updatedAt = CURRENT_TIMESTAMP');
      values.push(storeId);

      const query = `UPDATE stores SET ${updates.join(', ')} WHERE storeId = ?`;

      db.run(query, values, function(err) {
        if (err) return reject(err);
        Store.findOne({ storeId }).then(resolve).catch(reject);
      });
    });
  }
}

module.exports = Store;

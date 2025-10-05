// Modelo Transaction usando SQLite
const { db } = require('../db/init');

class Transaction {
  constructor(data) {
    this.storeId = data.storeId;
    this.orderId = data.orderId;
    this.transactionId = data.transactionId;
    this.nuvemshopTransactionId = data.nuvemshopTransactionId;
    this.amount = data.amount;
    this.currency = data.currency || 'BRL';
    this.paymentMethod = data.paymentMethod;
    this.status = data.status || 'pending';
    this.paycoResponse = data.paycoResponse;
    this.customerData = data.customerData;
    this.cardData = data.cardData;
    this.installments = data.installments;
    this.events = data.events || [];
  }

  async save() {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO transactions (
          storeId, orderId, transactionId, amount, currency,
          paymentMethod, status, paycoResponse, customerData,
          cardData, installments, events
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.run(
        sql,
        [
          this.storeId,
          this.orderId,
          this.transactionId,
          this.amount,
          this.currency,
          this.paymentMethod,
          this.status,
          JSON.stringify(this.paycoResponse),
          JSON.stringify(this.customerData),
          JSON.stringify(this.cardData),
          this.installments,
          JSON.stringify(this.events)
        ],
        function(err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });
  }

  static async findOne(query) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM transactions WHERE ';
      let params = [];

      if (query.transactionId) {
        sql += 'transactionId = ?';
        params.push(query.transactionId);
      } else if (query.storeId && query.orderId) {
        sql += 'storeId = ? AND orderId = ?';
        params.push(query.storeId, query.orderId);
      }

      db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);

        // Parse JSON fields
        if (row.paycoResponse) row.paycoResponse = JSON.parse(row.paycoResponse);
        if (row.customerData) row.customerData = JSON.parse(row.customerData);
        if (row.cardData) row.cardData = JSON.parse(row.cardData);
        if (row.events) row.events = JSON.parse(row.events);

        resolve(row);
      });
    });
  }

  static async find(query) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM transactions WHERE 1=1';
      let params = [];

      if (query.storeId) {
        sql += ' AND storeId = ?';
        params.push(query.storeId);
      }

      if (query.orderId) {
        sql += ' AND orderId = ?';
        params.push(query.orderId);
      }

      if (query.status && query.status.$in) {
        const placeholders = query.status.$in.map(() => '?').join(',');
        sql += ` AND status IN (${placeholders})`;
        params.push(...query.status.$in);
      }

      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);

        // Parse JSON fields
        rows = rows.map(row => {
          if (row.paycoResponse) row.paycoResponse = JSON.parse(row.paycoResponse);
          if (row.customerData) row.customerData = JSON.parse(row.customerData);
          if (row.cardData) row.cardData = JSON.parse(row.cardData);
          if (row.events) row.events = JSON.parse(row.events);
          return row;
        });

        resolve(rows);
      });
    });
  }

  static async updateTransaction(transactionId, updates) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE transactions SET
          status = COALESCE(?, status),
          nuvemshopTransactionId = COALESCE(?, nuvemshopTransactionId),
          events = COALESCE(?, events),
          updatedAt = CURRENT_TIMESTAMP
        WHERE transactionId = ?`,
        [
          updates.status,
          updates.nuvemshopTransactionId,
          updates.events ? JSON.stringify(updates.events) : null,
          transactionId
        ],
        function(err) {
          if (err) return reject(err);
          Transaction.findOne({ transactionId }).then(resolve).catch(reject);
        }
      );
    });
  }
}

module.exports = Transaction;

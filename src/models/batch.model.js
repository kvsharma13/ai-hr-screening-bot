// src/models/batch.model.js
const pool = require('../config/database');

class BatchModel {
  
  // Create new batch
  static async create(batchId) {
    const query = `
      INSERT INTO batches (batch_id, total_resumes, successful, duplicates, failed)
      VALUES ($1, 0, 0, 0, 0)
      RETURNING *
    `;
    const result = await pool.query(query, [batchId]);
    return result.rows[0];
  }

  // Update batch statistics
  static async updateStats(batchId, stats) {
    const query = `
      UPDATE batches 
      SET 
        total_resumes = $2,
        successful = $3,
        duplicates = $4,
        failed = $5
      WHERE batch_id = $1
      RETURNING *
    `;
    const values = [
      batchId,
      stats.total || 0,
      stats.successful || 0,
      stats.duplicates || 0,
      stats.failed || 0
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Get batch by ID
  static async findById(batchId) {
    const query = 'SELECT * FROM batches WHERE batch_id = $1';
    const result = await pool.query(query, [batchId]);
    return result.rows[0] || null;
  }

  // Get all batches
  static async getAll() {
    const query = 'SELECT * FROM batches ORDER BY created_at DESC';
    const result = await pool.query(query);
    return result.rows;
  }

  // Get latest batch
  static async getLatest() {
    const query = 'SELECT * FROM batches ORDER BY created_at DESC LIMIT 1';
    const result = await pool.query(query);
    return result.rows[0] || null;
  }
}

module.exports = BatchModel;

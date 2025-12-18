// src/models/batch.model.js
const pool = require('../config/database');

class BatchModel {
  
  // Create new batch
  static async create(batchId) {
    const query = `
      INSERT INTO batches (batch_id, total_resumes, successful, duplicates, skill_mismatches, failed)
      VALUES ($1, 0, 0, 0, 0, 0)
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
        skill_mismatches = $5,
        failed = $6
      WHERE batch_id = $1
      RETURNING *
    `;
    const values = [
      batchId,
      stats.total || 0,
      stats.successful || 0,
      stats.duplicates || 0,
      stats.skill_mismatches || 0,
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

  // Get all batches with summary
  static async getAll() {
    const query = `
      SELECT 
        b.*,
        COUNT(c.id) as candidate_count,
        COUNT(CASE WHEN c.status = 'New' THEN 1 END) as pending_calls,
        COUNT(CASE WHEN c.overall_qualification_score >= 45 THEN 1 END) as qualified_count
      FROM batches b
      LEFT JOIN candidates c ON b.batch_id = c.batch_id
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  // Get latest batch
  static async getLatest() {
    const query = 'SELECT * FROM batches ORDER BY created_at DESC LIMIT 1';
    const result = await pool.query(query);
    return result.rows[0] || null;
  }

  // Get batch statistics with breakdown
  static async getBatchStats(batchId) {
    const query = `
      SELECT 
        b.batch_id,
        b.total_resumes,
        b.successful,
        b.duplicates,
        b.skill_mismatches,
        b.failed,
        b.created_at,
        COUNT(c.id) as total_candidates,
        COUNT(CASE WHEN c.status = 'New' THEN 1 END) as pending,
        COUNT(CASE WHEN c.call_status LIKE '%Calling%' THEN 1 END) as calling,
        COUNT(CASE WHEN c.overall_qualification_score IS NOT NULL THEN 1 END) as screened,
        COUNT(CASE WHEN c.overall_qualification_score >= 45 THEN 1 END) as qualified,
        COUNT(CASE WHEN c.overall_qualification_score < 45 AND c.overall_qualification_score IS NOT NULL THEN 1 END) as rejected,
        COUNT(CASE WHEN c.assessment_link_sent = true THEN 1 END) as assessment_sent,
        AVG(c.overall_qualification_score) as avg_score
      FROM batches b
      LEFT JOIN candidates c ON b.batch_id = c.batch_id
      WHERE b.batch_id = $1
      GROUP BY b.id, b.batch_id, b.total_resumes, b.successful, b.duplicates, b.skill_mismatches, b.failed, b.created_at
    `;
    const result = await pool.query(query, [batchId]);
    return result.rows[0] || null;
  }

  // Delete batch (and cascade delete candidates)
  static async delete(batchId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete candidates in this batch (will cascade to call_logs)
      await client.query('DELETE FROM candidates WHERE batch_id = $1', [batchId]);
      
      // Delete batch
      const result = await client.query(
        'DELETE FROM batches WHERE batch_id = $1 RETURNING *',
        [batchId]
      );
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = BatchModel;
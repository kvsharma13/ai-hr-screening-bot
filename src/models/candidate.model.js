// src/models/candidate.model.js
const pool = require('../config/database');

class CandidateModel {
  
  // Check if candidate exists by phone (for deduplication)
  static async findByPhone(phone) {
    const query = 'SELECT * FROM candidates WHERE phone = $1';
    const result = await pool.query(query, [phone]);
    return result.rows[0] || null;
  }

  // Create new candidate
  static async create(candidateData) {
    const query = `
      INSERT INTO candidates (
        name, phone, email, skills, years_of_experience, 
        current_company, notice_period, batch_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const values = [
      candidateData.name,
      candidateData.phone,
      candidateData.email,
      candidateData.skills,
      candidateData.years_of_experience,
      candidateData.current_company,
      candidateData.notice_period,
      candidateData.batch_id,
      'New'
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Get all candidates with optional filters
  static async getAll(filters = {}) {
    let query = 'SELECT * FROM candidates';
    const conditions = [];
    const values = [];
    let paramCount = 1;

    if (filters.batch_id) {
      conditions.push(`batch_id = $${paramCount}`);
      values.push(filters.batch_id);
      paramCount++;
    }

    if (filters.status) {
      conditions.push(`status = $${paramCount}`);
      values.push(filters.status);
      paramCount++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, values);
    return result.rows;
  }

  // Get latest batch ID
  static async getLatestBatchId() {
    const query = `
      SELECT batch_id FROM candidates 
      WHERE batch_id IS NOT NULL 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const result = await pool.query(query);
    return result.rows[0]?.batch_id || null;
  }

  // Get candidates by batch
  static async getByBatch(batchId) {
    const query = 'SELECT * FROM candidates WHERE batch_id = $1 ORDER BY created_at DESC';
    const result = await pool.query(query, [batchId]);
    return result.rows;
  }

  // Find by ID
  static async findById(id) {
    const query = 'SELECT * FROM candidates WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  // Find by run_id (screening or scheduling)
  static async findByRunId(runId) {
    const query = `
      SELECT * FROM candidates 
      WHERE screening_run_id = $1 OR scheduling_run_id = $1
    `;
    const result = await pool.query(query, [runId]);
    return result.rows[0] || null;
  }

  // Update candidate
  static async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Build dynamic update query
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);
    const query = `
      UPDATE candidates 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Get pending candidates (for calling)
  static async getPending() {
    const query = `
      SELECT * FROM candidates 
      WHERE status = 'New' 
      AND phone IS NOT NULL 
      AND phone != 'Not available'
      ORDER BY created_at ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  // Get candidates needing follow-up
  static async getNeedingFollowUp() {
    const query = `
      SELECT * FROM candidates 
      WHERE status = 'Follow-Up Scheduled'
      AND follow_up_time <= NOW()
      AND failed_attempts < $1
      ORDER BY follow_up_time ASC
    `;
    const maxAttempts = parseInt(process.env.MAX_CALL_ATTEMPTS || 2);
    const result = await pool.query(query, [maxAttempts]);
    return result.rows;
  }

  // Get statistics
  static async getStats(batchId = null) {
    const query = batchId 
      ? 'SELECT status, COUNT(*) as count FROM candidates WHERE batch_id = $1 GROUP BY status'
      : 'SELECT status, COUNT(*) as count FROM candidates GROUP BY status';
    
    const values = batchId ? [batchId] : [];
    const result = await pool.query(query, values);
    
    const stats = {
      total: 0,
      new: 0,
      calling: 0,
      completed: 0,
      qualified: 0,
      rejected: 0,
      scheduled: 0,
      failed: 0
    };

    result.rows.forEach(row => {
      stats.total += parseInt(row.count);
      const status = row.status.toLowerCase();
      
      if (status === 'new') stats.new += parseInt(row.count);
      else if (status.includes('calling')) stats.calling += parseInt(row.count);
      else if (status.includes('completed')) stats.completed += parseInt(row.count);
      else if (status.includes('qualified')) stats.qualified += parseInt(row.count);
      else if (status.includes('rejected')) stats.rejected += parseInt(row.count);
      else if (status.includes('scheduled')) stats.scheduled += parseInt(row.count);
      else if (status.includes('failed') || status.includes('no response')) {
        stats.failed += parseInt(row.count);
      }
    });

    return stats;
  }

  // Delete candidate (for testing)
  static async delete(id) {
    const query = 'DELETE FROM candidates WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = CandidateModel;

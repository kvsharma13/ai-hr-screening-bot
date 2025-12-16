// src/models/callLog.model.js
const pool = require('../config/database');

class CallLogModel {
  
  // Create call log entry
  static async create(logData) {
    const query = `
      INSERT INTO call_logs (
        candidate_id, call_type, run_id, status, transcript, duration_seconds
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [
      logData.candidate_id,
      logData.call_type,
      logData.run_id,
      logData.status,
      logData.transcript || null,
      logData.duration_seconds || null
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Get logs for candidate
  static async getByCandidateId(candidateId) {
    const query = `
      SELECT * FROM call_logs 
      WHERE candidate_id = $1 
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [candidateId]);
    return result.rows;
  }

  // Get log by run_id
  static async findByRunId(runId) {
    const query = 'SELECT * FROM call_logs WHERE run_id = $1';
    const result = await pool.query(query, [runId]);
    return result.rows[0] || null;
  }

  // Update call log
  static async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

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
      UPDATE call_logs 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Get all logs
  static async getAll(limit = 100) {
    const query = `
      SELECT cl.*, c.name as candidate_name, c.phone 
      FROM call_logs cl
      JOIN candidates c ON cl.candidate_id = c.id
      ORDER BY cl.created_at DESC
      LIMIT $1
    `;
    const result = await pool.query(query, [limit]);
    return result.rows;
  }
}

module.exports = CallLogModel;

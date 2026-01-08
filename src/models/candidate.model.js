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
        current_company, notice_period, batch_id, status,
        target_company, target_job_role
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
      'New',
      candidateData.target_company || null,
      candidateData.target_job_role || null
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

  // Get pending candidates (for calling) - only if 2+ skills match
  static async getPending() {
    const query = `
      SELECT c.*, b.required_skills
      FROM candidates c
      LEFT JOIN batches b ON c.batch_id = b.batch_id
      WHERE c.status = 'New' 
      AND c.phone IS NOT NULL 
      AND c.phone != 'Not available'
      AND (c.callback_requested = FALSE OR c.callback_requested IS NULL)
      ORDER BY c.created_at ASC
    `;
    const result = await pool.query(query);
    
    // Filter candidates with at least 2 matching skills
    const filteredCandidates = result.rows.filter(candidate => {
      if (!candidate.required_skills || !candidate.skills) {
        return true; // If no requirements, include candidate
      }
      
      const requiredSkills = candidate.required_skills
        .toLowerCase()
        .split(',')
        .map(s => s.trim());
      
      const candidateSkills = candidate.skills
        .toLowerCase()
        .split(',')
        .map(s => s.trim());
      
      const matchCount = requiredSkills.filter(reqSkill => 
        candidateSkills.some(candSkill => 
          candSkill.includes(reqSkill) || reqSkill.includes(candSkill)
        )
      ).length;
      
      return matchCount >= 2; // At least 2 skills must match
    });
    
    return filteredCandidates;
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

  // Get pending callbacks
  static async getPendingCallbacks() {
    const query = `
      SELECT * FROM candidates 
      WHERE callback_requested = TRUE
      AND callback_scheduled_time IS NOT NULL
      AND callback_scheduled_time <= NOW()
      AND callback_attempts < $1
      AND status NOT IN ('Rejected - Low Score', 'No Response - Max Attempts')
      ORDER BY callback_scheduled_time ASC
    `;
    const maxCallbackAttempts = parseInt(process.env.MAX_CALLBACK_ATTEMPTS || 3);
    const result = await pool.query(query, [maxCallbackAttempts]);
    return result.rows;
  }

  // Update callback status
  static async updateCallbackStatus(id, callbackData) {
    const updates = {
      callback_requested: callbackData.callback_requested,
      callback_scheduled_time: callbackData.callback_scheduled_time,
      callback_reason: callbackData.callback_reason,
      callback_attempts: callbackData.callback_attempts || 0,
      last_callback_attempt: callbackData.last_callback_attempt || new Date(),
      status: callbackData.status || 'Callback Scheduled'
    };

    return await this.update(id, updates);
  }

  // Increment callback attempts
  static async incrementCallbackAttempts(id) {
    const query = `
      UPDATE candidates 
      SET 
        callback_attempts = callback_attempts + 1,
        last_callback_attempt = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Clear callback request
  static async clearCallbackRequest(id) {
    const query = `
      UPDATE candidates 
      SET 
        callback_requested = FALSE,
        callback_scheduled_time = NULL
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
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
      failed: 0,
      callback_scheduled: 0,
      callback_pending: 0
    };

    result.rows.forEach(row => {
      stats.total += parseInt(row.count);
      const status = row.status.toLowerCase();
      
      if (status === 'new') stats.new += parseInt(row.count);
      else if (status.includes('calling')) stats.calling += parseInt(row.count);
      else if (status.includes('completed')) stats.completed += parseInt(row.count);
      else if (status.includes('qualified')) stats.qualified += parseInt(row.count);
      else if (status.includes('rejected')) stats.rejected += parseInt(row.count);
      else if (status.includes('scheduled') && !status.includes('callback')) {
        stats.scheduled += parseInt(row.count);
      }
      else if (status.includes('callback')) stats.callback_scheduled += parseInt(row.count);
      else if (status.includes('failed') || status.includes('no response')) {
        stats.failed += parseInt(row.count);
      }
    });

    // Get pending callbacks count
    if (batchId) {
      const callbackQuery = `
        SELECT COUNT(*) as count 
        FROM candidates 
        WHERE batch_id = $1 
        AND callback_requested = TRUE 
        AND callback_scheduled_time IS NOT NULL
        AND callback_scheduled_time > NOW()
      `;
      const callbackResult = await pool.query(callbackQuery, [batchId]);
      stats.callback_pending = parseInt(callbackResult.rows[0]?.count || 0);
    } else {
      const callbackQuery = `
        SELECT COUNT(*) as count 
        FROM candidates 
        WHERE callback_requested = TRUE 
        AND callback_scheduled_time IS NOT NULL
        AND callback_scheduled_time > NOW()
      `;
      const callbackResult = await pool.query(callbackQuery);
      stats.callback_pending = parseInt(callbackResult.rows[0]?.count || 0);
    }

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
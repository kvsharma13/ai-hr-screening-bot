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
        name, phone, email, skills, skills_matched, years_of_experience, 
        current_company, notice_period, batch_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const values = [
      candidateData.name,
      candidateData.phone,
      candidateData.email,
      candidateData.skills,
      candidateData.skills_matched || null,
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

    if (filters.min_score !== undefined) {
      conditions.push(`overall_qualification_score >= $${paramCount}`);
      values.push(filters.min_score);
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

  // Update candidate with scoring breakdown
  static async updateWithScores(id, scoreData) {
    const query = `
      UPDATE candidates
      SET
        notice_period_score = $2,
        budget_score = $3,
        location_score = $4,
        experience_score = $5,
        technical_score = $6,
        communication_score = $7,
        overall_qualification_score = $8,
        qualification_breakdown = $9,
        screening_transcript = $10,
        conversation_summary = $11,
        status = $12,
        call_status = $13,
        tech_score = $14,
        job_interest = $15,
        confidence_score = $16
      WHERE id = $1
      RETURNING *
    `;

    const values = [
      id,
      scoreData.notice_period_score || 0,
      scoreData.budget_score || 0,
      scoreData.location_score || 0,
      scoreData.experience_score || 0,
      scoreData.technical_score || 0,
      scoreData.communication_score || 0,
      scoreData.overall_qualification_score || 0,
      JSON.stringify(scoreData.qualification_breakdown || {}),
      scoreData.screening_transcript || null,
      scoreData.conversation_summary || null,
      scoreData.status || 'Completed',
      scoreData.call_status || 'Completed',
      scoreData.tech_score || null,
      scoreData.job_interest || null,
      scoreData.confidence_score || null
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Get pending candidates (for calling) - only those with matched skills
  static async getPending() {
    const query = `
      SELECT * FROM candidates 
      WHERE status = 'New' 
      AND phone IS NOT NULL 
      AND phone != 'Not available'
      AND (skills_matched IS NOT NULL OR skills_matched != '')
      ORDER BY created_at ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  // Get qualified candidates (overall score >= threshold)
  static async getQualified(threshold = 45) {
    const query = `
      SELECT * FROM candidates 
      WHERE overall_qualification_score >= $1
      ORDER BY overall_qualification_score DESC, created_at DESC
    `;
    const result = await pool.query(query, [threshold]);
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
      failed: 0,
      skill_mismatch: 0
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
      else if (status.includes('skill') && status.includes('mismatch')) {
        stats.skill_mismatch += parseInt(row.count);
      }
      else if (status.includes('failed') || status.includes('no response')) {
        stats.failed += parseInt(row.count);
      }
    });

    return stats;
  }

  // Get score distribution
  static async getScoreDistribution(batchId = null) {
    const query = batchId
      ? `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN overall_qualification_score >= 70 THEN 1 END) as high_scorers,
          COUNT(CASE WHEN overall_qualification_score >= 45 AND overall_qualification_score < 70 THEN 1 END) as medium_scorers,
          COUNT(CASE WHEN overall_qualification_score < 45 AND overall_qualification_score IS NOT NULL THEN 1 END) as low_scorers,
          AVG(overall_qualification_score) as avg_score,
          MAX(overall_qualification_score) as max_score,
          MIN(overall_qualification_score) as min_score
        FROM candidates
        WHERE batch_id = $1
      `
      : `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN overall_qualification_score >= 70 THEN 1 END) as high_scorers,
          COUNT(CASE WHEN overall_qualification_score >= 45 AND overall_qualification_score < 70 THEN 1 END) as medium_scorers,
          COUNT(CASE WHEN overall_qualification_score < 45 AND overall_qualification_score IS NOT NULL THEN 1 END) as low_scorers,
          AVG(overall_qualification_score) as avg_score,
          MAX(overall_qualification_score) as max_score,
          MIN(overall_qualification_score) as min_score
        FROM candidates
      `;

    const values = batchId ? [batchId] : [];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Delete candidate (for testing)
  static async delete(id) {
    const query = 'DELETE FROM candidates WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = CandidateModel;
// src/models/batch.model.js
const pool = require('../config/database');

class BatchModel {
  
  // Create new batch with job requirements
  static async create(batchId, jobRequirements = {}) {
    const query = `
      INSERT INTO batches (
        batch_id, 
        company, 
        job_role,
        required_notice_period,
        budget_min_lpa,
        budget_max_lpa,
        location,
        min_experience,
        max_experience,
        required_skills,
        total_resumes, 
        successful, 
        duplicates, 
        failed
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 0, 0, 0)
      RETURNING *
    `;
    
    const values = [
      batchId,
      jobRequirements.company || null,
      jobRequirements.job_role || null,
      jobRequirements.required_notice_period || null,
      jobRequirements.budget_min_lpa || null,
      jobRequirements.budget_max_lpa || null,
      jobRequirements.location || null,
      jobRequirements.min_experience || null,
      jobRequirements.max_experience || null,
      jobRequirements.required_skills || null
    ];
    
    const result = await pool.query(query, values);
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
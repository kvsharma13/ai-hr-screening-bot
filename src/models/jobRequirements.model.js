// src/models/jobRequirements.model.js
const pool = require('../config/database');

class JobRequirementsModel {
  
  /**
   * Get current job requirements (latest entry)
   */
  static async getCurrent() {
    const query = `
      SELECT * FROM job_requirements 
      ORDER BY updated_at DESC 
      LIMIT 1
    `;
    const result = await pool.query(query);
    return result.rows[0] || null;
  }

  /**
   * Create or update job requirements
   * (We only keep one active set of requirements)
   */
  static async upsert(requirementsData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Delete all existing requirements (we only keep the latest)
      await client.query('DELETE FROM job_requirements');

      // Insert new requirements
      const query = `
        INSERT INTO job_requirements (
          notice_period,
          budget,
          location,
          min_experience,
          relocation_required,
          required_skills
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [
        requirementsData.notice_period || null,
        requirementsData.budget || null,
        requirementsData.location || null,
        requirementsData.min_experience || null,
        requirementsData.relocation_required || false,
        JSON.stringify(requirementsData.required_skills || [])
      ];

      const result = await client.query(query, values);
      
      await client.query('COMMIT');
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if candidate skills match required skills
   * Returns matched skills and whether minimum threshold is met
   */
  static async checkSkillMatch(candidateSkills, minMatches = 2) {
    try {
      const requirements = await this.getCurrent();
      
      if (!requirements || !requirements.required_skills) {
        // No requirements set - accept all candidates
        return {
          isMatch: true,
          matchedSkills: [],
          requiredSkills: [],
          matchCount: 0
        };
      }

      const requiredSkills = Array.isArray(requirements.required_skills) 
        ? requirements.required_skills 
        : [];

      if (requiredSkills.length === 0) {
        return {
          isMatch: true,
          matchedSkills: [],
          requiredSkills: [],
          matchCount: 0
        };
      }

      // Normalize skills for comparison (lowercase, trim)
      const normalizedRequired = requiredSkills.map(s => s.toLowerCase().trim());
      const candidateSkillsList = candidateSkills
        .split(',')
        .map(s => s.toLowerCase().trim())
        .filter(s => s.length > 0);

      // Find matches
      const matchedSkills = [];
      for (const candidateSkill of candidateSkillsList) {
        for (const requiredSkill of normalizedRequired) {
          if (candidateSkill.includes(requiredSkill) || requiredSkill.includes(candidateSkill)) {
            // Find the original case version
            const originalRequired = requiredSkills.find(
              s => s.toLowerCase().trim() === requiredSkill
            );
            if (originalRequired && !matchedSkills.includes(originalRequired)) {
              matchedSkills.push(originalRequired);
            }
          }
        }
      }

      return {
        isMatch: matchedSkills.length >= minMatches,
        matchedSkills,
        requiredSkills,
        matchCount: matchedSkills.length
      };

    } catch (error) {
      console.error('Error checking skill match:', error);
      // On error, accept the candidate (fail open)
      return {
        isMatch: true,
        matchedSkills: [],
        requiredSkills: [],
        matchCount: 0
      };
    }
  }

  /**
   * Get all historical job requirements
   */
  static async getAll() {
    const query = 'SELECT * FROM job_requirements ORDER BY created_at DESC';
    const result = await pool.query(query);
    return result.rows;
  }

  /**
   * Delete all job requirements (reset)
   */
  static async deleteAll() {
    const query = 'DELETE FROM job_requirements';
    await pool.query(query);
    return { success: true };
  }
}

module.exports = JobRequirementsModel;
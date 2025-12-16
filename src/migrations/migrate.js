// src/migrations/migrate.js
const pool = require('../config/database');

const schema = `
-- Drop existing tables if they exist
DROP TABLE IF EXISTS call_logs CASCADE;
DROP TABLE IF EXISTS candidates CASCADE;
DROP TABLE IF EXISTS batches CASCADE;
DROP TABLE IF EXISTS job_requirements CASCADE;

-- Job Requirements table (stores screening criteria)
CREATE TABLE job_requirements (
    id SERIAL PRIMARY KEY,
    notice_period INTEGER,
    budget INTEGER,
    location VARCHAR(255),
    min_experience INTEGER,
    relocation_required BOOLEAN DEFAULT FALSE,
    required_skills JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Batches table (track resume upload batches)
CREATE TABLE batches (
    id SERIAL PRIMARY KEY,
    batch_id VARCHAR(50) UNIQUE NOT NULL,
    total_resumes INTEGER DEFAULT 0,
    successful INTEGER DEFAULT 0,
    duplicates INTEGER DEFAULT 0,
    skill_mismatches INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Candidates table (main table replacing Excel)
CREATE TABLE candidates (
    id SERIAL PRIMARY KEY,
    
    -- Basic Info (from resume parsing)
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255),
    verified_email VARCHAR(255),
    skills TEXT,
    skills_matched TEXT,
    years_of_experience VARCHAR(50),
    current_company VARCHAR(255),
    notice_period VARCHAR(100),
    
    -- Call Status
    call_status VARCHAR(100) DEFAULT 'Pending',
    status VARCHAR(100) DEFAULT 'New',
    failed_attempts INTEGER DEFAULT 0,
    follow_up_time TIMESTAMP,
    
    -- Screening Call Data (OpenAI analysis)
    screening_run_id VARCHAR(255),
    screening_transcript TEXT,
    
    -- Individual Criterion Scores (0-20 points each for mandatory, 0-40 for technical)
    notice_period_score INTEGER DEFAULT 0,
    budget_score INTEGER DEFAULT 0,
    location_score INTEGER DEFAULT 0,
    experience_score INTEGER DEFAULT 0,
    technical_score INTEGER DEFAULT 0,
    communication_score INTEGER DEFAULT 0,
    
    -- Overall Score (0-100%)
    overall_qualification_score NUMERIC(5,2),
    
    -- Detailed breakdown stored as JSON
    qualification_breakdown JSONB,
    
    -- Legacy fields (for backward compatibility)
    tech_score NUMERIC(5,2),
    job_interest VARCHAR(50),
    confidence_score INTEGER,
    conversation_summary TEXT,
    
    -- Scheduling Call Data
    scheduling_run_id VARCHAR(255),
    scheduling_transcript TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    assessment_date DATE,
    assessment_time TIME,
    assessment_link_sent BOOLEAN DEFAULT FALSE,
    assessment_link VARCHAR(500),
    
    -- Metadata
    batch_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Call Logs table (track all call attempts)
CREATE TABLE call_logs (
    id SERIAL PRIMARY KEY,
    candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
    call_type VARCHAR(50) NOT NULL,
    run_id VARCHAR(255),
    status VARCHAR(100),
    transcript TEXT,
    duration_seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_candidates_phone ON candidates(phone);
CREATE INDEX idx_candidates_status ON candidates(status);
CREATE INDEX idx_candidates_batch ON candidates(batch_id);
CREATE INDEX idx_candidates_created ON candidates(created_at);
CREATE INDEX idx_candidates_overall_score ON candidates(overall_qualification_score);
CREATE INDEX idx_candidates_skills_matched ON candidates(skills_matched);
CREATE INDEX idx_call_logs_candidate ON call_logs(candidate_id);
CREATE INDEX idx_call_logs_type ON call_logs(call_type);
CREATE INDEX idx_job_requirements_updated ON job_requirements(updated_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to candidates table
CREATE TRIGGER update_candidates_updated_at 
    BEFORE UPDATE ON candidates 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to job_requirements table
CREATE TRIGGER update_job_requirements_updated_at 
    BEFORE UPDATE ON job_requirements 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default job requirements (optional - can be updated via UI)
INSERT INTO job_requirements (
    notice_period, 
    budget, 
    location, 
    min_experience, 
    relocation_required, 
    required_skills
) VALUES (
    30,
    15,
    'Bangalore',
    3,
    false,
    '["Python", "JavaScript", "SQL"]'::jsonb
);

`;

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('Starting database migration...\n');
    
    await client.query(schema);
    
    console.log('✓ Database schema created successfully');
    console.log('✓ Tables created:');
    console.log('  - job_requirements (new)');
    console.log('  - batches');
    console.log('  - candidates (with new scoring columns)');
    console.log('  - call_logs');
    console.log('✓ Indexes created for optimal performance');
    console.log('✓ Triggers configured');
    console.log('✓ Default job requirements inserted\n');
    
    // Display the default job requirements
    const result = await client.query('SELECT * FROM job_requirements LIMIT 1');
    if (result.rows.length > 0) {
      console.log('📋 Default Job Requirements:');
      const req = result.rows[0];
      console.log(`  - Notice Period: ≤ ${req.notice_period} days`);
      console.log(`  - Budget: ≤ ${req.budget} LPA`);
      console.log(`  - Location: ${req.location}`);
      console.log(`  - Min Experience: ${req.min_experience} years`);
      console.log(`  - Relocation Required: ${req.relocation_required ? 'Yes' : 'No'}`);
      
      // Fix: required_skills is already parsed by PostgreSQL as JSONB
      const skills = Array.isArray(req.required_skills) ? req.required_skills : [];
      console.log(`  - Required Skills: ${skills.join(', ')}`);
      console.log('\n  💡 You can update these via the UI\n');
    }
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Run migration
migrate();
// src/migrations/add_call_queue_table.js
const pool = require('../config/database');

const createCallQueueTable = `
-- Call Queue table for intelligent rate-limited calling
CREATE TABLE IF NOT EXISTS call_queue (
    id SERIAL PRIMARY KEY,
    candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
    priority INTEGER DEFAULT 0,
    scheduled_time TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    last_attempt_time TIMESTAMP,
    added_to_queue_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    called_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_queue_status ON call_queue(status);
CREATE INDEX IF NOT EXISTS idx_call_queue_scheduled_time ON call_queue(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_call_queue_candidate ON call_queue(candidate_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_call_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_call_queue_updated_at_trigger ON call_queue;
CREATE TRIGGER update_call_queue_updated_at_trigger
    BEFORE UPDATE ON call_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_call_queue_updated_at();

-- Add comments
COMMENT ON TABLE call_queue IS 'Queue for intelligent rate-limited calling (6 calls/hour, random intervals)';
COMMENT ON COLUMN call_queue.priority IS 'Higher number = higher priority (0 = normal)';
COMMENT ON COLUMN call_queue.scheduled_time IS 'When this call should be made';
COMMENT ON COLUMN call_queue.status IS 'pending, processing, completed, failed';
COMMENT ON COLUMN call_queue.attempts IS 'Number of call attempts made';
`;

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('Creating call queue table...\n');
    
    await client.query(createCallQueueTable);
    
    console.log('✓ Call queue table created successfully');
    console.log('✓ Indexes created for performance');
    console.log('✓ Triggers configured');
    console.log('\nQueue Features:');
    console.log('  - Rate limiting: 6 calls per hour');
    console.log('  - Random intervals: 3-10 minutes between calls');
    console.log('  - Automatic scheduling');
    console.log('  - Priority support');
    console.log('  - Persistent across server restarts');
    console.log('\nMigration completed successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Run migration
migrate();
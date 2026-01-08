// src/services/callQueue.service.js
const pool = require('../config/database');
const BolnaService = require('./bolna.service');
const PromptService = require('./prompt.service');
const CandidateModel = require('../models/candidate.model');
const BatchModel = require('../models/batch.model');

class CallQueueService {
  
  /**
   * Configuration from environment variables
   */
  static getConfig() {
    return {
      maxCallsPerHour: parseInt(process.env.MAX_CALLS_PER_HOUR || 6),
      minDelayMinutes: parseInt(process.env.MIN_DELAY_MINUTES || 3),
      maxDelayMinutes: parseInt(process.env.MAX_DELAY_MINUTES || 10),
      callingStartHour: parseInt(process.env.CALLING_START_HOUR || 9),
      callingEndHour: parseInt(process.env.CALLING_END_HOUR || 18)
    };
  }

  /**
   * Add candidates to call queue
   */
  static async addToQueue(candidateIds, priority = 0) {
    try {
      const config = this.getConfig();
      const now = new Date();
      
      // Calculate initial scheduled time for first candidate
      let scheduledTime = this.getNextAvailableSlot(now);
      
      const insertedCount = [];
      
      for (const candidateId of candidateIds) {
        // Check if already in queue
        const existingQuery = `
          SELECT id FROM call_queue 
          WHERE candidate_id = $1 AND status = 'pending'
        `;
        const existing = await pool.query(existingQuery, [candidateId]);
        
        if (existing.rows.length > 0) {
          console.log(`Candidate ${candidateId} already in queue, skipping`);
          continue;
        }
        
        // Add to queue
        const insertQuery = `
          INSERT INTO call_queue (candidate_id, priority, scheduled_time, status)
          VALUES ($1, $2, $3, 'pending')
          RETURNING id
        `;
        
        await pool.query(insertQuery, [candidateId, priority, scheduledTime]);
        insertedCount.push(candidateId);
        
        // Calculate next scheduled time with random interval
        scheduledTime = this.calculateNextCallTime(scheduledTime);
      }
      
      console.log(`✓ Added ${insertedCount.length} candidates to call queue`);
      
      return {
        success: true,
        added: insertedCount.length,
        skipped: candidateIds.length - insertedCount.length
      };
      
    } catch (error) {
      console.error('Error adding to queue:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate next call time with random interval
   */
  static calculateNextCallTime(fromTime) {
    const config = this.getConfig();
    const minMs = config.minDelayMinutes * 60 * 1000;
    const maxMs = config.maxDelayMinutes * 60 * 1000;
    
    // Random delay between min and max
    const randomDelay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    
    const nextTime = new Date(fromTime.getTime() + randomDelay);
    
    // If next time is outside working hours, move to next day
    if (nextTime.getHours() >= config.callingEndHour) {
      nextTime.setDate(nextTime.getDate() + 1);
      nextTime.setHours(config.callingStartHour, 0, 0, 0);
    }
    
    return nextTime;
  }

  /**
   * Get next available slot considering rate limits
   */
  static getNextAvailableSlot(fromTime) {
    const config = this.getConfig();
    const now = new Date(fromTime);
    
    // If outside working hours, schedule for next working day start
    if (now.getHours() < config.callingStartHour) {
      now.setHours(config.callingStartHour, 0, 0, 0);
      return now;
    }
    
    if (now.getHours() >= config.callingEndHour) {
      now.setDate(now.getDate() + 1);
      now.setHours(config.callingStartHour, 0, 0, 0);
      return now;
    }
    
    // Otherwise, schedule a few minutes from now
    return new Date(now.getTime() + config.minDelayMinutes * 60 * 1000);
  }

  /**
   * Check if we can make a call now (respects 6 calls/hour limit)
   */
  static async canMakeCallNow() {
    const config = this.getConfig();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Check working hours
    if (now.getHours() < config.callingStartHour || now.getHours() >= config.callingEndHour) {
      return {
        canCall: false,
        reason: 'Outside working hours',
        nextSlot: this.getNextAvailableSlot(now)
      };
    }
    
    // Count calls made in last hour
    const query = `
      SELECT COUNT(*) as count
      FROM call_queue
      WHERE status = 'completed'
      AND called_at >= $1
    `;
    
    const result = await pool.query(query, [oneHourAgo]);
    const callsInLastHour = parseInt(result.rows[0].count);
    
    if (callsInLastHour >= config.maxCallsPerHour) {
      return {
        canCall: false,
        reason: `Rate limit reached (${callsInLastHour}/${config.maxCallsPerHour} calls in last hour)`,
        nextSlot: new Date(now.getTime() + 10 * 60 * 1000) // Check again in 10 minutes
      };
    }
    
    return {
      canCall: true,
      callsInLastHour,
      remainingSlots: config.maxCallsPerHour - callsInLastHour
    };
  }

  /**
   * Get next candidate to call from queue
   */
  static async getNextCandidate() {
    try {
      const now = new Date();
      
      const query = `
        SELECT cq.*, c.name, c.phone, c.skills, c.target_company, c.target_job_role, c.batch_id
        FROM call_queue cq
        JOIN candidates c ON cq.candidate_id = c.id
        WHERE cq.status = 'pending'
        AND cq.scheduled_time <= $1
        AND c.phone IS NOT NULL
        AND c.phone != 'Not available'
        ORDER BY cq.priority DESC, cq.scheduled_time ASC
        LIMIT 1
      `;
      
      const result = await pool.query(query, [now]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
      
    } catch (error) {
      console.error('Error getting next candidate:', error);
      return null;
    }
  }

  /**
   * Process queue - check if we should make a call
   */
  static async processQueue() {
    try {
      // Check if we can make a call
      const canCall = await this.canMakeCallNow();
      
      if (!canCall.canCall) {
        // Silently return - we log detailed info only when we process calls
        return {
          success: true,
          called: false,
          reason: canCall.reason
        };
      }
      
      // Get next candidate
      const queueItem = await this.getNextCandidate();
      
      if (!queueItem) {
        // No candidates ready to call right now
        return {
          success: true,
          called: false,
          reason: 'No candidates in queue ready to call'
        };
      }
      
      console.log(`\n========== Processing Call from Queue ==========`);
      console.log(`Candidate: ${queueItem.name}`);
      console.log(`Phone: ${queueItem.phone}`);
      console.log(`Scheduled: ${new Date(queueItem.scheduled_time).toLocaleString()}`);
      console.log(`Calls in last hour: ${canCall.callsInLastHour}/${this.getConfig().maxCallsPerHour}`);
      
      // Mark as processing
      await pool.query(
        `UPDATE call_queue SET status = 'processing', last_attempt_time = $1 WHERE id = $2`,
        [new Date(), queueItem.id]
      );
      
      // Get job requirements
      const batch = await BatchModel.findById(queueItem.batch_id);
      const jobRequirements = batch ? {
        required_notice_period: batch.required_notice_period,
        budget_min_lpa: batch.budget_min_lpa,
        budget_max_lpa: batch.budget_max_lpa,
        location: batch.location,
        min_experience: batch.min_experience,
        max_experience: batch.max_experience,
        required_skills: batch.required_skills
      } : {};
      
      // Generate prompt
      const prompt = PromptService.getScreeningPrompt(
        queueItem.name,
        queueItem.skills,
        queueItem.target_company,
        queueItem.target_job_role,
        jobRequirements
      );
      
      // Make the call
      const callResult = await BolnaService.makeCall(queueItem.phone, prompt);
      
      if (callResult.success && callResult.run_id) {
        // Update candidate
        await CandidateModel.update(queueItem.candidate_id, {
          call_status: 'Calling - Screening',
          status: 'Calling - Screening',
          screening_run_id: callResult.run_id
        });
        
        // Update queue - mark as completed
        await pool.query(
          `UPDATE call_queue 
           SET status = 'completed', 
               called_at = $1,
               attempts = attempts + 1
           WHERE id = $2`,
          [new Date(), queueItem.id]
        );
        
        console.log(`✓ Call initiated successfully`);
        console.log(`✓ Run ID: ${callResult.run_id}`);
        console.log(`✓ Remaining slots this hour: ${canCall.remainingSlots - 1}`);
        console.log(`================================================\n`);
        
        return {
          success: true,
          called: true,
          candidateName: queueItem.name,
          runId: callResult.run_id,
          remainingSlots: canCall.remainingSlots - 1
        };
        
      } else {
        // Call failed - mark as failed and reschedule
        const newAttempts = queueItem.attempts + 1;
        const maxAttempts = 3;
        
        if (newAttempts >= maxAttempts) {
          // Max attempts - mark as failed permanently
          await pool.query(
            `UPDATE call_queue 
             SET status = 'failed', 
                 attempts = $1,
                 error_message = $2
             WHERE id = $3`,
            [newAttempts, callResult.error || 'Max attempts reached', queueItem.id]
          );
          
          await CandidateModel.update(queueItem.candidate_id, {
            status: 'No Response - Max Attempts',
            call_status: 'Failed - No Response'
          });
          
          console.log(`✗ Call failed after ${newAttempts} attempts`);
          console.log(`✗ Error: ${callResult.error}`);
          console.log(`================================================\n`);
          
        } else {
          // Reschedule for later
          const nextTime = this.calculateNextCallTime(new Date());
          
          await pool.query(
            `UPDATE call_queue 
             SET status = 'pending',
                 scheduled_time = $1,
                 attempts = $2,
                 error_message = $3
             WHERE id = $4`,
            [nextTime, newAttempts, callResult.error || 'Call failed', queueItem.id]
          );
          
          console.log(`⚠ Call failed - rescheduled for ${nextTime.toLocaleString()}`);
          console.log(`================================================\n`);
        }
        
        return {
          success: false,
          called: false,
          error: callResult.error,
          rescheduled: newAttempts < maxAttempts
        };
      }
      
    } catch (error) {
      console.error('Error processing queue:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get queue statistics
   */
  static async getQueueStats() {
    try {
      const query = `
        SELECT 
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'processing') as processing,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          MIN(scheduled_time) FILTER (WHERE status = 'pending') as next_call_time
        FROM call_queue
      `;
      
      const result = await pool.query(query);
      const stats = result.rows[0];
      
      // Get calls in last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const lastHourQuery = `
        SELECT COUNT(*) as count
        FROM call_queue
        WHERE status = 'completed'
        AND called_at >= $1
      `;
      const lastHourResult = await pool.query(lastHourQuery, [oneHourAgo]);
      stats.calls_last_hour = parseInt(lastHourResult.rows[0].count);
      
      const config = this.getConfig();
      stats.max_calls_per_hour = config.maxCallsPerHour;
      stats.remaining_slots = config.maxCallsPerHour - stats.calls_last_hour;
      
      return stats;
      
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return null;
    }
  }

  /**
   * Clear completed/failed items older than 7 days
   */
  static async cleanupOldEntries() {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const query = `
        DELETE FROM call_queue
        WHERE (status = 'completed' OR status = 'failed')
        AND updated_at < $1
      `;
      
      const result = await pool.query(query, [sevenDaysAgo]);
      
      if (result.rowCount > 0) {
        console.log(`✓ Cleaned up ${result.rowCount} old queue entries`);
      }
      
      return result.rowCount;
      
    } catch (error) {
      console.error('Error cleaning up queue:', error);
      return 0;
    }
  }
}

module.exports = CallQueueService;
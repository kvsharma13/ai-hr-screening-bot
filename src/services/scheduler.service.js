// src/services/scheduler.service.js
const CandidateModel = require('../models/candidate.model');
const BolnaService = require('./bolna.service');
const PromptService = require('./prompt.service');
const { v4: uuidv4 } = require('uuid');

class SchedulerService {
  
  /**
   * Schedule assessment scheduling call after 2 minutes
   */
  static scheduleAssessmentCall(candidateId, totalScore, noticePeriod) {
    const delayMs = parseInt(process.env.AUTO_SCHEDULE_DELAY_MS || 120000); // 2 minutes
    
    console.log(`â° Scheduling assessment call for candidate ${candidateId} in ${delayMs/1000} seconds...`);
    
    setTimeout(async () => {
      try {
        const candidate = await CandidateModel.findById(candidateId);
        
        if (!candidate) {
          console.log('âŒ Candidate not found for scheduling call');
          return;
        }

        if (!candidate.phone || candidate.phone === 'Not available') {
          console.log('âŒ No valid phone number for scheduling call');
          return;
        }

        console.log(`ðŸ“ž Initiating assessment scheduling call for ${candidate.name} (ID: ${candidateId})`);

        // Generate scheduling prompt with company/role
        const prompt = PromptService.getSchedulingPrompt(
          candidate.name,
          candidate.email,
          totalScore,
          candidate.target_company,
          candidate.target_job_role
        );

        // Make the call
        const callResult = await BolnaService.makeCall(candidate.phone, prompt);

        if (callResult.success && callResult.run_id) {
          await CandidateModel.update(candidateId, {
            status: 'Calling - Assessment Scheduling',
            call_status: 'Calling - Scheduling',
            scheduling_run_id: callResult.run_id
          });

          console.log(`âœ“ Assessment scheduling call initiated successfully`);
          console.log(`âœ“ Run ID: ${callResult.run_id}`);

        } else {
          console.error('âŒ Assessment scheduling call failed');
          await CandidateModel.update(candidateId, {
            status: 'Scheduling Call Failed - Manual Intervention Required',
            call_status: 'Scheduling Call Failed'
          });
        }

      } catch (error) {
        console.error('âŒ Error during scheduled assessment call:', error.message);
      }
    }, delayMs);
  }

  /**
   * Process scheduled callbacks (called by cron job every minute)
   * Only processes callbacks where the scheduled time has passed
   */
  static async processScheduledCallbacks() {
    try {
      const candidates = await CandidateModel.getPendingCallbacks();
      
      if (candidates.length === 0) {
        // Don't log if no callbacks to keep console clean
        return {
          success: true,
          message: 'No pending callbacks',
          processed: 0
        };
      }

      // Filter candidates whose callback time has arrived or passed
      const now = new Date();
      const dueCallbacks = candidates.filter(candidate => {
        const scheduledTime = new Date(candidate.callback_scheduled_time);
        return scheduledTime <= now;
      });

      if (dueCallbacks.length === 0) {
        console.log(`⏰ ${candidates.length} callbacks scheduled, but none are due yet`);
        return {
          success: true,
          message: 'No callbacks due yet',
          processed: 0
        };
      }

      console.log(`\n========== Processing ${dueCallbacks.length} Due Callbacks ==========\n`);

      let successCount = 0;
      let failedCount = 0;

      for (const candidate of dueCallbacks) {
        try {
          console.log(`📞 Processing callback for ${candidate.name} (Scheduled: ${new Date(candidate.callback_scheduled_time).toLocaleString()})`);
          
          // Generate callback prompt
          const prompt = PromptService.getCallbackPrompt(
            candidate.name,
            candidate.target_company,
            candidate.target_job_role
          );

          // Make the call
          const callResult = await BolnaService.makeCall(candidate.phone, prompt);

          if (callResult.success && callResult.run_id) {
            // Update candidate - clear callback and set as screening call
            await CandidateModel.update(candidate.id, {
              status: 'Calling - Callback Screening',
              call_status: 'Calling - Screening',
              screening_run_id: callResult.run_id,
              callback_requested: false,
              callback_scheduled_time: null
            });

            console.log(`✓ Callback initiated for ${candidate.name}`);
            successCount++;

          } else {
            // Callback failed - increment attempts
            const newAttempts = (candidate.callback_attempts || 0) + 1;
            const maxAttempts = parseInt(process.env.MAX_CALLBACK_ATTEMPTS || 3);

            await CandidateModel.incrementCallbackAttempts(candidate.id);

            if (newAttempts >= maxAttempts) {
              // Max attempts reached
              await CandidateModel.update(candidate.id, {
                status: 'No Response - Max Callback Attempts',
                call_status: 'Failed - No Response',
                callback_requested: false
              });
              console.log(`✗ Max callback attempts reached for ${candidate.name}`);
            } else {
              // Reschedule for 2 hours later
              const nextCallbackTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
              await CandidateModel.update(candidate.id, {
                callback_scheduled_time: nextCallbackTime,
                status: 'Callback Rescheduled'
              });
              console.log(`⏰ Callback rescheduled for ${candidate.name} at ${nextCallbackTime.toLocaleString()}`);
            }

            failedCount++;
          }

          // Wait 3 seconds between calls
          await new Promise(resolve => setTimeout(resolve, 3000));

        } catch (error) {
          console.error(`✗ Error processing callback for ${candidate.name}:`, error.message);
          failedCount++;
        }
      }

      console.log(`\n========== Callbacks Processed ==========`);
      console.log(`✓ Successful: ${successCount}`);
      console.log(`✗ Failed: ${failedCount}`);
      console.log(`==========================================\n`);

      return {
        success: true,
        processed: dueCallbacks.length,
        successful: successCount,
        failed: failedCount
      };

    } catch (error) {
      console.error('✗ Error processing scheduled callbacks:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process pending callbacks
   */
  static async processCallbacks() {
    try {
      const candidates = await CandidateModel.getPendingCallbacks();
      
      if (candidates.length === 0) {
        console.log('No pending callbacks at this time');
        return {
          success: true,
          message: 'No pending callbacks',
          processed: 0
        };
      }

      console.log(`\n========== Processing ${candidates.length} Callbacks ==========\n`);

      let successCount = 0;
      let failedCount = 0;

      for (const candidate of candidates) {
        try {
          console.log(`ðŸ“ž Processing callback for ${candidate.name} (ID: ${candidate.id})`);
          
          // Generate callback prompt
          const prompt = PromptService.getCallbackPrompt(
            candidate.name,
            candidate.target_company,
            candidate.target_job_role
          );

          // Make the call
          const callResult = await BolnaService.makeCall(candidate.phone, prompt);

          if (callResult.success && callResult.run_id) {
            // Update candidate - clear callback and set as screening call
            await CandidateModel.update(candidate.id, {
              status: 'Calling - Callback Screening',
              call_status: 'Calling - Screening',
              screening_run_id: callResult.run_id,
              callback_requested: false,
              callback_scheduled_time: null
            });

            console.log(`âœ“ Callback initiated for ${candidate.name}`);
            successCount++;

          } else {
            // Callback failed - increment attempts
            const newAttempts = (candidate.callback_attempts || 0) + 1;
            const maxAttempts = parseInt(process.env.MAX_CALLBACK_ATTEMPTS || 3);

            await CandidateModel.incrementCallbackAttempts(candidate.id);

            if (newAttempts >= maxAttempts) {
              // Max attempts reached
              await CandidateModel.update(candidate.id, {
                status: 'No Response - Max Callback Attempts',
                call_status: 'Failed - No Response',
                callback_requested: false
              });
              console.log(`âŒ Max callback attempts reached for ${candidate.name}`);
            } else {
              // Reschedule for 2 hours later
              const nextCallbackTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
              await CandidateModel.update(candidate.id, {
                callback_scheduled_time: nextCallbackTime,
                status: 'Callback Rescheduled'
              });
              console.log(`â° Callback rescheduled for ${candidate.name} at ${nextCallbackTime}`);
            }

            failedCount++;
          }

          // Wait 3 seconds between calls
          await new Promise(resolve => setTimeout(resolve, 3000));

        } catch (error) {
          console.error(`âŒ Error processing callback for ${candidate.name}:`, error.message);
          failedCount++;
        }
      }

      console.log(`\n========== Callbacks Processed ==========`);
      console.log(`âœ“ Successful: ${successCount}`);
      console.log(`âŒ Failed: ${failedCount}`);
      console.log(`==========================================\n`);

      return {
        success: true,
        processed: candidates.length,
        successful: successCount,
        failed: failedCount
      };

    } catch (error) {
      console.error('âŒ Error processing callbacks:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate unique assessment link (for manual sending)
   */
  static generateAssessmentLink(candidateId) {
    const baseUrl = process.env.ASSESSMENT_BASE_URL || 'https://assessment.mindmapdigital.com';
    const token = uuidv4();
    return `${baseUrl}?candidate=${candidateId}&token=${token}`;
  }

  /**
   * Calculate follow-up time for failed calls
   */
  static calculateFollowUpTime() {
    const now = new Date();
    const followUp = new Date();
    followUp.setDate(now.getDate() + 1);
    
    const currentHour = now.getHours();
    
    if (currentHour < 14) {
      followUp.setHours(16, 0, 0, 0);
    } else {
      followUp.setHours(10, 0, 0, 0);
    }
    
    return followUp;
  }

  /**
   * Process follow-up calls (can be called via cron job)
   */
  static async processFollowUpCalls() {
    try {
      const candidates = await CandidateModel.getNeedingFollowUp();
      
      console.log(`Found ${candidates.length} candidates needing follow-up calls`);

      for (const candidate of candidates) {
        console.log(`Processing follow-up for ${candidate.name}...`);
        
        const prompt = PromptService.getScreeningPrompt(
          candidate.name,
          candidate.skills,
          candidate.target_company,
          candidate.target_job_role
        );

        const callResult = await BolnaService.makeCall(candidate.phone, prompt);

        if (callResult.success && callResult.run_id) {
          await CandidateModel.update(candidate.id, {
            status: 'Calling - Follow-Up',
            call_status: 'Calling - Screening',
            screening_run_id: callResult.run_id
          });
          console.log(`âœ“ Follow-up call initiated for ${candidate.name}`);
        } else {
          const newAttempts = candidate.failed_attempts + 1;
          const maxAttempts = parseInt(process.env.MAX_CALL_ATTEMPTS || 2);

          if (newAttempts >= maxAttempts) {
            await CandidateModel.update(candidate.id, {
              status: 'No Response - Max Attempts Reached',
              call_status: 'Failed - No Response',
              failed_attempts: newAttempts
            });
            console.log(`âŒ Max attempts reached for ${candidate.name}`);
          } else {
            const nextFollowUp = this.calculateFollowUpTime();
            await CandidateModel.update(candidate.id, {
              failed_attempts: newAttempts,
              follow_up_time: nextFollowUp,
              status: 'Follow-Up Scheduled'
            });
            console.log(`â° Next follow-up scheduled for ${candidate.name}`);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
      }

    } catch (error) {
      console.error('âŒ Error processing follow-up calls:', error.message);
    }
  }
}

module.exports = SchedulerService;
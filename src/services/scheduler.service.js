// src/services/scheduler.service.js
const CandidateModel = require('../models/candidate.model');
const BolnaService = require('../services/bolna.service');
const PromptService = require('../services/prompt.service');
const EmailService = require('../services/email.service');
const { v4: uuidv4 } = require('uuid');

class SchedulerService {
  
  /**
   * Schedule assessment scheduling call after 2 minutes
   * Now uses overall_qualification_score instead of tech_score
   */
  static scheduleAssessmentCall(candidateId, overallScore, noticePeriod) {
    const delayMs = parseInt(process.env.AUTO_SCHEDULE_DELAY_MS || 120000); // 2 minutes
    
    console.log(`⏰ Scheduling assessment call for candidate ${candidateId} in ${delayMs/1000} seconds...`);
    console.log(`   Overall Qualification Score: ${overallScore}%`);
    
    setTimeout(async () => {
      try {
        // Fetch latest candidate data
        const candidate = await CandidateModel.findById(candidateId);
        
        if (!candidate) {
          console.log('❌ Candidate not found for scheduling call');
          return;
        }

        if (!candidate.phone || candidate.phone === 'Not available') {
          console.log('❌ No valid phone number for scheduling call');
          return;
        }

        console.log(`\n========== ASSESSMENT SCHEDULING ==========`);
        console.log(`📞 Initiating assessment scheduling call for ${candidate.name} (ID: ${candidateId})`);
        console.log(`   Qualification Score: ${overallScore}%`);
        console.log(`   Notice Period: ${noticePeriod}`);
        console.log(`==========================================\n`);

        // Generate scheduling prompt with email verification
        const prompt = PromptService.getSchedulingPrompt(
          candidate.name,
          candidate.email,
          overallScore,
          noticePeriod
        );

        // Make the call
        const callResult = await BolnaService.makeCall(candidate.phone, prompt);

        if (callResult.success && callResult.run_id) {
          // Update candidate status
          await CandidateModel.update(candidateId, {
            status: 'Calling - Assessment Scheduling',
            call_status: 'Calling - Scheduling',
            scheduling_run_id: callResult.run_id
          });

          console.log(`✓ Assessment scheduling call initiated successfully`);
          console.log(`✓ Run ID: ${callResult.run_id}`);
          console.log(`✅ Webhook will deliver transcript automatically`);

        } else {
          console.error('❌ Assessment scheduling call failed');
          await CandidateModel.update(candidateId, {
            status: 'Scheduling Call Failed - Manual Intervention Required',
            call_status: 'Scheduling Call Failed'
          });
        }

      } catch (error) {
        console.error('❌ Error during scheduled assessment call:', error.message);
      }
    }, delayMs);
  }

  /**
   * Send assessment link via email
   */
  static async sendAssessmentLink(candidateId, assessmentDate, assessmentTime) {
    try {
      const candidate = await CandidateModel.findById(candidateId);
      
      if (!candidate) {
        throw new Error('Candidate not found');
      }

      // Use verified email if available, otherwise use original
      const emailToSend = candidate.verified_email || candidate.email;

      if (!emailToSend || emailToSend === 'Not available') {
        console.log('❌ No valid email address to send assessment link');
        return { success: false, error: 'No valid email' };
      }

      // Generate unique assessment link
      const assessmentLink = this.generateAssessmentLink(candidate.id);

      console.log(`📧 Sending assessment link to: ${emailToSend}`);
      console.log(`   Date: ${assessmentDate}`);
      console.log(`   Time: ${assessmentTime}`);

      // Send email
      const emailResult = await EmailService.sendAssessmentLink({
        name: candidate.name,
        email: emailToSend,
        assessment_date: assessmentDate,
        assessment_time: assessmentTime,
        assessment_link: assessmentLink
      });

      if (emailResult.success) {
        // Update candidate record
        await CandidateModel.update(candidateId, {
          assessment_link: assessmentLink,
          assessment_link_sent: true,
          status: 'Assessment Link Sent'
        });

        console.log(`✓ Assessment link sent successfully to ${emailToSend}`);
        return { success: true, link: assessmentLink };
      } else {
        console.error('❌ Failed to send assessment link:', emailResult.error);
        return { success: false, error: emailResult.error };
      }

    } catch (error) {
      console.error('❌ Error sending assessment link:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate unique assessment link
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
    followUp.setDate(now.getDate() + 1); // Next day
    
    const currentHour = now.getHours();
    
    // If current time is before 2 PM, schedule for 4 PM same/next day
    // Otherwise schedule for 10 AM next day
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
      
      console.log(`\n========== FOLLOW-UP CALLS ==========`);
      console.log(`Found ${candidates.length} candidates needing follow-up calls`);
      console.log(`=====================================\n`);

      for (const candidate of candidates) {
        console.log(`Processing follow-up for ${candidate.name}...`);
        console.log(`  Skills matched: ${candidate.skills_matched}`);
        console.log(`  Attempt: ${candidate.failed_attempts + 1}`);
        
        const prompt = await PromptService.getScreeningPrompt(
          candidate.name,
          candidate.skills,
          candidate.years_of_experience,
          candidate.notice_period
        );

        const callResult = await BolnaService.makeCall(candidate.phone, prompt);

        if (callResult.success && callResult.run_id) {
          await CandidateModel.update(candidate.id, {
            status: 'Calling - Follow-Up',
            call_status: 'Calling - Screening',
            screening_run_id: callResult.run_id
          });
          console.log(`  ✓ Follow-up call initiated for ${candidate.name}\n`);
        } else {
          // Increment failed attempts
          const newAttempts = candidate.failed_attempts + 1;
          const maxAttempts = parseInt(process.env.MAX_CALL_ATTEMPTS || 2);

          if (newAttempts >= maxAttempts) {
            await CandidateModel.update(candidate.id, {
              status: 'No Response - Max Attempts Reached',
              call_status: 'Failed - No Response',
              failed_attempts: newAttempts
            });
            console.log(`  ❌ Max attempts reached for ${candidate.name}\n`);
          } else {
            const nextFollowUp = this.calculateFollowUpTime();
            await CandidateModel.update(candidate.id, {
              failed_attempts: newAttempts,
              follow_up_time: nextFollowUp,
              status: 'Follow-Up Scheduled'
            });
            console.log(`  ⏰ Next follow-up scheduled for ${candidate.name} at ${nextFollowUp.toISOString()}\n`);
          }
        }

        // Wait 3 seconds between calls
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      console.log(`========== FOLLOW-UP COMPLETE ==========\n`);

    } catch (error) {
      console.error('❌ Error processing follow-up calls:', error.message);
    }
  }
}

module.exports = SchedulerService;
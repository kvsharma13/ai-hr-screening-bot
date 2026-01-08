// src/controllers/webhook.controller.js
const CandidateModel = require('../models/candidate.model');
const BatchModel = require('../models/batch.model');
const CallLogModel = require('../models/callLog.model');
const TranscriptService = require('../services/transcript.service');
const SchedulerService = require('../services/scheduler.service');

let lastWebhookPayload = null;

class WebhookController {

  /**
   * Handle Bolna webhook for call completion
   */
  static async handleBolnaWebhook(req, res) {
    try {
      console.log('\n========== BOLNA WEBHOOK RECEIVED ==========');
      console.log(JSON.stringify(req.body, null, 2));
      console.log('=============================================\n');

      lastWebhookPayload = {
        timestamp: new Date().toISOString(),
        data: req.body
      };

      const body = req.body || {};
      const data = body.data || body.execution || body.call || body.payload || body;

      // Only process final webhook
      const status = data.status || body.status;
      if (status !== "completed") {
        console.log(`⏭️ Ignoring event with status: ${status}`);
        return res.status(200).json({
          success: true,
          ignored: true,
          reason: "Not final webhook"
        });
      }

      console.log("🔥 FINAL webhook received (status = completed). Processing...");

      // Extract run_id
      const runId = data.run_id || data.execution_id || data.id || data.call_id || body.run_id;

      if (!runId) {
        console.error("❌ No run_id found in webhook payload");
        return res.status(400).json({ error: "Missing run_id in webhook" });
      }

      console.log("Webhook run_id:", runId);

      // Find candidate by run_id
      const candidate = await CandidateModel.findByRunId(runId);

      if (!candidate) {
        console.error("❌ No candidate matched for run_id:", runId);
        return res.json({
          success: true,
          message: "No matching candidate for this run_id"
        });
      }

      console.log(`✓ Matched candidate: ${candidate.name} (ID: ${candidate.id})`);

      // Extract transcript
      const analytics = data.analytics || {};
      let transcript = data.transcript || data.conversation || data.messages || 
                      analytics.transcript || analytics.conversation || 
                      analytics.messages || body.transcript || "";

      const transcriptText = TranscriptService.normalizeTranscript(transcript);
      console.log(`Transcript length: ${transcriptText.length} characters`);

      // Determine call type
      const isScreeningCall = runId === candidate.screening_run_id;
      const isSchedulingCall = runId === candidate.scheduling_run_id;

      if (isScreeningCall) {
        console.log("📞 Processing SCREENING CALL webhook...");
        await WebhookController.processScreeningWebhook(candidate, transcriptText, data);
      } else if (isSchedulingCall) {
        console.log("📅 Processing SCHEDULING CALL webhook...");
        await WebhookController.processSchedulingWebhook(candidate, transcriptText, data);
      } else {
        console.log("⚠️ Unknown call type - defaulting to screening logic");
        await WebhookController.processScreeningWebhook(candidate, transcriptText, data);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("❌ Webhook processing error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Process screening webhook with complete scoring
   */
  static async processScreeningWebhook(candidate, transcript, webhookData) {
    try {
      console.log("🤖 Analyzing screening transcript with OpenAI...");
      
      // Get job requirements from batch
      const batch = await BatchModel.findById(candidate.batch_id);
      const jobRequirements = batch ? {
        required_notice_period: batch.required_notice_period,
        budget_min_lpa: batch.budget_min_lpa,
        budget_max_lpa: batch.budget_max_lpa,
        location: batch.location,
        min_experience: batch.min_experience,
        max_experience: batch.max_experience,
        required_skills: batch.required_skills
      } : {};

      const analysis = await TranscriptService.analyzeScreeningTranscript(
        transcript,
        candidate.skills,
        jobRequirements
      );

      console.log("Analysis results:", {
        callback_requested: analysis.callback_requested,
        total_score: analysis.total_score,
        notice_period_score: analysis.notice_period_score,
        budget_score: analysis.budget_score,
        location_score: analysis.location_score,
        experience_score: analysis.experience_score,
        technical_score: analysis.technical_score,
        confidence_fluency_score: analysis.confidence_fluency_score
      });

      // Check if callback was requested
      if (analysis.callback_requested) {
        console.log("📞 CALLBACK REQUESTED - Scheduling callback...");
        
        const callbackTime = TranscriptService.parseCallbackTime(analysis.callback_time);
        
        await CandidateModel.updateCallbackStatus(candidate.id, {
          callback_requested: true,
          callback_scheduled_time: callbackTime,
          callback_reason: analysis.callback_reason || 'Candidate was busy',
          callback_attempts: 0,
          status: 'Callback Scheduled'
        });

        await CallLogModel.create({
          candidate_id: candidate.id,
          call_type: 'screening_callback_request',
          run_id: candidate.screening_run_id,
          status: 'Callback Requested',
          transcript: transcript
        });

        console.log(`✓ Callback scheduled for: ${callbackTime}`);
        console.log("✓ Screening webhook processed (callback route)\n");
        return;
      }

      // Normal screening flow - update with all scores
      const updates = {
        call_status: webhookData.smart_status || webhookData.status || "Completed",
        screening_transcript: transcript,
        conversation_summary: analysis.conversation_summary,
        
        // Candidate's responses
        candidate_notice_period: analysis.candidate_notice_period,
        candidate_budget_lpa: analysis.candidate_budget_lpa,
        candidate_location: analysis.candidate_location,
        
        // Individual scores
        notice_period_score: analysis.notice_period_score,
        budget_score: analysis.budget_score,
        location_score: analysis.location_score,
        experience_score: analysis.experience_score,
        technical_score: analysis.technical_score,
        confidence_fluency_score: analysis.confidence_fluency_score,
        total_score: analysis.total_score,
        
        job_interest: analysis.job_interest
      };

      // Apply 45% threshold
      const threshold = parseFloat(process.env.TECH_SCORE_THRESHOLD || 45);

      if (analysis.total_score !== null && analysis.total_score > 0) {
        if (analysis.total_score >= threshold) {
          updates.status = "Qualified - Assessment Scheduling Queued";
          console.log(`✅ Candidate QUALIFIED (score: ${analysis.total_score}% >= ${threshold}%)`);

          // Schedule assessment call
          SchedulerService.scheduleAssessmentCall(
            candidate.id,
            analysis.total_score,
            analysis.candidate_notice_period || candidate.notice_period
          );
        } else {
          updates.status = "Rejected - Low Score (Below 45%)";
          console.log(`❌ Candidate REJECTED (score: ${analysis.total_score}% < ${threshold}%)`);
        }
      } else {
        updates.status = "Manual Review Required - No Score";
        console.log("⚠️ No score calculated, needs manual review");
      }

      await CandidateModel.update(candidate.id, updates);

      await CallLogModel.create({
        candidate_id: candidate.id,
        call_type: "screening",
        run_id: candidate.screening_run_id,
        status: updates.call_status,
        transcript: transcript
      });

      console.log("✓ Screening call webhook processed successfully\n");
    } catch (error) {
      console.error("❌ Error processing screening webhook:", error.message);
      throw error;
    }
  }

  /**
   * Process scheduling webhook (NO AUTO EMAIL)
   */
  static async processSchedulingWebhook(candidate, transcript, webhookData) {
    try {
      console.log("🤖 Analyzing scheduling transcript with OpenAI...");
      const analysis = await TranscriptService.analyzeSchedulingTranscript(transcript);

      console.log("Scheduling analysis:", {
        email_verified: analysis.email_verified,
        verified_email: analysis.verified_email,
        assessment_date: analysis.assessment_date,
        assessment_time: analysis.assessment_time,
        candidate_confirmed: analysis.candidate_confirmed
      });

      const updates = {
        call_status: webhookData.smart_status || webhookData.status || "Completed",
        scheduling_transcript: transcript,
        email_verified: analysis.email_verified
      };

      if (analysis.verified_email) {
        updates.verified_email = analysis.verified_email;
        console.log(`✓ Email updated to: ${analysis.verified_email}`);
      }

      if (analysis.assessment_date) {
        updates.assessment_date = analysis.assessment_date;
        console.log(`✓ Assessment date: ${analysis.assessment_date}`);
      }

      if (analysis.assessment_time) {
        updates.assessment_time = analysis.assessment_time;
        console.log(`✓ Assessment time: ${analysis.assessment_time}`);
      }

      // NO AUTO EMAIL - Manual sending by team
      if (analysis.candidate_confirmed && analysis.assessment_date && analysis.assessment_time) {
        updates.status = "Assessment Scheduled - Awaiting Manual Link";
        console.log("📋 Assessment scheduled - Team will send link manually");
      } else {
        updates.status = "Scheduling Call Completed - Pending Confirmation";
      }

      await CandidateModel.update(candidate.id, updates);

      await CallLogModel.create({
        candidate_id: candidate.id,
        call_type: "scheduling",
        run_id: candidate.scheduling_run_id,
        status: updates.call_status,
        transcript: transcript
      });

      console.log("✓ Scheduling call webhook processed successfully\n");
    } catch (error) {
      console.error("❌ Error processing scheduling webhook:", error.message);
      throw error;
    }
  }

  static getLastWebhook(req, res) {
    if (!lastWebhookPayload) {
      return res.json({
        success: false,
        message: "No webhook received yet."
      });
    }

    res.json({
      success: true,
      timestamp: lastWebhookPayload.timestamp,
      payload: lastWebhookPayload.data
    });
  }
}

module.exports = WebhookController;
// src/controllers/webhook.controller.js
const CandidateModel = require('../models/candidate.model');
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

      // ------------------------------------------------------------------
      // ✅ PROCESS **ONLY FINAL WEBHOOK** – IGNORE ALL INTERMEDIATE EVENTS
      // ------------------------------------------------------------------
      const status = data.status || body.status;

      if (status !== "completed") {
        console.log(`⏭️ Ignoring event with status: ${status}`);
        return res.status(200).json({
          success: true,
          ignored: true,
          reason: "Not final webhook"
        });
      }

      console.log("🔥 FINAL webhook received (status = completed). Processing…");
      // ------------------------------------------------------------------

      // Extract run_id
      const runId =
        data.run_id ||
        data.execution_id ||
        data.id ||
        data.call_id ||
        body.run_id;

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
      let transcript =
        data.transcript ||
        data.conversation ||
        data.messages ||
        analytics.transcript ||
        analytics.conversation ||
        analytics.messages ||
        body.transcript ||
        "";

      const transcriptText = TranscriptService.normalizeTranscript(transcript);
      console.log(`Transcript length: ${transcriptText.length} characters`);

      // Determine call type
      const isScreeningCall = runId === candidate.screening_run_id;
      const isSchedulingCall = runId === candidate.scheduling_run_id;

      if (isScreeningCall) {
        console.log("📞 Processing SCREENING CALL webhook...");
        await WebhookController.processScreeningWebhook(
          candidate,
          transcriptText,
          data
        );
      } else if (isSchedulingCall) {
        console.log("📅 Processing SCHEDULING CALL webhook...");
        await WebhookController.processSchedulingWebhook(
          candidate,
          transcriptText,
          data
        );
      } else {
        console.log("⚠️ Unknown call type – defaulting to screening logic");
        await WebhookController.processScreeningWebhook(
          candidate,
          transcriptText,
          data
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error("❌ Webhook processing error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Process screening webhook with multi-criteria scoring
   */
  static async processScreeningWebhook(candidate, transcript, webhookData) {
    try {
      console.log("🤖 Analyzing screening transcript with OpenAI (Multi-Criteria Scoring)...");
      
      // Analyze with job requirements
      const analysis = await TranscriptService.analyzeScreeningTranscript(
        transcript,
        candidate.skills,
        candidate.years_of_experience,
        candidate.notice_period
      );

      console.log("\n========== SCORING BREAKDOWN ==========");
      console.log(`Notice Period Score: ${analysis.notice_period_score}/20`);
      console.log(`  → ${analysis.qualification_breakdown?.notice_period?.mentioned || 'Not mentioned'}`);
      console.log(`Budget Score: ${analysis.budget_score}/20`);
      console.log(`  → ${analysis.qualification_breakdown?.budget?.expectation || 'Not mentioned'}`);
      console.log(`Location Score: ${analysis.location_score}/20`);
      console.log(`  → ${analysis.qualification_breakdown?.location?.preference || 'Not mentioned'}`);
      console.log(`Experience Score: ${analysis.experience_score}/20`);
      console.log(`  → ${analysis.qualification_breakdown?.experience?.mentioned || 'Not mentioned'}`);
      console.log(`Technical Score: ${analysis.technical_score}/40`);
      console.log(`Communication Score: ${analysis.communication_score}/20 (Confidence: ${analysis.confidence_score}/10)`);
      console.log(`\n📊 OVERALL QUALIFICATION SCORE: ${analysis.overall_qualification_score}%`);
      console.log("========================================\n");

      // Prepare score data for database update
      const scoreData = {
        notice_period_score: analysis.notice_period_score,
        budget_score: analysis.budget_score,
        location_score: analysis.location_score,
        experience_score: analysis.experience_score,
        technical_score: analysis.technical_score,
        communication_score: analysis.communication_score,
        overall_qualification_score: analysis.overall_qualification_score,
        qualification_breakdown: analysis.qualification_breakdown,
        screening_transcript: transcript,
        conversation_summary: analysis.conversation_summary,
        call_status: webhookData.smart_status || webhookData.status || "Completed",
        
        // Legacy fields for backward compatibility
        tech_score: analysis.tech_score,
        job_interest: analysis.job_interest,
        confidence_score: analysis.confidence_score
      };

      // Update notice period if mentioned in call
      if (analysis.notice_period && analysis.notice_period !== 'Not mentioned') {
        scoreData.notice_period = analysis.notice_period;
      }

      // Get threshold from environment (default: 45%)
      const threshold = parseInt(process.env.QUALIFICATION_SCORE_THRESHOLD || process.env.TECH_SCORE_THRESHOLD || 45);

      // Determine status based on overall score
      if (analysis.overall_qualification_score >= threshold) {
        scoreData.status = "Qualified - Assessment Scheduling Queued";
        console.log(`✅ Candidate QUALIFIED (score: ${analysis.overall_qualification_score}% >= ${threshold}%)`);
        
        // Log qualification details
        if (analysis.qualification_breakdown) {
          const breakdown = analysis.qualification_breakdown;
          console.log("\n✓ Qualification Details:");
          if (breakdown.notice_period?.match) console.log(`  ✓ Notice Period: ${breakdown.notice_period.mentioned}`);
          if (breakdown.budget?.match) console.log(`  ✓ Budget: ${breakdown.budget.expectation}`);
          if (breakdown.location?.match) console.log(`  ✓ Location: ${breakdown.location.preference}`);
          if (breakdown.experience?.match) console.log(`  ✓ Experience: ${breakdown.experience.mentioned}`);
          console.log(`  ✓ Technical: ${analysis.technical_score}/40`);
          console.log(`  ✓ Communication: ${analysis.communication_score}/20\n`);
        }

        // Update candidate with scores
        await CandidateModel.updateWithScores(candidate.id, scoreData);

        // Schedule assessment call
        SchedulerService.scheduleAssessmentCall(
          candidate.id,
          analysis.overall_qualification_score,
          scoreData.notice_period || candidate.notice_period
        );

      } else {
        scoreData.status = "Rejected - Below Qualification Threshold";
        console.log(`❌ Candidate REJECTED (score: ${analysis.overall_qualification_score}% < ${threshold}%)`);
        
        // Log rejection reasons
        if (analysis.qualification_breakdown) {
          const breakdown = analysis.qualification_breakdown;
          console.log("\n✗ Rejection Reasons:");
          if (!breakdown.notice_period?.match && breakdown.notice_period?.score === 0) {
            console.log(`  ✗ Notice Period: ${breakdown.notice_period.mentioned} (required: ≤${breakdown.notice_period.required} days)`);
          }
          if (!breakdown.budget?.match && breakdown.budget?.score === 0) {
            console.log(`  ✗ Budget: ${breakdown.budget.expectation} (required: ≤${breakdown.budget.required} LPA)`);
          }
          if (!breakdown.location?.match && breakdown.location?.score === 0) {
            console.log(`  ✗ Location: ${breakdown.location.preference} (required: ${breakdown.location.required})`);
          }
          if (!breakdown.experience?.match && breakdown.experience?.score === 0) {
            console.log(`  ✗ Experience: ${breakdown.experience.mentioned} (required: ≥${breakdown.experience.required} years)`);
          }
          if (analysis.technical_score < 20) {
            console.log(`  ✗ Technical: ${analysis.technical_score}/40 (weak performance)`);
          }
          if (analysis.communication_score < 10) {
            console.log(`  ✗ Communication: ${analysis.communication_score}/20 (poor communication)`);
          }
          console.log();
        }

        // Update candidate with scores
        await CandidateModel.updateWithScores(candidate.id, scoreData);
      }

      // Log call to call_logs table
      await CallLogModel.create({
        candidate_id: candidate.id,
        call_type: "screening",
        run_id: candidate.screening_run_id,
        status: scoreData.call_status,
        transcript: transcript
      });

      console.log("✓ Screening call webhook processed successfully\n");

    } catch (error) {
      console.error("❌ Error processing screening webhook:", error.message);
      throw error;
    }
  }

  /**
   * Process scheduling webhook (unchanged from original)
   */
  static async processSchedulingWebhook(candidate, transcript, webhookData) {
    try {
      console.log("🤖 Analyzing scheduling transcript with OpenAI...");
      const analysis = await TranscriptService.analyzeSchedulingTranscript(
        transcript
      );

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

      if (
        analysis.candidate_confirmed &&
        analysis.assessment_date &&
        analysis.assessment_time
      ) {
        updates.status = "Assessment Scheduled - Link Sending";

        await CandidateModel.update(candidate.id, updates);

        console.log("📧 Sending assessment link via email...");
        const emailResult = await SchedulerService.sendAssessmentLink(
          candidate.id,
          analysis.assessment_date,
          analysis.assessment_time
        );

        if (emailResult.success) {
          console.log("✓ Assessment link sent successfully");
        } else {
          console.error("❌ Failed to send assessment link");
          await CandidateModel.update(candidate.id, {
            status: "Assessment Scheduled - Email Failed"
          });
        }
      } else {
        updates.status = "Scheduling Call Completed - Pending Confirmation";
        await CandidateModel.update(candidate.id, updates);
      }

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

  /**
   * Get last webhook payload (for debugging)
   */
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
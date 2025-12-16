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
      // ✅ PROCESS **ONLY FINAL WEBHOOK** — IGNORE ALL INTERMEDIATE EVENTS
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
        console.log("⚠️ Unknown call type — defaulting to screening logic");
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

  // -------------------------------------------------------------------
  // (No changes below this line — your existing logic stays the same)
  // -------------------------------------------------------------------

  static async processScreeningWebhook(candidate, transcript, webhookData) {
    try {
      console.log("🤖 Analyzing screening transcript with OpenAI...");
      const analysis = await TranscriptService.analyzeScreeningTranscript(
        transcript,
        candidate.skills
      );

      console.log("Analysis results:", {
        tech_score: analysis.tech_score,
        job_interest: analysis.job_interest,
        notice_period: analysis.notice_period,
        recommendation: analysis.recommendation
      });

      const updates = {
        call_status: webhookData.smart_status || webhookData.status || "Completed",
        screening_transcript: transcript,
        conversation_summary: analysis.conversation_summary,
        tech_score: analysis.tech_score,
        job_interest: analysis.job_interest,
    confidence_score: analysis.confidence_score
      };

      if (analysis.notice_period && analysis.notice_period !== "Not mentioned") {
        updates.notice_period = analysis.notice_period;
      }

      const threshold = parseInt(process.env.TECH_SCORE_THRESHOLD || 40);

      if (analysis.tech_score !== null) {
        if (analysis.tech_score > threshold) {
          updates.status = "Qualified - Assessment Scheduling Queued";
          console.log(
            `✅ Candidate QUALIFIED (score: ${analysis.tech_score} > ${threshold})`
          );

          SchedulerService.scheduleAssessmentCall(
            candidate.id,
            analysis.tech_score,
            updates.notice_period || candidate.notice_period
          );
        } else {
          updates.status = "Rejected - Low Technical Score";
          console.log(
            `❌ Candidate REJECTED (score: ${analysis.tech_score} ≤ ${threshold})`
          );
        }
      } else {
        updates.status = "Manual Review Required - No Tech Score";
        console.log("⚠️ No tech score extracted, needs manual review");
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

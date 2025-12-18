// src/controllers/candidate.controller.js
const CandidateModel = require('../models/candidate.model');
const BolnaService = require('../services/bolna.service');
const PromptService = require('../services/prompt.service');
const SchedulerService = require('../services/scheduler.service');

class CandidateController {
  
  /**
   * Get all candidates with optional filters
   */
  static async getCandidates(req, res) {
    try {
      const view = req.query.view || 'current';

      let candidates;

      if (view === 'current') {
        // Get latest batch
        const latestBatchId = await CandidateModel.getLatestBatchId();
        
        if (!latestBatchId) {
          return res.json([]);
        }

        candidates = await CandidateModel.getByBatch(latestBatchId);
      } else {
        // Get all candidates
        candidates = await CandidateModel.getAll();
      }

      res.json(candidates);

    } catch (error) {
      console.error('Error fetching candidates:', error);
      res.status(500).json({
        error: 'Error fetching candidates',
        details: error.message
      });
    }
  }

  /**
   * Get candidate statistics
   */
  static async getStats(req, res) {
    try {
      const view = req.query.view || 'current';
      
      let batchId = null;
      if (view === 'current') {
        batchId = await CandidateModel.getLatestBatchId();
      }

      const stats = await CandidateModel.getStats(batchId);
      res.json(stats);

    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({
        error: 'Error fetching statistics',
        details: error.message
      });
    }
  }

  /**
   * Get qualified candidates (NEW)
   */
  static async getQualifiedCandidates(req, res) {
    try {
      const threshold = parseFloat(req.query.threshold || process.env.QUALIFICATION_SCORE_THRESHOLD || 45);
      const view = req.query.view || 'current';

      let batchId = null;
      if (view === 'current') {
        batchId = await CandidateModel.getLatestBatchId();
      }

      const candidates = await CandidateModel.getQualified(threshold, batchId);

      res.json({
        success: true,
        threshold: threshold,
        count: candidates.length,
        candidates: candidates
      });

    } catch (error) {
      console.error('Error fetching qualified candidates:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get score distribution analytics (NEW)
   */
  static async getScoreDistribution(req, res) {
    try {
      const view = req.query.view || 'current';

      let batchId = null;
      if (view === 'current') {
        batchId = await CandidateModel.getLatestBatchId();
      }

      const distribution = await CandidateModel.getScoreDistribution(batchId);

      res.json({
        success: true,
        view: view,
        distribution: distribution
      });

    } catch (error) {
      console.error('Error fetching score distribution:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Call a single candidate
   */
  static async callCandidate(req, res) {
    try {
      const candidateId = parseInt(req.params.id, 10);

      // Fetch candidate
      const candidate = await CandidateModel.findById(candidateId);

      if (!candidate) {
        return res.status(404).json({ error: 'Candidate not found' });
      }

      if (!candidate.phone || candidate.phone === 'Not available') {
        return res.status(400).json({ error: 'Invalid phone number' });
      }

      // Check if candidate has matched skills
      if (!candidate.skills_matched || candidate.skills_matched === 'None') {
        return res.status(400).json({
          error: 'Cannot call candidate: No skills matched with job requirements',
          message: 'This candidate does not meet minimum skill requirements (requires at least 2 matching skills)'
        });
      }

      // Update status to calling
      await CandidateModel.update(candidateId, {
        call_status: 'Calling - Screening',
        status: 'Calling - Screening'
      });

      // Generate screening prompt (now async)
      const prompt = await PromptService.getScreeningPrompt(
        candidate.name,
        candidate.skills,
        candidate.years_of_experience,
        candidate.notice_period
      );

      // Make call
      const callResult = await BolnaService.makeCall(candidate.phone, prompt);

      if (callResult.success && callResult.run_id) {
        // Update with run_id
        await CandidateModel.update(candidateId, {
          screening_run_id: callResult.run_id
        });

        console.log(`✓ Screening call initiated for ${candidate.name}`);
        console.log(`✓ Run ID: ${callResult.run_id}`);

        return res.json({
          success: true,
          message: 'Screening call initiated. Multi-criteria analysis will run automatically via webhook.',
          run_id: callResult.run_id
        });
      } else {
        // Call failed - schedule follow-up
        const maxAttempts = parseInt(process.env.MAX_CALL_ATTEMPTS || 2);
        const newAttempts = (candidate.failed_attempts || 0) + 1;

        if (newAttempts >= maxAttempts) {
          await CandidateModel.update(candidateId, {
            status: 'No Response - Max Attempts',
            call_status: 'Failed - No Response',
            failed_attempts: newAttempts
          });

          return res.status(500).json({
            success: false,
            error: callResult.error,
            message: 'Max call attempts reached. Candidate marked as No Response.'
          });
        } else {
          const followUpTime = SchedulerService.calculateFollowUpTime();
          
          await CandidateModel.update(candidateId, {
            status: 'Follow-Up Scheduled',
            call_status: 'Did Not Pick Up',
            failed_attempts: newAttempts,
            follow_up_time: followUpTime
          });

          return res.status(500).json({
            success: false,
            error: callResult.error,
            followUpScheduled: true,
            followUpTime: followUpTime.toISOString()
          });
        }
      }

    } catch (error) {
      console.error('Call error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Call all pending candidates
   */
  static async callAllPending(req, res) {
    try {
      const candidates = await CandidateModel.getPending();

      if (candidates.length === 0) {
        return res.json({
          message: 'No pending candidates to call',
          count: 0
        });
      }

      console.log(`\n========== BULK CALLING ==========`);
      console.log(`Initiating calls for ${candidates.length} pending candidates...`);
      console.log(`==================================\n`);

      const results = [];

      // Stagger calls with 3 second delay
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];

        setTimeout(async () => {
          try {
            console.log(`[${i + 1}/${candidates.length}] Calling ${candidate.name}`);
            console.log(`  Skills matched: ${candidate.skills_matched}`);

            const prompt = await PromptService.getScreeningPrompt(
              candidate.name,
              candidate.skills,
              candidate.years_of_experience,
              candidate.notice_period
            );

            const callResult = await BolnaService.makeCall(candidate.phone, prompt);

            if (callResult.success && callResult.run_id) {
              await CandidateModel.update(candidate.id, {
                call_status: 'Calling - Screening',
                status: 'Calling - Screening',
                screening_run_id: callResult.run_id
              });

              console.log(`  ✓ Call initiated (run_id: ${callResult.run_id})\n`);
            } else {
              const newAttempts = (candidate.failed_attempts || 0) + 1;
              const maxAttempts = parseInt(process.env.MAX_CALL_ATTEMPTS || 2);

              if (newAttempts >= maxAttempts) {
                await CandidateModel.update(candidate.id, {
                  status: 'No Response - Max Attempts',
                  call_status: 'Failed - No Response',
                  failed_attempts: newAttempts
                });
                console.log(`  ❌ Max attempts reached\n`);
              } else {
                const followUpTime = SchedulerService.calculateFollowUpTime();
                await CandidateModel.update(candidate.id, {
                  status: 'Follow-Up Scheduled',
                  call_status: 'Did Not Pick Up',
                  failed_attempts: newAttempts,
                  follow_up_time: followUpTime
                });
                console.log(`  ⏰ Follow-up scheduled\n`);
              }
            }
          } catch (error) {
            console.error(`  ❌ Error calling ${candidate.name}:`, error.message, '\n');
          }
        }, i * 3000); // 3 second delay between calls

        results.push({
          name: candidate.name,
          phone: candidate.phone,
          skills_matched: candidate.skills_matched,
          status: 'Queued for calling'
        });
      }

      res.json({
        message: `Calling ${candidates.length} pending candidates with 3-second intervals.`,
        results,
        count: candidates.length
      });

    } catch (error) {
      console.error('Error calling all candidates:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = CandidateController;
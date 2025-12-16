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

      // Update status to calling
      await CandidateModel.update(candidateId, {
        call_status: 'Calling - Screening',
        status: 'Calling - Screening'
      });

      // Generate screening prompt
      const prompt = PromptService.getScreeningPrompt(
        candidate.name,
        candidate.skills
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
          message: 'Screening call initiated. Webhook will deliver transcript automatically.',
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

      console.log(`Initiating calls for ${candidates.length} pending candidates...`);

      const results = [];

      // Stagger calls with 3 second delay
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];

        setTimeout(async () => {
          try {
            const prompt = PromptService.getScreeningPrompt(
              candidate.name,
              candidate.skills
            );

            const callResult = await BolnaService.makeCall(candidate.phone, prompt);

            if (callResult.success && callResult.run_id) {
              await CandidateModel.update(candidate.id, {
                call_status: 'Calling - Screening',
                status: 'Calling - Screening',
                screening_run_id: callResult.run_id
              });

              console.log(`✓ Call initiated for ${candidate.name}`);
            } else {
              const newAttempts = (candidate.failed_attempts || 0) + 1;
              const maxAttempts = parseInt(process.env.MAX_CALL_ATTEMPTS || 2);

              if (newAttempts >= maxAttempts) {
                await CandidateModel.update(candidate.id, {
                  status: 'No Response - Max Attempts',
                  call_status: 'Failed - No Response',
                  failed_attempts: newAttempts
                });
              } else {
                const followUpTime = SchedulerService.calculateFollowUpTime();
                await CandidateModel.update(candidate.id, {
                  status: 'Follow-Up Scheduled',
                  call_status: 'Did Not Pick Up',
                  failed_attempts: newAttempts,
                  follow_up_time: followUpTime
                });
              }
            }
          } catch (error) {
            console.error(`Error calling ${candidate.name}:`, error.message);
          }
        }, i * 3000); // 3 second delay between calls

        results.push({
          name: candidate.name,
          phone: candidate.phone,
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

// src/controllers/upload.controller.js
const fs = require('fs').promises;
const ResumeService = require('../services/resume.service');
const CandidateModel = require('../models/candidate.model');
const BatchModel = require('../models/batch.model');
const { normalizePhone } = require('../utils/phoneFormatter');

class UploadController {
  
  /**
   * Handle resume upload with job requirements
   */
  static async uploadResumes(req, res) {
    try {
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      // Extract job requirements from request body
      const jobRequirements = {
        company: req.body.company || null,
        job_role: req.body.job_role || null,
        required_notice_period: req.body.required_notice_period || null,
        budget_min_lpa: req.body.budget_min_lpa ? parseFloat(req.body.budget_min_lpa) : null,
        budget_max_lpa: req.body.budget_max_lpa ? parseFloat(req.body.budget_max_lpa) : null,
        location: req.body.location || null,
        min_experience: req.body.min_experience ? parseFloat(req.body.min_experience) : null,
        max_experience: req.body.max_experience ? parseFloat(req.body.max_experience) : null,
        required_skills: req.body.required_skills || null
      };

      console.log(`\n========== Processing ${files.length} Resumes ==========`);
      console.log('Job Requirements:', jobRequirements);
      console.log('==========\n');

      // Create batch with job requirements
      const batchId = Date.now().toString();
      await BatchModel.create(batchId, jobRequirements);

      const results = [];
      let stats = {
        total: files.length,
        successful: 0,
        duplicates: 0,
        failed: 0,
        skills_mismatch: 0
      };

      // Parse required skills for matching
      let requiredSkillsArray = [];
      if (jobRequirements.required_skills) {
        requiredSkillsArray = jobRequirements.required_skills
          .toLowerCase()
          .split(',')
          .map(s => s.trim());
      }

      for (const file of files) {
        try {
          console.log(`Processing: ${file.originalname}`);

          // Extract text from PDF
          const resumeText = await ResumeService.extractTextFromPDF(file.path);
          
          if (!resumeText || resumeText.trim().length < 50) {
            throw new Error('Could not extract sufficient text from PDF');
          }

          console.log(`✓ Extracted ${resumeText.length} characters`);

          // Parse resume with OpenAI
          const extractedData = await ResumeService.parseResume(resumeText);
          console.log('Extracted data:', extractedData);

          // Normalize phone number
          const normalizedPhone = normalizePhone(extractedData.phone);
          
          if (!normalizedPhone) {
            throw new Error('Invalid phone number format');
          }

          // CHECK FOR DUPLICATE
          const existingCandidate = await CandidateModel.findByPhone(normalizedPhone);

          if (existingCandidate) {
            console.log(`⚠️ DUPLICATE: ${extractedData.name} already exists`);
            
            stats.duplicates++;
            results.push({
              filename: file.originalname,
              success: false,
              duplicate: true,
              data: extractedData,
              message: `Candidate already exists in database`
            });

            await fs.unlink(file.path).catch(err => console.error('Error deleting file:', err));
            continue;
          }

          // CHECK SKILLS MATCH (minimum 2 skills must match)
          let skillsMatch = true;
          if (requiredSkillsArray.length > 0 && extractedData.skills) {
            const candidateSkillsArray = extractedData.skills
              .toLowerCase()
              .split(',')
              .map(s => s.trim());

            const matchCount = requiredSkillsArray.filter(reqSkill =>
              candidateSkillsArray.some(candSkill =>
                candSkill.includes(reqSkill) || reqSkill.includes(candSkill)
              )
            ).length;

            if (matchCount < 2) {
              skillsMatch = false;
              console.log(`⚠️ SKILLS MISMATCH: ${extractedData.name} - only ${matchCount} skill(s) match (need 2+)`);
              
              stats.skills_mismatch++;
              results.push({
                filename: file.originalname,
                success: false,
                skills_mismatch: true,
                data: extractedData,
                matched_skills: matchCount,
                message: `Skills mismatch: Only ${matchCount} skill(s) match (need at least 2)`
              });

              await fs.unlink(file.path).catch(err => console.error('Error deleting file:', err));
              continue;
            } else {
              console.log(`✓ SKILLS MATCH: ${matchCount} skill(s) matched`);
            }
          }

          // Extract name from email if needed
          const finalName = ResumeService.extractNameFromEmail(
            extractedData.email, 
            extractedData.name
          );

          // Prepare candidate data with job details
          const candidateData = {
            name: finalName,
            phone: normalizedPhone,
            email: extractedData.email || 'Not available',
            skills: extractedData.skills || 'Not available',
            years_of_experience: extractedData.years_of_experience || 'Not available',
            current_company: extractedData.current_company || 'Not available',
            notice_period: extractedData.notice_period || 'Not specified',
            batch_id: batchId,
            target_company: jobRequirements.company,
            target_job_role: jobRequirements.job_role
          };

          // Save to database
          const savedCandidate = await CandidateModel.create(candidateData);

          console.log(`✓ Saved candidate: ${savedCandidate.name} (ID: ${savedCandidate.id})`);

          stats.successful++;
          results.push({
            filename: file.originalname,
            success: true,
            data: candidateData,
            candidateId: savedCandidate.id
          });

          // Delete uploaded file
          await fs.unlink(file.path).catch(err => console.error('Error deleting file:', err));

        } catch (error) {
          console.error(`❌ Error processing ${file.originalname}:`, error.message);
          
          stats.failed++;
          results.push({
            filename: file.originalname,
            success: false,
            error: error.message
          });

          try {
            await fs.unlink(file.path);
          } catch (unlinkError) {
            console.error('Error deleting file:', unlinkError);
          }
        }
      }

      // Update batch statistics
      await BatchModel.updateStats(batchId, stats);

      console.log('\n========== Processing Complete ==========');
      console.log(`✓ Successful: ${stats.successful}`);
      console.log(`⚠️ Duplicates: ${stats.duplicates}`);
      console.log(`⚠️ Skills Mismatch: ${stats.skills_mismatch}`);
      console.log(`❌ Failed: ${stats.failed}`);
      console.log('==========================================\n');

      res.json({
        message: 'Processing complete',
        results,
        stats,
        batchId,
        jobRequirements
      });

    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({
        error: error.message,
        details: 'An error occurred during file upload'
      });
    }
  }
}

module.exports = UploadController;
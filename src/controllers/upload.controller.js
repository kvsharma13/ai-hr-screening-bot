// src/controllers/upload.controller.js
const fs = require('fs').promises;
const ResumeService = require('../services/resume.service');
const CandidateModel = require('../models/candidate.model');
const BatchModel = require('../models/batch.model');
const { normalizePhone } = require('../utils/phoneFormatter');

class UploadController {
  
  /**
   * Handle resume upload and processing
   */
  static async uploadResumes(req, res) {
    try {
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      console.log(`\n========== Processing ${files.length} Resumes ==========\n`);

      // Create batch
      const batchId = Date.now().toString();
      await BatchModel.create(batchId);

      const results = [];
      let stats = {
        total: files.length,
        successful: 0,
        duplicates: 0,
        failed: 0
      };

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

          // Normalize phone number for deduplication
          const normalizedPhone = normalizePhone(extractedData.phone);
          
          if (!normalizedPhone) {
            throw new Error('Invalid phone number format');
          }

          // CHECK FOR DUPLICATE
          const existingCandidate = await CandidateModel.findByPhone(normalizedPhone);

          if (existingCandidate) {
            console.log(`⚠️  DUPLICATE: ${extractedData.name} already exists (added on ${existingCandidate.created_at})`);
            
            stats.duplicates++;
            results.push({
              filename: file.originalname,
              success: false,
              duplicate: true,
              data: extractedData,
              message: `Candidate already exists in database (added on ${new Date(existingCandidate.created_at).toLocaleDateString()})`
            });

            // Delete uploaded file
            await fs.unlink(file.path).catch(err => console.error('Error deleting file:', err));
            continue;
          }

          // Extract name from email if needed
          const finalName = ResumeService.extractNameFromEmail(
            extractedData.email, 
            extractedData.name
          );

          // Prepare candidate data
          const candidateData = {
            name: finalName,
            phone: normalizedPhone,
            email: extractedData.email || 'Not available',
            skills: extractedData.skills || 'Not available',
            years_of_experience: extractedData.years_of_experience || 'Not available',
            current_company: extractedData.current_company || 'Not available',
            notice_period: extractedData.notice_period || 'Not specified',
            batch_id: batchId
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

          // Delete uploaded file
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
      console.log(`⚠️  Duplicates: ${stats.duplicates}`);
      console.log(`❌ Failed: ${stats.failed}`);
      console.log('==========================================\n');

      res.json({
        message: 'Processing complete',
        results,
        stats,
        batchId
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

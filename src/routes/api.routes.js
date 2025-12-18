// src/routes/api.routes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UploadController = require('../controllers/upload.controller');
const CandidateController = require('../controllers/candidate.controller');
const WebhookController = require('../controllers/webhook.controller');
const BolnaService = require('../services/bolna.service');
const JobRequirementsModel = require('../models/jobRequirements.model');

const router = express.Router();

// ===== MULTER CONFIGURATION =====
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// ===== JOB REQUIREMENTS ROUTES =====

/**
 * GET /api/job-requirements
 * Get current job requirements
 */
router.get('/job-requirements', async (req, res) => {
  try {
    const requirements = await JobRequirementsModel.getCurrent();
    
    if (!requirements) {
      return res.json({
        success: false,
        message: 'No job requirements set yet'
      });
    }

    res.json({
      success: true,
      data: requirements
    });
  } catch (error) {
    console.error('Error fetching job requirements:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/job-requirements
 * Create or update job requirements
 */
router.post('/job-requirements', async (req, res) => {
  try {
    const requirementsData = req.body;

    // Validation
    if (!requirementsData.required_skills || requirementsData.required_skills.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one required skill must be specified'
      });
    }

    const savedRequirements = await JobRequirementsModel.upsert(requirementsData);

    console.log('\n========== JOB REQUIREMENTS UPDATED ==========');
    console.log(`Notice Period: ≤ ${savedRequirements.notice_period || 'Not set'} days`);
    console.log(`Budget: ≤ ${savedRequirements.budget || 'Not set'} LPA`);
    console.log(`Location: ${savedRequirements.location || 'Not set'}`);
    console.log(`Min Experience: ${savedRequirements.min_experience || 'Not set'} years`);
    console.log(`Relocation Required: ${savedRequirements.relocation_required ? 'Yes' : 'No'}`);
    console.log(`Required Skills: ${savedRequirements.required_skills.join(', ')}`);
    console.log('=============================================\n');

    res.json({
      success: true,
      message: 'Job requirements saved successfully',
      data: savedRequirements
    });
  } catch (error) {
    console.error('Error saving job requirements:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/job-requirements
 * Delete all job requirements (reset)
 */
router.delete('/job-requirements', async (req, res) => {
  try {
    await JobRequirementsModel.deleteAll();
    
    console.log('⚠️  Job requirements deleted (reset to default)\n');
    
    res.json({
      success: true,
      message: 'Job requirements deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting job requirements:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===== UPLOAD ROUTES =====
router.post('/upload', upload.array('resumes', 10), UploadController.uploadResumes);

// ===== CANDIDATE ROUTES =====
router.get('/candidates', CandidateController.getCandidates);
router.get('/candidates/stats', CandidateController.getStats);
router.get('/candidates/qualified', CandidateController.getQualifiedCandidates);
router.get('/candidates/score-distribution', CandidateController.getScoreDistribution);
router.post('/candidates/:id/call', CandidateController.callCandidate);
router.post('/candidates/call-all', CandidateController.callAllPending);

// ===== WEBHOOK ROUTES =====
router.post('/webhook/bolna', WebhookController.handleBolnaWebhook);
router.get('/webhook/last', WebhookController.getLastWebhook);

// ===== UTILITY ROUTES =====

// Export to Excel
router.get('/export/excel', async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const CandidateModel = require('../models/candidate.model');
    
    // Get all candidates
    const candidates = await CandidateModel.getAll();
    
    if (candidates.length === 0) {
      return res.status(404).json({ error: 'No candidates to export' });
    }
    
    // Format data for Excel
    const excelData = candidates.map(c => ({
      'ID': c.id,
      'Name': c.name,
      'Phone': c.phone,
      'Email': c.email,
      'Skills': c.skills,
      'Skills Matched': c.skills_matched,
      'Experience': c.years_of_experience,
      'Current Company': c.current_company,
      'Notice Period': c.notice_period,
      'Call Status': c.call_status,
      'Status': c.status,
      
      // New scoring columns
      'Overall Score (%)': c.overall_qualification_score,
      'Notice Period Score': c.notice_period_score,
      'Budget Score': c.budget_score,
      'Location Score': c.location_score,
      'Experience Score': c.experience_score,
      'Technical Score': c.technical_score,
      'Communication Score': c.communication_score,
      
      // Legacy columns
      'Tech Score (Legacy)': c.tech_score,
      'Job Interest': c.job_interest,
      'Confidence Score': c.confidence_score,
      
      // Assessment info
      'Assessment Date': c.assessment_date,
      'Assessment Time': c.assessment_time,
      'Assessment Link Sent': c.assessment_link_sent ? 'Yes' : 'No',
      
      'Conversation Summary': c.conversation_summary,
      'Batch ID': c.batch_id,
      'Created At': c.created_at,
      'Updated At': c.updated_at
    }));
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // Auto-size columns
    const colWidths = [
      { wch: 5 },  // ID
      { wch: 25 }, // Name
      { wch: 15 }, // Phone
      { wch: 30 }, // Email
      { wch: 50 }, // Skills
      { wch: 30 }, // Skills Matched
      { wch: 12 }, // Experience
      { wch: 25 }, // Company
      { wch: 15 }, // Notice
      { wch: 20 }, // Call Status
      { wch: 30 }, // Status
      { wch: 15 }, // Overall Score
      { wch: 15 }, // Notice Score
      { wch: 12 }, // Budget Score
      { wch: 15 }, // Location Score
      { wch: 15 }, // Experience Score
      { wch: 15 }, // Technical Score
      { wch: 18 }, // Communication Score
      { wch: 15 }, // Tech Score Legacy
      { wch: 15 }, // Job Interest
      { wch: 15 }, // Confidence
      { wch: 15 }, // Assessment Date
      { wch: 15 }, // Assessment Time
      { wch: 12 }, // Link Sent
      { wch: 60 }, // Summary
      { wch: 15 }, // Batch ID
      { wch: 20 }, // Created
      { wch: 20 }  // Updated
    ];
    ws['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
    
    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers and send
    const filename = `candidates_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
    
  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check Bolna agent configuration
router.get('/bolna/agent', async (req, res) => {
  try {
    const agent = await BolnaService.getAgentDetails();
    res.json({ success: true, agent });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    version: '2.0 - Multi-Criteria Scoring',
    features: [
      'Job Requirements Management',
      'Skill-Based Filtering (min 2 matches)',
      'Multi-Criteria Scoring (6 dimensions)',
      'Overall Qualification Score (0-100%)',
      'Threshold: 45% for qualification'
    ],
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
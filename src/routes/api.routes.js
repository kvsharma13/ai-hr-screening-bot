// src/routes/api.routes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UploadController = require('../controllers/upload.controller');
const CandidateController = require('../controllers/candidate.controller');
const WebhookController = require('../controllers/webhook.controller');
const SchedulerService = require('../services/scheduler.service');
const BolnaService = require('../services/bolna.service');

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
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// ===== UPLOAD ROUTES =====
router.post('/upload', upload.array('resumes', 10), UploadController.uploadResumes);

// ===== CANDIDATE ROUTES =====
router.get('/candidates', CandidateController.getCandidates);
router.get('/candidates/stats', CandidateController.getStats);
router.post('/candidates/:id/call', CandidateController.callCandidate);
router.post('/candidates/call-all', CandidateController.callAllPending);

// ===== CALL QUEUE ROUTES =====
router.get('/queue/stats', CandidateController.getQueueStats);

// ===== CALLBACK ROUTES =====
router.get('/callbacks/pending', async (req, res) => {
  try {
    const CandidateModel = require('../models/candidate.model');
    const pending = await CandidateModel.getPendingCallbacks();
    res.json({
      success: true,
      count: pending.length,
      callbacks: pending
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/callbacks/process', async (req, res) => {
  try {
    const result = await SchedulerService.processScheduledCallbacks();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/callbacks/stats', async (req, res) => {
  try {
    const CandidateModel = require('../models/candidate.model');
    const pool = require('../config/database');
    
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE callback_requested = TRUE) as total_callbacks,
        COUNT(*) FILTER (WHERE callback_requested = TRUE AND callback_scheduled_time > NOW()) as pending,
        COUNT(*) FILTER (WHERE callback_requested = TRUE AND callback_scheduled_time <= NOW()) as due_now,
        COUNT(*) FILTER (WHERE callback_attempts >= $1) as max_attempts_reached
      FROM candidates
    `;
    
    const maxAttempts = parseInt(process.env.MAX_CALLBACK_ATTEMPTS || 3);
    const result = await pool.query(query, [maxAttempts]);
    
    res.json({
      success: true,
      stats: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== WEBHOOK ROUTES =====
router.post('/webhook/bolna', WebhookController.handleBolnaWebhook);
router.get('/webhook/last', WebhookController.getLastWebhook);

// ===== UTILITY ROUTES =====

// Export to Excel with all scoring fields
router.get('/export/excel', async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const CandidateModel = require('../models/candidate.model');
    
    const candidates = await CandidateModel.getAll();
    
    if (candidates.length === 0) {
      return res.status(404).json({ error: 'No candidates to export' });
    }
    
    // Format data with all scoring fields
    const excelData = candidates.map(c => ({
      'ID': c.id,
      'Name': c.name,
      'Phone': c.phone,
      'Email': c.email,
      'Verified Email': c.verified_email || '',
      'Skills': c.skills,
      'Experience': c.years_of_experience,
      'Current Company': c.current_company,
      
      // Job Details
      'Target Company': c.target_company || '',
      'Target Role': c.target_job_role || '',
      
      // Candidate Responses
      'Notice Period (Candidate)': c.candidate_notice_period || '',
      'Budget LPA (Candidate)': c.candidate_budget_lpa || '',
      'Location (Candidate)': c.candidate_location || '',
      
      // Detailed Scores
      'Notice Period Score': c.notice_period_score || '',
      'Budget Score': c.budget_score || '',
      'Location Score': c.location_score || '',
      'Experience Score': c.experience_score || '',
      'Technical Score': c.technical_score || '',
      'Confidence Score': c.confidence_fluency_score || '',
      'Total Score': c.total_score || '',
      
      // Status
      'Call Status': c.call_status,
      'Status': c.status,
      'Job Interest': c.job_interest || '',
      
      // Callback Info
      'Callback Requested': c.callback_requested ? 'Yes' : 'No',
      'Callback Time': c.callback_scheduled_time || '',
      'Callback Attempts': c.callback_attempts || 0,
      
      // Assessment
      'Assessment Date': c.assessment_date || '',
      'Assessment Time': c.assessment_time || '',
      'Assessment Link Sent': c.assessment_link_sent ? 'Yes' : 'No',
      
      'Summary': c.conversation_summary || '',
      'Batch ID': c.batch_id,
      'Created At': c.created_at,
      'Updated At': c.updated_at
    }));
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // Auto-size columns
    const colWidths = Array(30).fill({ wch: 20 });
    ws['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    const filename = `candidates_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
    
  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check Bolna agent
router.get('/bolna/agent', async (req, res) => {
  try {
    const agent = await BolnaService.getAgentDetails();
    res.json({ success: true, agent });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'AI Recruitment System v2.0 - Complete',
    features: [
      '100-point scoring system',
      '45% threshold',
      'Skills pre-filtering (2+ match)',
      'Callback scheduling',
      'Company/role announcement',
      'Manual assessment links',
      'Detailed scoring breakdown'
    ],
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
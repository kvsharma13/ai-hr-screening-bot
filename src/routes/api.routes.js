// src/routes/api.routes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UploadController = require('../controllers/upload.controller');
const CandidateController = require('../controllers/candidate.controller');
const WebhookController = require('../controllers/webhook.controller');
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
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// ===== UPLOAD ROUTES =====
router.post('/upload', upload.array('resumes', 10), UploadController.uploadResumes);

// ===== CANDIDATE ROUTES =====
router.get('/candidates', CandidateController.getCandidates);
router.get('/candidates/stats', CandidateController.getStats);
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
      'Experience': c.years_of_experience,
      'Current Company': c.current_company,
      'Notice Period': c.notice_period,
      'Call Status': c.call_status,
      'Status': c.status,
      'Tech Score': c.tech_score,
      'Job Interest': c.job_interest,
      'Confidence Score': c.confidence_score,
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
      { wch: 12 }, // Experience
      { wch: 25 }, // Company
      { wch: 15 }, // Notice
      { wch: 20 }, // Call Status
      { wch: 30 }, // Status
      { wch: 12 }, // Tech Score
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
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
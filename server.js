// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import database connection (this will test connection on startup)
require('./src/config/database');

// Import routes
const apiRoutes = require('./src/routes/api.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Serve static files (frontend)
app.use(express.static('public'));

// ===== API ROUTES =====
app.use('/api', apiRoutes);

// ===== ROOT ROUTE =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log('\n========================================');
  console.log('🚀 AI RECRUITMENT SYSTEM STARTED');
  console.log('========================================');
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database: ${process.env.DB_NAME}@${process.env.DB_HOST}`);
  console.log('========================================');
  console.log('\n📌 SETUP CHECKLIST:');
  console.log('1. ✓ Configure Bolna webhook URL: http://your-server/api/webhook/bolna');
  console.log('2. ✓ Upload resumes via dashboard');
  console.log('3. ✓ System will auto-call and analyze');
  console.log('4. ✓ Qualified candidates get auto-scheduled assessment calls');
  console.log('5. ✓ Assessment links sent via email automatically');
  console.log('\n========================================\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT signal received: closing server');
  process.exit(0);
});

// UPDATED server.js
// Add these changes to your existing server.js

const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

// Import database connection (this will test connection on startup)
require('./src/config/database');

// Import routes
const apiRoutes = require('./src/routes/api.routes');

// Import scheduler service for callback processing
const SchedulerService = require('./src/services/scheduler.service');

// Import call queue service for intelligent calling
const CallQueueService = require('./src/services/callQueue.service');

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

// ===== CALLBACK SCHEDULER =====
// Run every minute to check for scheduled callbacks
cron.schedule('* * * * *', async () => {
  try {
    await SchedulerService.processScheduledCallbacks();
  } catch (error) {
    console.error('⚠️ Cron job error (callbacks):', error.message);
  }
});

console.log('⏰ Callback scheduler started (runs every minute)');

// ===== CALL QUEUE PROCESSOR =====
// Run every minute to process call queue with rate limiting
cron.schedule('* * * * *', async () => {
  try {
    await CallQueueService.processQueue();
  } catch (error) {
    console.error('⚠️ Cron job error (call queue):', error.message);
  }
});

console.log('📞 Call queue processor started (6 calls/hour, random intervals)');

// ===== DAILY CLEANUP =====
// Run at 2 AM daily to clean up old queue entries
cron.schedule('0 2 * * *', async () => {
  try {
    await CallQueueService.cleanupOldEntries();
  } catch (error) {
    console.error('⚠️ Cleanup error:', error.message);
  }
});

console.log('🧹 Daily cleanup scheduler started (runs at 2 AM)');

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log('\n========================================');
  console.log('🚀 AI RECRUITMENT SYSTEM STARTED');
  console.log('========================================');
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database: ${process.env.DB_NAME}@${process.env.DB_HOST}`);
  console.log('========================================');
  console.log('\n📋 SETUP CHECKLIST:');
  console.log('1. ✓ Configure Bolna webhook URL: http://your-server/api/webhook/bolna');
  console.log('2. ✓ Upload resumes via dashboard');
  console.log('3. ✓ System will auto-call and analyze');
  console.log('4. ✓ Qualified candidates get auto-scheduled assessment calls');
  console.log('5. ✓ Assessment links sent via email automatically');
  console.log('6. ✓ Callback scheduler running (checks every minute)');
  console.log('7. ✓ Call queue processor running (6 calls/hour, 3-10 min intervals)');
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
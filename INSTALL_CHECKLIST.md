# ✅ Installation Checklist

## Pre-Installation

### System Requirements
- [ ] Node.js 18+ installed (`node --version`)
- [ ] PostgreSQL 14+ installed (`psql --version`)
- [ ] npm installed (`npm --version`)
- [ ] 500MB free disk space
- [ ] Internet connection

### API Keys Ready
- [ ] OpenAI API Key from https://platform.openai.com/api-keys
- [ ] Bolna API Key from https://app.bolna.ai/
- [ ] Bolna Agent ID from Bolna dashboard
- [ ] Gmail account (for emails)
- [ ] Gmail App Password generated

---

## Installation Steps

### Step 1: Extract Application
- [ ] Downloaded recruitment-app.zip
- [ ] Extracted to desired location
- [ ] Navigated to folder: `cd recruitment-app`

### Step 2: Install Dependencies
```bash
npm install
```
- [ ] All packages installed successfully
- [ ] No error messages
- [ ] `node_modules` folder created

### Step 3: Database Setup
```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE recruitment_db;

# Exit
\q
```
- [ ] PostgreSQL running
- [ ] Database `recruitment_db` created
- [ ] Can connect: `psql -U postgres -d recruitment_db -c "SELECT 1;"`

### Step 4: Environment Configuration
```bash
cp .env.example .env
```
Edit `.env` file with:
- [ ] `DB_PASSWORD` - Your PostgreSQL password
- [ ] `OPENAI_API_KEY` - Your OpenAI key (starts with sk-)
- [ ] `BOLNA_API_KEY` - Your Bolna API key
- [ ] `BOLNA_AGENT_ID` - Your Bolna agent ID
- [ ] `BOLNA_FROM_NUMBER` - Your Bolna phone number
- [ ] `EMAIL_USER` - Your Gmail address
- [ ] `EMAIL_PASSWORD` - Gmail app password (16 characters)
- [ ] `ASSESSMENT_BASE_URL` - Your assessment platform URL

Optional settings (can use defaults):
- [ ] `PORT` (default: 3000)
- [ ] `TECH_SCORE_THRESHOLD` (default: 40)
- [ ] `MAX_CALL_ATTEMPTS` (default: 2)

### Step 5: Run Database Migration
```bash
npm run migrate
```
Expected output:
```
✓ Database schema created successfully
✓ Tables created: batches, candidates, call_logs
✓ Indexes created for optimal performance
```
- [ ] Migration completed without errors
- [ ] All tables created
- [ ] Indexes configured

### Step 6: Start Application
```bash
npm start
```
Expected output:
```
✓ Database connected successfully
🚀 AI RECRUITMENT SYSTEM STARTED
Server: http://localhost:3000
```
- [ ] Server started successfully
- [ ] Database connection confirmed
- [ ] No error messages
- [ ] Port 3000 accessible

---

## Verification Tests

### Test 1: Dashboard Access
- [ ] Open browser: `http://localhost:3000`
- [ ] Dashboard loads successfully
- [ ] No JavaScript errors in console
- [ ] Upload section visible
- [ ] Candidates table visible

### Test 2: Database Connection
```bash
curl http://localhost:3000/api/health
```
- [ ] Returns `{"success":true, ...}`
- [ ] No error messages

### Test 3: Bolna Configuration
```bash
curl http://localhost:3000/api/bolna/agent
```
- [ ] Returns agent details
- [ ] No authentication errors

---

## Bolna Webhook Setup

### For Local Testing (ngrok)
```bash
# Install ngrok globally
npm install -g ngrok

# Start ngrok
ngrok http 3000
```
- [ ] ngrok installed
- [ ] ngrok running
- [ ] Received ngrok URL (e.g., https://abc123.ngrok.io)

### Configure in Bolna Dashboard
1. Go to https://app.bolna.ai/
2. Navigate to your agent settings
3. Find "Webhook URL" field
4. Enter: `https://your-ngrok-url.ngrok.io/api/webhook/bolna`
5. Save configuration

- [ ] Logged into Bolna dashboard
- [ ] Found agent settings
- [ ] Webhook URL configured
- [ ] Configuration saved

### For Production Deployment
- [ ] Server has public IP or domain
- [ ] Webhook URL: `http://your-domain.com/api/webhook/bolna`
- [ ] Firewall allows incoming webhooks
- [ ] HTTPS configured (recommended)

---

## Functional Tests

### Test 4: Resume Upload
1. Prepare a test PDF resume
2. Go to `http://localhost:3000`
3. Upload the PDF
4. Click "Upload & Process"

- [ ] File uploaded successfully
- [ ] Processing completed
- [ ] Candidate appears in dashboard
- [ ] No errors in console

### Test 5: Deduplication
1. Upload the same resume again
2. Check for duplicate warning

- [ ] Duplicate detected
- [ ] Warning message shown
- [ ] Duplicate not added to database
- [ ] Duplicate count in batch stats

### Test 6: Call Initiation
1. Click "Call" button for a candidate
2. Observe status change

- [ ] Button clicked successfully
- [ ] Status changes to "Calling - Screening"
- [ ] run_id stored in database
- [ ] No errors in console or server logs

### Test 7: Webhook Reception
1. Wait for call to complete
2. Check server console for webhook log
3. Check candidate status update

- [ ] Webhook received (visible in console)
- [ ] Transcript extracted
- [ ] OpenAI analysis completed
- [ ] Status updated based on tech score
- [ ] Data saved to database

### Test 8: Email Sending (if qualified)
If tech_score > 40%:
- [ ] Assessment scheduling call triggered (after 2 min)
- [ ] Email verification occurred
- [ ] Assessment link sent
- [ ] Email received in inbox
- [ ] Email HTML formatted properly
- [ ] Assessment link works

---

## Troubleshooting Checklist

### Database Issues
If migration fails:
- [ ] PostgreSQL is running: `sudo service postgresql status`
- [ ] Can connect: `psql -U postgres`
- [ ] Database exists: `\l` in psql
- [ ] Correct password in `.env`

### OpenAI Errors
If parsing fails:
- [ ] API key is valid (check on OpenAI platform)
- [ ] Account has credits
- [ ] No extra spaces in `.env` key
- [ ] Key starts with `sk-`

### Bolna Issues
If calls don't initiate:
- [ ] API key is valid (check Bolna dashboard)
- [ ] Agent ID is correct
- [ ] Phone number format: +91XXXXXXXXXX
- [ ] Webhook URL configured in Bolna

### Email Issues
If emails don't send:
- [ ] Using Gmail app password (not regular password)
- [ ] 2FA enabled on Gmail account
- [ ] App password is 16 characters
- [ ] EMAIL_SERVICE is 'gmail'

### Webhook Issues
If webhooks not received:
- [ ] ngrok is running (for local)
- [ ] Webhook URL correct in Bolna
- [ ] Server is accessible from internet
- [ ] Check `/api/webhook/last` endpoint

---

## Security Checklist

### Before Production Deployment
- [ ] `.env` file not committed to git
- [ ] Database has strong password
- [ ] PostgreSQL not exposed to internet
- [ ] Using HTTPS for webhook
- [ ] Environment variables properly set
- [ ] Sensitive data not in logs
- [ ] Regular backups configured

---

## Performance Checklist

### Database
- [ ] Indexes created (automatic in migration)
- [ ] Connection pooling configured (automatic)
- [ ] PostgreSQL properly tuned

### Application
- [ ] Using latest Node.js LTS
- [ ] PM2 or similar for process management (production)
- [ ] Log rotation configured
- [ ] Memory limits set

---

## Documentation Checklist

### Read These Docs
- [ ] README.md - Complete documentation
- [ ] QUICKSTART.md - 5-minute setup guide
- [ ] FEATURES.md - All features explained
- [ ] ARCHITECTURE.md - System design
- [ ] CHANGELOG.md - Changes from v1.0

### Understand Key Concepts
- [ ] How deduplication works
- [ ] Webhook flow (screening + scheduling)
- [ ] OpenAI analysis process
- [ ] Email verification logic
- [ ] Auto-scheduling trigger

---

## Production Readiness

### Before Going Live
- [ ] All tests passed
- [ ] Webhook working reliably
- [ ] Email delivery confirmed
- [ ] Database backed up
- [ ] Monitoring setup (logs, metrics)
- [ ] Error alerting configured
- [ ] Load testing completed
- [ ] Security audit done

---

## Support Resources

### If You Get Stuck
1. [ ] Check QUICKSTART.md common issues section
2. [ ] Review server console logs
3. [ ] Test individual components:
   - Database: `psql -U postgres -d recruitment_db`
   - OpenAI: Test API key at platform.openai.com
   - Bolna: Check dashboard for agent status
   - Email: Test SMTP credentials
4. [ ] Check `/api/health` endpoint
5. [ ] View last webhook: `/api/webhook/last`

### Debug Endpoints
- `GET /api/health` - Server health check
- `GET /api/webhook/last` - Last webhook received
- `GET /api/bolna/agent` - Bolna agent config
- `GET /api/candidates/stats` - Pipeline statistics

---

## Final Verification

### System is Ready When
- [x] ✅ All installation steps completed
- [x] ✅ All verification tests passed
- [x] ✅ Resume upload works
- [x] ✅ Deduplication works
- [x] ✅ Calls can be initiated
- [x] ✅ Webhooks are received
- [x] ✅ OpenAI analysis works
- [x] ✅ Emails send successfully
- [x] ✅ Auto-scheduling triggers
- [x] ✅ Dashboard updates in real-time

---

## 🎉 Congratulations!

If all checkboxes are ticked, your AI Recruitment System is fully operational!

**Next Steps:**
1. Upload your candidate resumes
2. Start calling candidates
3. Watch the automation work
4. Monitor the pipeline
5. Enjoy the time savings!

**Need Help?** 
Review the comprehensive README.md or check the troubleshooting section above.

**Ready to scale your recruitment!** 🚀

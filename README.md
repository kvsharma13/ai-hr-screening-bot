# 🤖 AI Recruitment System v2.0

A complete recruitment automation platform with AI-powered resume parsing, automated calling, transcript analysis, and intelligent candidate screening.

## ✨ Features

### Core Functionality
- **PDF Resume Parsing** - Extract candidate information using OpenAI GPT-4
- **Deduplication** - Automatic phone number-based duplicate detection
- **Automated Calling** - Bolna.ai integration for screening calls
- **AI Transcript Analysis** - OpenAI analyzes conversations and scores candidates
- **Auto-Scheduling** - Qualified candidates (tech score > 40%) automatically receive scheduling calls
- **Email Verification** - Confirms email address during scheduling call
- **Assessment Links** - Automatically sends assessment links via email
- **PostgreSQL Database** - Scalable, production-ready data storage
- **Real-time Dashboard** - Live updates with candidate pipeline stats

### Key Improvements from v1.0
- ✅ PostgreSQL instead of Excel (ACID compliance, concurrent access, scalability)
- ✅ OpenAI transcript analysis (custom scoring, not dependent on Bolna)
- ✅ Automatic deduplication by phone number
- ✅ Email verification during scheduling calls
- ✅ Modular architecture (easy to maintain and extend)
- ✅ Proper error handling and logging
- ✅ Call logs tracking

---

## 📋 Prerequisites

### Required Software
1. **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
2. **PostgreSQL** (v14 or higher) - [Download](https://www.postgresql.org/download/)
3. **npm** (comes with Node.js)

### Required API Keys
1. **OpenAI API Key** - [Get from OpenAI](https://platform.openai.com/api-keys)
2. **Bolna.ai API Key** - [Get from Bolna Dashboard](https://app.bolna.ai/)
3. **Email Account** - Gmail account with App Password

---

## 🚀 Installation

### Step 1: Extract the Application
```bash
# Extract the downloaded zip file
unzip recruitment-app.zip
cd recruitment-app
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Setup PostgreSQL Database

#### Option A: Local PostgreSQL
```bash
# Create database
psql -U postgres
CREATE DATABASE recruitment_db;
\q
```

#### Option B: Docker PostgreSQL
```bash
docker run --name recruitment-postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=recruitment_db \
  -p 5432:5432 \
  -d postgres:14
```

#### Option C: Cloud PostgreSQL
Use any cloud provider (AWS RDS, Supabase, Neon, etc.) and get connection details.

### Step 4: Configure Environment Variables

1. **Copy the example environment file:**
```bash
cp .env.example .env
```

2. **Edit .env file with your credentials:**
```bash
nano .env  # or use any text editor
```

3. **Required Configuration:**
```env
# Server
PORT=3000
NODE_ENV=development

# PostgreSQL Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=recruitment_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# OpenAI API
OPENAI_API_KEY=sk-your-openai-api-key-here

# Bolna.ai API
BOLNA_API_KEY=your-bolna-api-key-here
BOLNA_AGENT_ID=your-agent-id-here
BOLNA_FROM_NUMBER=+918035738463

# Email Configuration (Gmail example)
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password-here
EMAIL_FROM_NAME=Mindmap Digital

# Assessment Link
ASSESSMENT_BASE_URL=https://your-assessment-platform.com/test

# Settings
AUTO_SCHEDULE_DELAY_MS=120000
TECH_SCORE_THRESHOLD=40
MAX_CALL_ATTEMPTS=2
```

### Step 5: Setup Gmail App Password (for emails)

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-Factor Authentication
3. Go to "App Passwords"
4. Generate new app password for "Mail"
5. Copy the 16-character password to `.env` as `EMAIL_PASSWORD`

### Step 6: Run Database Migration
```bash
npm run migrate
```

You should see:
```
✓ Database schema created successfully
✓ Tables created: batches, candidates, call_logs
✓ Indexes created for optimal performance
```

### Step 7: Start the Application
```bash
npm start
```

For development (auto-restart on file changes):
```bash
npm run dev
```

---

## 🔧 Bolna.ai Configuration

### Step 1: Configure Webhook URL

1. Log in to [Bolna Dashboard](https://app.bolna.ai/)
2. Go to your agent settings
3. Set **Webhook URL** to: `http://your-server-ip:3000/api/webhook/bolna`

   **For local testing with ngrok:**
   ```bash
   ngrok http 3000
   # Use the ngrok URL: https://xxxxx.ngrok.io/api/webhook/bolna
   ```

### Step 2: Verify Agent Configuration
```bash
curl http://localhost:3000/api/bolna/agent
```

---

## 📖 Usage Guide

### 1. Upload Resumes

1. Open dashboard: `http://localhost:3000`
2. Drag & drop PDF resumes or click "Choose Files"
3. Click "Upload & Process"

**What happens:**
- System extracts text from PDFs
- OpenAI parses candidate information
- Phone numbers are normalized
- Duplicates are detected and skipped
- New candidates saved to PostgreSQL

### 2. Call Candidates

**Option A: Call Single Candidate**
- Click "📞 Call" button next to candidate

**Option B: Call All Pending**
- Click "📞 Call All Pending" to call all new candidates

**What happens:**
- System generates custom Bolna prompt
- Initiates call through Bolna.ai
- Stores `run_id` for webhook matching

### 3. Automatic Processing (Webhook)

When Bolna completes a call, webhook automatically:

#### For Screening Calls:
1. Receives transcript from Bolna
2. Sends transcript to OpenAI for analysis
3. Extracts:
   - Technical score (0-100%)
   - Job interest level
   - Notice period
   - Conversation summary
4. If tech_score > 40%:
   - Marks candidate as "Qualified"
   - Schedules assessment call in 2 minutes
5. If tech_score ≤ 40%:
   - Marks candidate as "Rejected"

#### For Scheduling Calls:
1. Receives transcript from Bolna
2. Sends transcript to OpenAI for analysis
3. Extracts:
   - Email verification status
   - Corrected email (if candidate provided new one)
   - Assessment date and time
4. If date/time confirmed:
   - Generates unique assessment link
   - Sends email with assessment details
   - Updates candidate status

### 4. Monitor Pipeline

**Real-time Stats:**
- Total candidates
- Pending calls
- Currently calling
- Completed calls
- Qualified candidates
- Rejected candidates
- Assessments scheduled

**Auto-refresh:** Dashboard refreshes every 30 seconds

---

## 📁 Project Structure

```
recruitment-app/
├── src/
│   ├── config/
│   │   └── database.js           # PostgreSQL connection
│   ├── models/
│   │   ├── candidate.model.js    # Candidate database operations
│   │   ├── batch.model.js        # Batch tracking
│   │   └── callLog.model.js      # Call logs
│   ├── services/
│   │   ├── resume.service.js     # PDF parsing + OpenAI extraction
│   │   ├── transcript.service.js # OpenAI transcript analysis
│   │   ├── bolna.service.js      # Bolna API integration
│   │   ├── email.service.js      # Email sending
│   │   ├── prompt.service.js     # Dynamic Bolna prompts
│   │   └── scheduler.service.js  # Auto-scheduling logic
│   ├── controllers/
│   │   ├── upload.controller.js  # Resume upload handling
│   │   ├── candidate.controller.js # Candidate CRUD + calling
│   │   └── webhook.controller.js # Bolna webhook processing
│   ├── routes/
│   │   └── api.routes.js         # All API endpoints
│   ├── utils/
│   │   └── phoneFormatter.js     # Phone number utilities
│   └── migrations/
│       └── migrate.js            # Database schema setup
├── public/
│   └── index.html                # Dashboard frontend
├── uploads/                      # Temporary PDF storage
├── .env                          # Environment variables (create from .env.example)
├── .env.example                  # Template
├── server.js                     # Application entry point
├── package.json                  # Dependencies
└── README.md                     # This file
```

---

## 🔄 Complete Workflow

```
1. Resume Upload
   ↓
2. OpenAI Parsing
   ↓
3. Deduplication Check (by phone)
   ↓
4. Save to PostgreSQL
   ↓
5. Screening Call (Bolna)
   ↓
6. Webhook → OpenAI Analysis
   ↓
7. If tech_score > 40%:
   ├─ Wait 2 minutes
   └─ Scheduling Call (Bolna)
       ↓
       Webhook → OpenAI Analysis
       ↓
       Extract email verification & date/time
       ↓
       Send assessment link via email
       ↓
       Update status: "Assessment Scheduled"
```

---

## 🔌 API Endpoints

### Upload
- `POST /api/upload` - Upload and process resumes

### Candidates
- `GET /api/candidates?view=current|all` - Get candidates
- `GET /api/candidates/stats?view=current|all` - Get statistics
- `POST /api/candidates/:id/call` - Call single candidate
- `POST /api/candidates/call-all` - Call all pending

### Webhooks
- `POST /api/webhook/bolna` - Bolna webhook endpoint
- `GET /api/webhook/last` - View last webhook (debugging)

### Utilities
- `GET /api/health` - Health check
- `GET /api/bolna/agent` - Check Bolna agent config

---

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Test PostgreSQL connection
psql -U postgres -d recruitment_db -c "SELECT NOW();"

# Check if database exists
psql -U postgres -c "\l"
```

### Bolna Webhook Not Receiving
1. Check webhook URL in Bolna dashboard
2. For local testing, use ngrok:
   ```bash
   ngrok http 3000
   ```
3. Update Bolna webhook to ngrok URL
4. Check last webhook: `GET /api/webhook/last`

### OpenAI API Errors
- Check API key is valid
- Ensure you have credits
- Check rate limits

### Email Not Sending
- Verify Gmail app password
- Check EMAIL_SERVICE matches your provider
- Test email connection:
  ```javascript
  const EmailService = require('./src/services/email.service');
  EmailService.verifyConnection();
  ```

### Duplicate Detection Not Working
- Ensure phone numbers are properly formatted
- Check normalization logic in `src/utils/phoneFormatter.js`

---

## 📊 Database Schema

### candidates
- `id` - Primary key
- `name` - Candidate name
- `phone` - Normalized phone number (unique)
- `email` - Email address
- `verified_email` - Email confirmed during scheduling
- `skills` - Comma-separated skills
- `years_of_experience` - Experience years
- `current_company` - Current employer
- `notice_period` - Notice period
- `call_status` - Current call status
- `status` - Overall candidate status
- `screening_run_id` - Bolna run ID for screening call
- `screening_transcript` - Full screening transcript
- `tech_score` - Technical assessment score (0-100)
- `job_interest` - Job change interest level
- `confidence_score` - Communication score (1-10)
- `conversation_summary` - AI-generated summary
- `scheduling_run_id` - Bolna run ID for scheduling call
- `scheduling_transcript` - Full scheduling transcript
- `assessment_date` - Scheduled assessment date
- `assessment_time` - Scheduled assessment time
- `assessment_link` - Unique assessment URL
- `assessment_link_sent` - Boolean flag
- `batch_id` - Upload batch identifier
- `created_at` - Record creation timestamp
- `updated_at` - Last update timestamp

### call_logs
- `id` - Primary key
- `candidate_id` - Foreign key to candidates
- `call_type` - 'screening' or 'scheduling'
- `run_id` - Bolna run ID
- `status` - Call outcome
- `transcript` - Full conversation
- `duration_seconds` - Call duration
- `created_at` - Log timestamp

### batches
- `id` - Primary key
- `batch_id` - Unique batch identifier
- `total_resumes` - Total uploaded
- `successful` - Successfully processed
- `duplicates` - Duplicate count
- `failed` - Failed count
- `created_at` - Batch timestamp

---

## 🎯 Key Configuration Options

### Tech Score Threshold
```env
TECH_SCORE_THRESHOLD=40  # Candidates above this qualify for assessment
```

### Auto-Schedule Delay
```env
AUTO_SCHEDULE_DELAY_MS=120000  # 2 minutes = 120000 ms
```

### Max Call Attempts
```env
MAX_CALL_ATTEMPTS=2  # Max retries for failed calls
```

---

## 🚀 Production Deployment

### Option 1: VPS (DigitalOcean, AWS EC2, Linode)
```bash
# Install Node.js and PostgreSQL
# Clone repository
# Configure .env
# Run migration
npm run migrate

# Use PM2 for process management
npm install -g pm2
pm2 start server.js --name recruitment-app
pm2 save
pm2 startup
```

### Option 2: Docker
```bash
# Build image
docker build -t recruitment-app .

# Run container
docker run -d \
  --name recruitment-app \
  -p 3000:3000 \
  --env-file .env \
  recruitment-app
```

### Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 📝 Support

For issues or questions:
1. Check troubleshooting section
2. Review logs in console
3. Test individual components (database, OpenAI, Bolna, email)

---

## 📄 License

MIT License - Mindmap Digital

---

## 🎉 You're All Set!

Open `http://localhost:3000` and start recruiting with AI! 🚀

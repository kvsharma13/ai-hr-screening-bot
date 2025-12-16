# 🎯 Features Documentation

## Complete Feature List

### 1. **Resume Processing** 📄

#### PDF Text Extraction
- Parses PDF resumes automatically
- Handles various PDF formats
- Extracts clean, usable text

#### AI-Powered Data Extraction
- Uses OpenAI GPT-4 for intelligent parsing
- Extracts:
  - Full name
  - Phone number (with country code)
  - Email address
  - Technical skills (comprehensive list)
  - Years of experience
  - Current company
  - Notice period

#### Smart Name Detection
- Attempts to extract name from resume header
- Falls back to email-based name extraction
- Formats names properly (Title Case)

---

### 2. **Deduplication System** 🔍

#### Phone Number-Based Detection
- Normalizes all phone numbers to +91XXXXXXXXXX format
- Checks database before insertion
- Handles various formats:
  - +91XXXXXXXXXX
  - 91XXXXXXXXXX
  - 0XXXXXXXXXX (removes leading 0)
  - XXXXXXXXXX (adds +91)

#### Duplicate Handling
- Skips duplicate candidates automatically
- Shows "Already in database since [date]" message
- Counts duplicates in batch statistics
- Prevents redundant processing and costs

---

### 3. **Automated Calling** 📞

#### Bolna.ai Integration
- Dynamic prompt generation for each candidate
- Personalized greeting with candidate name
- Context-aware questions based on skills

#### Call Types

**Screening Call (5-7 minutes):**
- Permission check ("Do you have 5 minutes?")
- Job change interest
- Notice period inquiry
- 2-3 technical questions (skill-specific)
- Interest level (1-10 scale)
- Professional closing

**Scheduling Call (2-4 minutes):**
- Congratulatory opening
- Email verification/correction
- Assessment date/time selection
- Instructions delivery
- Confirmation

#### Call Management
- Staggered calling (3-second intervals)
- Failed call retry logic
- Follow-up scheduling
- Maximum attempt limits (configurable)

---

### 4. **AI Transcript Analysis** 🤖

#### OpenAI-Powered Evaluation
Independent analysis (not dependent on Bolna's analytics)

**Screening Call Analysis:**
- **Technical Score** (0-100%):
  - 80-100: Excellent knowledge
  - 60-79: Good understanding
  - 40-59: Basic knowledge
  - 0-39: Insufficient

- **Job Interest Level:**
  - High / Medium / Low
  - Based on enthusiasm and responses

- **Confidence Score** (1-10):
  - Communication clarity
  - Coherence
  - Professionalism

- **Notice Period Extraction:**
  - Immediate, 15 days, 1 month, 2 months, etc.
  - Parsed from natural language

- **Conversation Summary:**
  - 2-3 sentence overview
  - Key points highlighted
  - Red flags identified

- **Recommendation:**
  - Proceed / Manual Review / Reject
  - With brief reasoning

**Scheduling Call Analysis:**
- Email verification status (boolean)
- Corrected email (if provided by candidate)
- Assessment date (YYYY-MM-DD)
- Assessment time (HH:MM)
- Candidate confirmation status
- Call outcome summary

---

### 5. **Auto-Scheduling System** ⏰

#### Qualification-Based Triggering
- Automatically triggers when `tech_score > 40%`
- Configurable threshold via environment variable
- 2-minute delay (configurable)

#### Scheduling Call Features
- Email verification dialog
- Handles email corrections
- Flexible date/time parsing
- Natural language understanding:
  - "Tomorrow"
  - "Monday"
  - "3 PM"
  - "December 10"

#### Assessment Link Generation
- Unique UUID-based tokens
- Candidate-specific URLs
- Secure and trackable

---

### 6. **Email System** 📧

#### Professional Email Templates
- Branded HTML emails
- Mobile-responsive design
- Clear call-to-action buttons

#### Assessment Email Contains:
- Personalized greeting
- Congratulatory message
- Scheduled date and time
- Assessment duration (30-45 mins)
- Format details (remote, laptop/desktop)
- Important instructions:
  - Stable internet required
  - Quiet environment
  - Valid ID ready
  - VPN disabled
- Assessment link button
- Contact information
- Company branding

#### Email Service Integration
- Supports Gmail, Outlook, custom SMTP
- App password authentication
- Delivery confirmation
- Error handling

---

### 7. **PostgreSQL Database** 🗄️

#### Production-Ready Features
- ACID compliance
- Concurrent access support
- Referential integrity
- Automatic timestamps
- Indexed columns for performance

#### Schema Design

**candidates table:**
- Complete candidate information
- Call tracking (screening + scheduling)
- Transcript storage
- Assessment details
- Batch association

**call_logs table:**
- Historical call tracking
- Multiple attempts per candidate
- Call type differentiation
- Transcript archival

**batches table:**
- Upload batch tracking
- Success/failure/duplicate counts
- Timestamp tracking

#### Automatic Features
- `updated_at` auto-updates via trigger
- Foreign key constraints
- Cascade deletions
- Performance indexes

---

### 8. **Real-Time Dashboard** 💻

#### Live Statistics
- Total candidates
- Pending calls
- Currently calling
- Completed calls
- Qualified candidates
- Rejected candidates
- Assessments scheduled

#### View Modes
- **Latest Batch:** Most recent upload
- **All Candidates:** Complete database

#### Auto-Refresh
- Updates every 30 seconds
- No manual refresh needed
- Real-time pipeline visibility

#### Candidate Management
- Individual call initiation
- Bulk calling (all pending)
- Status indicators with color coding
- Tech score visualization
- Assessment scheduling status

---

### 9. **Webhook System** 🔗

#### Bolna Integration
- Receives call completion data
- Extracts run_id for matching
- Processes transcript automatically

#### Webhook Processing Flow
1. Receives webhook POST request
2. Extracts run_id from payload
3. Matches to candidate in database
4. Determines call type (screening vs scheduling)
5. Routes to appropriate processor
6. Analyzes transcript with OpenAI
7. Updates candidate record
8. Logs call details
9. Triggers next action if needed

#### Debugging Features
- Last webhook payload viewer
- Detailed console logging
- Error tracking

---

### 10. **Follow-Up System** 🔄

#### Smart Retry Logic
- Automatic follow-up scheduling for failed calls
- Configurable maximum attempts
- Intelligent timing:
  - Before 2 PM → next call at 4 PM
  - After 2 PM → next call at 10 AM next day

#### Status Management
- "Follow-Up Scheduled" status
- "No Response - Max Attempts" after limit
- Failed attempt counter
- Next call time display

---

### 11. **Modular Architecture** 🏗️

#### Separation of Concerns
- **Models:** Database operations
- **Services:** Business logic
- **Controllers:** Request handling
- **Routes:** API endpoints
- **Utils:** Helper functions

#### Benefits
- Easy to maintain
- Simple to extend
- Clear code organization
- Testable components
- Reusable modules

---

### 12. **Error Handling** 🛡️

#### Comprehensive Coverage
- Database connection errors
- API failures (OpenAI, Bolna, Email)
- File processing errors
- Validation errors
- Webhook processing errors

#### Graceful Degradation
- Default values for failed extractions
- Retry logic for transient failures
- Clear error messages to users
- Detailed logging for debugging

---

### 13. **Security Features** 🔒

#### Data Protection
- Environment variable isolation
- No hardcoded credentials
- SQL injection prevention (parameterized queries)
- Unique phone number enforcement

#### API Security
- CORS configuration
- Request size limits
- File type validation (PDF only)
- Error message sanitization

---

### 14. **Performance Optimizations** ⚡

#### Database Indexes
- Phone number (for deduplication)
- Status (for filtering)
- Batch ID (for grouping)
- Created timestamp (for sorting)

#### Efficient Queries
- Parameterized statements
- Limited result sets
- Optimized joins
- Proper connection pooling

#### Scalability
- Asynchronous operations
- Non-blocking I/O
- Efficient file handling
- Temporary file cleanup

---

### 15. **Monitoring & Debugging** 🔍

#### Logging System
- Detailed console output
- Color-coded log levels
- Timestamp tracking
- Request/response logging

#### Debug Endpoints
- `/api/health` - Health check
- `/api/webhook/last` - Last webhook payload
- `/api/bolna/agent` - Agent configuration

#### Statistics Dashboard
- Real-time pipeline metrics
- Batch-level analytics
- Call success rates
- Processing statistics

---

## Configuration Options

All features are highly configurable via environment variables:

```env
# Thresholds
TECH_SCORE_THRESHOLD=40          # Qualification cutoff
MAX_CALL_ATTEMPTS=2              # Retry limit

# Timing
AUTO_SCHEDULE_DELAY_MS=120000    # 2 minutes delay

# URLs
ASSESSMENT_BASE_URL=https://...  # Assessment platform

# Email
EMAIL_FROM_NAME=Mindmap Digital  # Sender name
EMAIL_SERVICE=gmail              # Email provider
```

---

## Technology Stack

- **Backend:** Node.js + Express
- **Database:** PostgreSQL 14+
- **AI:** OpenAI GPT-4 (gpt-4o-mini)
- **Calling:** Bolna.ai API
- **Email:** Nodemailer
- **File Processing:** pdf-parse
- **Frontend:** Vanilla HTML/CSS/JavaScript

---

## Future Enhancement Ideas

- [ ] WhatsApp integration for notifications
- [ ] Advanced analytics dashboard
- [ ] Interview scheduling calendar
- [ ] Candidate self-service portal
- [ ] Multi-language support
- [ ] Custom scoring criteria per role
- [ ] Integration with ATS systems
- [ ] Video interview scheduling
- [ ] Automated background verification
- [ ] AI-powered interview question generation

---

**This is a complete, production-ready recruitment automation platform!** 🚀

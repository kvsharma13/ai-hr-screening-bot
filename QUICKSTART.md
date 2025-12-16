# 🚀 QUICK START GUIDE

## 5-Minute Setup

### 1. Prerequisites Check
```bash
# Check Node.js (need v18+)
node --version

# Check PostgreSQL (need v14+)
psql --version

# Check npm
npm --version
```

Don't have them? Install:
- Node.js: https://nodejs.org/
- PostgreSQL: https://www.postgresql.org/download/

---

### 2. Install Dependencies
```bash
cd recruitment-app
npm install
```

---

### 3. Setup PostgreSQL Database

**Quick local setup:**
```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE recruitment_db;

# Exit
\q
```

---

### 4. Configure Environment

**Copy template:**
```bash
cp .env.example .env
```

**Edit .env (minimum required):**
```env
# Database
DB_PASSWORD=your_postgres_password

# OpenAI
OPENAI_API_KEY=sk-your-key-here

# Bolna
BOLNA_API_KEY=your-key-here
BOLNA_AGENT_ID=your-agent-id-here

# Email (Gmail)
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-char-app-password
```

---

### 5. Create Database Tables
```bash
npm run migrate
```

Expected output:
```
✓ Database schema created successfully
✓ Tables created: batches, candidates, call_logs
```

---

### 6. Start Application
```bash
npm start
```

Expected output:
```
✓ Database connected successfully
🚀 AI RECRUITMENT SYSTEM STARTED
Server: http://localhost:3000
```

---

### 7. Configure Bolna Webhook

**For local testing:**
```bash
# In a new terminal, install ngrok
npm install -g ngrok

# Start ngrok
ngrok http 3000
```

Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)

**Go to Bolna Dashboard:**
1. Open https://app.bolna.ai/
2. Go to your agent settings
3. Set Webhook URL: `https://abc123.ngrok.io/api/webhook/bolna`
4. Save

---

### 8. Test the System

1. **Open dashboard:** `http://localhost:3000`
2. **Upload a test resume** (PDF)
3. **Click "Call" button** next to candidate
4. **Watch the magic happen!** ✨

---

## ✅ Verification Checklist

- [ ] Node.js v18+ installed
- [ ] PostgreSQL v14+ installed
- [ ] Database created (`recruitment_db`)
- [ ] `.env` file configured with all keys
- [ ] Migration completed successfully
- [ ] Application starts without errors
- [ ] Dashboard accessible at http://localhost:3000
- [ ] Bolna webhook configured
- [ ] Test resume uploaded successfully
- [ ] Test call initiated successfully

---

## 🆘 Common Issues

### "Cannot connect to database"
```bash
# Check if PostgreSQL is running
sudo service postgresql status

# Start it
sudo service postgresql start
```

### "OPENAI_API_KEY is invalid"
- Get a new key from: https://platform.openai.com/api-keys
- Ensure no spaces in .env file
- Restart application after changing .env

### "Bolna webhook not receiving"
- Use ngrok for local testing
- Update webhook URL in Bolna dashboard
- Check firewall isn't blocking port 3000

### "Email not sending"
- Use Gmail App Password (not regular password)
- Enable 2FA first: https://myaccount.google.com/security
- Generate App Password: https://myaccount.google.com/apppasswords

---

## 📱 Need Help?

Check the full README.md for:
- Detailed API documentation
- Database schema
- Troubleshooting guide
- Production deployment

---

**You're ready to go! 🎉**

Open http://localhost:3000 and start automating your recruitment!

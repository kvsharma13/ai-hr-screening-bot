// src/services/transcript.service.js
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class TranscriptService {
  
  /**
   * Analyze screening call transcript with detailed scoring
   */
  static async analyzeScreeningTranscript(transcript, candidateSkills, jobRequirements = {}) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert recruiter analyzing phone screening transcripts. Provide accurate, data-driven scoring. Return ONLY valid JSON.'
          },
          {
            role: 'user',
            content: `Analyze this phone screening transcript and provide detailed scoring:

Candidate's Listed Skills: ${candidateSkills}

Job Requirements:
- Required Notice Period: ${jobRequirements.required_notice_period || 'Not specified'}
- Budget Range: ${jobRequirements.budget_min_lpa || 'N/A'} - ${jobRequirements.budget_max_lpa || 'N/A'} LPA
- Location: ${jobRequirements.location || 'Not specified'}
- Experience: ${jobRequirements.min_experience || 'N/A'} - ${jobRequirements.max_experience || 'N/A'} years
- Required Skills: ${jobRequirements.required_skills || 'Not specified'}

Transcript:
${transcript}

Return ONLY this JSON structure (no markdown, no extra text):
{
  "callback_requested": <boolean: true if candidate said they're busy/not free>,
  "callback_time": "<extracted callback time or null>",
  "callback_reason": "<reason for callback or null>",
  
  "candidate_notice_period": "<extracted notice period from candidate's response>",
  "candidate_budget_lpa": <number: candidate's salary expectation in LPA, null if not mentioned>,
  "candidate_location": "<candidate's preferred location or null>",
  
  "notice_period_score": <number 0-10: 10 if immediate, 8-9 if <=15 days, 6-7 if <=30 days, 3-5 if >30 days, 0 if much longer than required>,
  "budget_score": <number 0-10: 10 if within range, 7-9 if slightly above, 5-6 if negotiable, 0-4 if far above range>,
  "location_score": <number 0-10: 10 if exact match, 5-8 if willing to relocate, 0-4 if not willing>,
  "experience_score": <number 0-10: 10 if perfect match, 7-9 if close, 5-6 if acceptable, 0-4 if too low/high>,
  "technical_score": <number 0-40: based on technical answers quality>,
  "confidence_fluency_score": <number 0-10: communication clarity and confidence>,
  
  "job_interest": "<High/Medium/Low>",
  "summary": "<2-3 sentence summary>",
  "key_points": ["<point 1>", "<point 2>"],
  "red_flags": ["<flag 1>" or empty array],
  "recommendation": "<Proceed/Manual Review/Reject>"
}

SCORING GUIDELINES:

1. NOTICE PERIOD SCORE (0-10):
   - Immediate: 10
   - ≤15 days: 8-9
   - 16-30 days: 6-7
   - 31-45 days: 4-5
   - >45 days: 0-3

2. BUDGET SCORE (0-10):
   - Within range: 10
   - 10-15% above: 7-9
   - 15-25% above: 5-6
   - >25% above: 0-4
   - Not mentioned: 5 (neutral)

3. LOCATION SCORE (0-10):
   - Exact match: 10
   - Willing to relocate: 7-8
   - Open to remote: 5-8
   - Not willing: 0-4

4. EXPERIENCE SCORE (0-10):
   - Perfect match: 10
   - Within ±1 year: 8-9
   - Within ±2 years: 6-7
   - Further: 0-5

5. TECHNICAL SCORE (0-40):
   - Excellent answers: 32-40
   - Good understanding: 24-31
   - Basic knowledge: 16-23
   - Weak: 0-15
   - If callback requested: null

6. CONFIDENCE/FLUENCY SCORE (0-10):
   - Excellent communication: 9-10
   - Good: 7-8
   - Average: 5-6
   - Poor: 0-4

CALLBACK DETECTION:
- Set callback_requested to TRUE if candidate said: "I'm busy", "Not now", "Call me later", etc.
- If callback was requested, set technical_score to null (no screening happened)`
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
      });

      const response = completion.choices?.[0]?.message?.content;
      if (!response) {
        throw new Error('Empty response from OpenAI');
      }

      const cleaned = response
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      const analysis = JSON.parse(cleaned);

      // Calculate total score
      let totalScore = 0;
      if (!analysis.callback_requested && analysis.technical_score !== null) {
        totalScore = (
          (analysis.notice_period_score || 0) +
          (analysis.budget_score || 0) +
          (analysis.location_score || 0) +
          (analysis.experience_score || 0) +
          (analysis.technical_score || 0) +
          (analysis.confidence_fluency_score || 0)
        );
      }

      // Validate and normalize
      return {
        callback_requested: analysis.callback_requested || false,
        callback_time: analysis.callback_time || null,
        callback_reason: analysis.callback_reason || null,
        
        candidate_notice_period: analysis.candidate_notice_period || null,
        candidate_budget_lpa: analysis.candidate_budget_lpa || null,
        candidate_location: analysis.candidate_location || null,
        
        notice_period_score: this.validateScore(analysis.notice_period_score, 10),
        budget_score: this.validateScore(analysis.budget_score, 10),
        location_score: this.validateScore(analysis.location_score, 10),
        experience_score: this.validateScore(analysis.experience_score, 10),
        technical_score: this.validateScore(analysis.technical_score, 40),
        confidence_fluency_score: this.validateScore(analysis.confidence_fluency_score, 10),
        total_score: totalScore,
        
        job_interest: analysis.job_interest || 'Not asked',
        conversation_summary: analysis.summary || 'Analysis unavailable',
        key_points: Array.isArray(analysis.key_points) ? analysis.key_points : [],
        red_flags: Array.isArray(analysis.red_flags) ? analysis.red_flags : [],
        recommendation: analysis.recommendation || 'Manual Review'
      };

    } catch (error) {
      console.error('Transcript analysis error:', error.message);
      
      return {
        callback_requested: false,
        callback_time: null,
        callback_reason: null,
        candidate_notice_period: null,
        candidate_budget_lpa: null,
        candidate_location: null,
        notice_period_score: null,
        budget_score: null,
        location_score: null,
        experience_score: null,
        technical_score: null,
        confidence_fluency_score: null,
        total_score: 0,
        job_interest: 'Not analyzed',
        conversation_summary: 'Automatic analysis failed. Manual review required.',
        key_points: [],
        red_flags: ['Automatic analysis failed'],
        recommendation: 'Manual Review'
      };
    }
  }

  /**
   * Parse callback time to actual timestamp
   */
  static parseCallbackTime(callbackTimeString) {
    if (!callbackTimeString) return null;

    try {
      const now = new Date();
      const lowerStr = callbackTimeString.toLowerCase();

      // Handle relative times
      if (lowerStr.includes('in') && lowerStr.includes('hour')) {
        const hours = parseInt(lowerStr.match(/\d+/)?.[0] || 1);
        return new Date(now.getTime() + hours * 60 * 60 * 1000);
      }

      if (lowerStr.includes('in') && lowerStr.includes('minute')) {
        const minutes = parseInt(lowerStr.match(/\d+/)?.[0] || 30);
        return new Date(now.getTime() + minutes * 60 * 1000);
      }

      // Handle "tomorrow"
      if (lowerStr.includes('tomorrow')) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const timeMatch = lowerStr.match(/(\d+)\s*(am|pm|:)/i);
        if (timeMatch) {
          const hour = parseInt(timeMatch[1]);
          const isPM = lowerStr.includes('pm');
          tomorrow.setHours(isPM && hour !== 12 ? hour + 12 : hour, 0, 0, 0);
        } else if (lowerStr.includes('morning')) {
          tomorrow.setHours(10, 0, 0, 0);
        } else if (lowerStr.includes('afternoon')) {
          tomorrow.setHours(14, 0, 0, 0);
        } else if (lowerStr.includes('evening')) {
          tomorrow.setHours(18, 0, 0, 0);
        } else {
          tomorrow.setHours(10, 0, 0, 0);
        }
        return tomorrow;
      }

      // Handle "today evening/afternoon"
      if (lowerStr.includes('today') || lowerStr.includes('evening') || lowerStr.includes('afternoon')) {
        const today = new Date(now);
        
        if (lowerStr.includes('evening') || lowerStr.includes('after 6')) {
          today.setHours(18, 0, 0, 0);
        } else if (lowerStr.includes('afternoon')) {
          today.setHours(14, 0, 0, 0);
        } else {
          const timeMatch = lowerStr.match(/(\d+)\s*(am|pm|:)/i);
          if (timeMatch) {
            const hour = parseInt(timeMatch[1]);
            const isPM = lowerStr.includes('pm');
            today.setHours(isPM && hour !== 12 ? hour + 12 : hour, 0, 0, 0);
          }
        }
        return today;
      }

      // Handle specific time today
      const timeMatch = lowerStr.match(/(\d+):?(\d+)?\s*(am|pm)/i);
      if (timeMatch) {
        const today = new Date(now);
        const hour = parseInt(timeMatch[1]);
        const minute = parseInt(timeMatch[2] || '0');
        const isPM = timeMatch[3].toLowerCase() === 'pm';
        
        today.setHours(isPM && hour !== 12 ? hour + 12 : hour, minute, 0, 0);
        
        if (today < now) {
          today.setDate(today.getDate() + 1);
        }
        
        return today;
      }

      // Handle day of week
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      for (let i = 0; i < days.length; i++) {
        if (lowerStr.includes(days[i])) {
          const targetDay = i;
          const currentDay = now.getDay();
          const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;
          
          const targetDate = new Date(now);
          targetDate.setDate(now.getDate() + daysUntilTarget);
          
          const timeMatch = lowerStr.match(/(\d+)\s*(am|pm)/i);
          if (timeMatch) {
            const hour = parseInt(timeMatch[1]);
            const isPM = lowerStr.includes('pm');
            targetDate.setHours(isPM && hour !== 12 ? hour + 12 : hour, 0, 0, 0);
          } else {
            targetDate.setHours(10, 0, 0, 0);
          }
          
          return targetDate;
        }
      }

      return new Date(now.getTime() + 2 * 60 * 60 * 1000);

    } catch (error) {
      console.error('Error parsing callback time:', error.message);
      return new Date(Date.now() + 2 * 60 * 60 * 1000);
    }
  }

  /**
   * Analyze scheduling call transcript
   */
  static async analyzeSchedulingTranscript(transcript) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are analyzing an assessment scheduling call. Extract email verification and scheduling details. Return ONLY valid JSON.'
          },
          {
            role: 'user',
            content: `Analyze this scheduling call transcript:

Transcript:
${transcript}

Return ONLY this JSON (no markdown):
{
  "email_verified": <boolean: true if candidate confirmed email>,
  "verified_email": "<email address if candidate provided new one, otherwise null>",
  "assessment_date": "<date in YYYY-MM-DD format if scheduled, otherwise null>",
  "assessment_time": "<time in HH:MM format if scheduled, otherwise null>",
  "candidate_confirmed": <boolean: true if candidate confirmed the slot>,
  "summary": "<brief summary>"
}`
          }
        ],
        temperature: 0.2,
        max_tokens: 500
      });

      const response = completion.choices?.[0]?.message?.content;
      if (!response) throw new Error('Empty response from OpenAI');

      const cleaned = response.replace(/```json/gi, '').replace(/```/g, '').trim();
      const analysis = JSON.parse(cleaned);

      return {
        email_verified: analysis.email_verified || false,
        verified_email: analysis.verified_email || null,
        assessment_date: analysis.assessment_date || null,
        assessment_time: analysis.assessment_time || null,
        candidate_confirmed: analysis.candidate_confirmed || false,
        summary: analysis.summary || 'Scheduling call completed'
      };

    } catch (error) {
      console.error('Scheduling transcript analysis error:', error.message);
      
      return {
        email_verified: false,
        verified_email: null,
        assessment_date: null,
        assessment_time: null,
        candidate_confirmed: false,
        summary: 'Analysis failed. Manual review required.'
      };
    }
  }

  /**
   * Validate and normalize scores
   */
  static validateScore(score, max = 100) {
    if (score === null || score === undefined || isNaN(score)) {
      return null;
    }
    const num = parseFloat(score);
    return Math.max(0, Math.min(max, num));
  }

  /**
   * Convert transcript array to text
   */
  static normalizeTranscript(transcript) {
    if (!transcript) return '';
    if (typeof transcript === 'string') return transcript;

    if (Array.isArray(transcript)) {
      return transcript.map(msg => {
        if (typeof msg === 'string') return msg;
        if (msg.role && msg.content) return `${msg.role}: ${msg.content}`;
        if (msg.speaker && msg.text) return `${msg.speaker}: ${msg.text}`;
        return JSON.stringify(msg);
      }).join('\n\n');
    }

    if (typeof transcript === 'object') {
      return JSON.stringify(transcript, null, 2);
    }

    return '';
  }
}

module.exports = TranscriptService;
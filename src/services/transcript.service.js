// src/services/transcript.service.js
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class TranscriptService {
  
  /**
   * Analyze screening call transcript and extract insights
   */
  static async analyzeScreeningTranscript(transcript, candidateSkills) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert recruiter analyzing phone screening transcripts. Provide accurate, data-driven assessments. Return ONLY valid JSON.'
          },
          {
            role: 'user',
            content: `Analyze this phone screening transcript and provide insights in JSON format:

Candidate's Listed Skills: ${candidateSkills}

Transcript:
${transcript}

Return ONLY this JSON structure (no markdown, no extra text):
{
  "technical_score": <number 0-100 based on technical knowledge demonstrated>,
  "job_interest": "<string: High/Medium/Low based on enthusiasm>",
  "notice_period": "<extracted notice period or 'Not mentioned'>",
  "confidence_score": <number 1-10 based on communication clarity>,
  "summary": "<2-3 sentence summary of the conversation>",
  "key_points": [
    "<important point 1>",
    "<important point 2>"
  ],
  "red_flags": [
    "<any concerns or red flags, or empty array>"
  ],
  "recommendation": "<Proceed/Manual Review/Reject with brief reason>"
}

Scoring Guide:
- technical_score: 
  * 80-100: Excellent technical knowledge, clear explanations
  * 60-79: Good understanding, some gaps
  * 40-59: Basic knowledge, needs improvement
  * 0-39: Insufficient technical knowledge
- confidence_score: Rate communication clarity, coherence, professionalism (1-10)
- job_interest: Based on their responses about job change motivation`
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
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

      // Validate and normalize
      return {
        tech_score: this.validateScore(analysis.technical_score),
        job_interest: analysis.job_interest || 'Not mentioned',
        notice_period: analysis.notice_period || 'Not mentioned',
        confidence_score: this.validateScore(analysis.confidence_score, 10),
        conversation_summary: analysis.summary || 'Analysis unavailable',
        key_points: Array.isArray(analysis.key_points) ? analysis.key_points : [],
        red_flags: Array.isArray(analysis.red_flags) ? analysis.red_flags : [],
        recommendation: analysis.recommendation || 'Manual Review'
      };

    } catch (error) {
      console.error('Transcript analysis error:', error.message);
      
      // Return default analysis if OpenAI fails
      return {
        tech_score: null,
        job_interest: 'Not analyzed',
        notice_period: 'Not mentioned',
        confidence_score: null,
        conversation_summary: 'Automatic analysis failed. Manual review required.',
        key_points: [],
        red_flags: ['Automatic analysis failed'],
        recommendation: 'Manual Review'
      };
    }
  }

  /**
   * Analyze scheduling call transcript to extract email and assessment details
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
            content: `Analyze this scheduling call transcript and extract information:

Transcript:
${transcript}

Return ONLY this JSON (no markdown):
{
  "email_verified": <boolean: true if candidate confirmed email>,
  "verified_email": "<email address if candidate provided new one, otherwise null>",
  "assessment_date": "<date in YYYY-MM-DD format if scheduled, otherwise null>",
  "assessment_time": "<time in HH:MM format if scheduled, otherwise null>",
  "candidate_confirmed": <boolean: true if candidate confirmed the slot>,
  "summary": "<brief summary of the call outcome>"
}

Extract dates/times carefully. Common formats:
- "Tomorrow" = calculate next day
- "Monday", "Tuesday" etc = next occurrence
- "3 PM", "15:00", "3 o'clock" = parse time
- "December 10" = use current year if not specified`
          }
        ],
        temperature: 0.2,
        max_tokens: 500
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
   * Convert transcript array to text (if Bolna sends structured format)
   */
  static normalizeTranscript(transcript) {
    if (!transcript) return '';

    if (typeof transcript === 'string') {
      return transcript;
    }

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

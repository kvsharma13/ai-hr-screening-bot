// src/services/transcript.service.js
const OpenAI = require('openai');
const JobRequirementsModel = require('../models/jobRequirements.model');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class TranscriptService {
  
  /**
   * Analyze screening call transcript with multi-criteria scoring
   * Scores based on job requirements: notice period, budget, location, experience, technical skills, communication
   */
  static async analyzeScreeningTranscript(transcript, candidateSkills, candidateExperience, candidateNoticePeriod) {
    try {
      // Load job requirements
      const jobReqs = await JobRequirementsModel.getCurrent();
      
      // Build scoring criteria for OpenAI
      let scoringCriteria = `
SCORING SYSTEM (Total: 140 points, convert to percentage at end):

1. NOTICE PERIOD SCORE (0 or 20 points):
   ${jobReqs && jobReqs.notice_period 
     ? `- Award 20 points if candidate's notice period is ${jobReqs.notice_period} days or less
   - Award 0 points otherwise
   - Extract notice period from transcript (immediate, 15 days, 1 month = 30 days, 2 months = 60 days, etc.)`
     : '- Award 20 points (no requirement set)'}

2. BUDGET/SALARY SCORE (0 or 20 points):
   ${jobReqs && jobReqs.budget
     ? `- Award 20 points if candidate's salary expectation is ${jobReqs.budget} LPA or less
   - Award 0 points if expectation is more than ${jobReqs.budget} LPA
   - Extract salary expectation from transcript`
     : '- Award 20 points (no requirement set)'}

3. LOCATION SCORE (0 or 20 points):
   ${jobReqs && jobReqs.location
     ? `- Award 20 points if candidate is in ${jobReqs.location} OR willing to relocate to ${jobReqs.location}
   - Award 0 points if unwilling to relocate or wrong location preference
   - Extract location preference from transcript`
     : '- Award 20 points (no requirement set)'}

4. EXPERIENCE SCORE (0 or 20 points):
   ${jobReqs && jobReqs.min_experience
     ? `- Award 20 points if candidate has ${jobReqs.min_experience}+ years of experience
   - Award 0 points if less than ${jobReqs.min_experience} years
   - Verify experience from transcript, fallback to resume: ${candidateExperience} years`
     : '- Award 20 points (no requirement set)'}

5. TECHNICAL SKILLS SCORE (0 to 40 points):
   - Evaluate technical knowledge demonstrated in the call
   - Candidate's skills: ${candidateSkills}
   - Score based on:
     * Depth of answers to technical questions (0-15 points)
     * Practical experience demonstrated (0-15 points)
     * Clarity and confidence in technical discussion (0-10 points)
   - 35-40: Excellent technical knowledge
   - 25-34: Good understanding
   - 15-24: Basic knowledge
   - 0-14: Insufficient knowledge

6. COMMUNICATION SCORE (0 to 20 points):
   - Based on confidence score (1-10 scale) × 2
   - Evaluate: clarity, coherence, professionalism, enthusiasm
   - 1-3: Poor communication
   - 4-6: Average communication
   - 7-8: Good communication
   - 9-10: Excellent communication

FINAL CALCULATION:
overall_score = (notice_period_score + budget_score + location_score + experience_score + technical_score + communication_score) / 140 × 100
`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert recruiter analyzing phone screening transcripts. Provide accurate, data-driven assessments based on specific job requirements. Return ONLY valid JSON.'
          },
          {
            role: 'user',
            content: `Analyze this phone screening transcript and score the candidate based on job requirements.

CANDIDATE INFO:
- Skills from Resume: ${candidateSkills}
- Experience from Resume: ${candidateExperience} years
- Notice Period from Resume: ${candidateNoticePeriod}

JOB REQUIREMENTS:
${jobReqs ? `
- Notice Period: ≤ ${jobReqs.notice_period || 'Not specified'} days
- Budget: ≤ ${jobReqs.budget || 'Not specified'} LPA
- Location: ${jobReqs.location || 'Not specified'}
- Min Experience: ${jobReqs.min_experience || 'Not specified'} years
- Required Skills: ${jobReqs.required_skills ? jobReqs.required_skills.join(', ') : 'Not specified'}
` : 'No specific requirements set'}

TRANSCRIPT:
${transcript}

${scoringCriteria}

Return ONLY this JSON structure (no markdown, no extra text):
{
  "notice_period_score": <0 or 20>,
  "notice_period_mentioned": "<extracted notice period or 'Not mentioned'>",
  "notice_period_match": <true/false>,
  
  "budget_score": <0 or 20>,
  "salary_expectation": "<extracted salary or 'Not mentioned'>",
  "budget_match": <true/false>,
  
  "location_score": <0 or 20>,
  "location_preference": "<extracted location preference or 'Not mentioned'>",
  "location_match": <true/false>,
  
  "experience_score": <0 or 20>,
  "experience_mentioned": "<extracted experience or use resume value>",
  "experience_match": <true/false>,
  
  "technical_score": <0-40>,
  "technical_assessment": "<brief assessment of technical answers>",
  
  "communication_score": <0-20>,
  "confidence_rating": <1-10>,
  
  "overall_qualification_score": <calculated percentage 0-100>,
  
  "job_interest": "<High/Medium/Low based on enthusiasm>",
  "conversation_summary": "<2-3 sentence summary>",
  "key_strengths": ["<strength 1>", "<strength 2>"],
  "key_concerns": ["<concern 1>", "<concern 2>"],
  "recommendation": "<Proceed/Manual Review/Reject with brief reason>"
}

IMPORTANT:
- Be strict but fair in scoring
- If information is not mentioned in transcript, mark as "Not mentioned" and give 0 points for that criterion
- Calculate overall_score accurately: sum all scores, divide by 140, multiply by 100
- Round overall_score to 2 decimal places`
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

      // Validate and prepare detailed breakdown
      const breakdown = {
        notice_period: {
          score: analysis.notice_period_score || 0,
          mentioned: analysis.notice_period_mentioned || 'Not mentioned',
          match: analysis.notice_period_match || false,
          required: jobReqs?.notice_period || 'Not specified'
        },
        budget: {
          score: analysis.budget_score || 0,
          expectation: analysis.salary_expectation || 'Not mentioned',
          match: analysis.budget_match || false,
          required: jobReqs?.budget || 'Not specified'
        },
        location: {
          score: analysis.location_score || 0,
          preference: analysis.location_preference || 'Not mentioned',
          match: analysis.location_match || false,
          required: jobReqs?.location || 'Not specified'
        },
        experience: {
          score: analysis.experience_score || 0,
          mentioned: analysis.experience_mentioned || candidateExperience,
          match: analysis.experience_match || false,
          required: jobReqs?.min_experience || 'Not specified'
        },
        technical: {
          score: analysis.technical_score || 0,
          max: 40,
          assessment: analysis.technical_assessment || 'Not assessed'
        },
        communication: {
          score: analysis.communication_score || 0,
          max: 20,
          confidence_rating: analysis.confidence_rating || 5
        }
      };

      // Calculate overall score
      const totalPoints = 
        breakdown.notice_period.score +
        breakdown.budget.score +
        breakdown.location.score +
        breakdown.experience.score +
        breakdown.technical.score +
        breakdown.communication.score;

      const overallScore = Math.round((totalPoints / 140) * 100 * 100) / 100; // Round to 2 decimals

      return {
        // Individual criterion scores
        notice_period_score: breakdown.notice_period.score,
        budget_score: breakdown.budget.score,
        location_score: breakdown.location.score,
        experience_score: breakdown.experience.score,
        technical_score: breakdown.technical.score,
        communication_score: breakdown.communication.score,
        
        // Overall score
        overall_qualification_score: overallScore,
        
        // Detailed breakdown
        qualification_breakdown: breakdown,
        
        // Additional info
        conversation_summary: analysis.conversation_summary || 'Analysis completed',
        job_interest: analysis.job_interest || 'Not mentioned',
        key_strengths: Array.isArray(analysis.key_strengths) ? analysis.key_strengths : [],
        key_concerns: Array.isArray(analysis.key_concerns) ? analysis.key_concerns : [],
        recommendation: analysis.recommendation || 'Manual Review',
        
        // Legacy fields (for backward compatibility)
        tech_score: breakdown.technical.score, // Out of 40, will be converted to percentage in display
        confidence_score: breakdown.communication.confidence_rating,
        notice_period: breakdown.notice_period.mentioned
      };

    } catch (error) {
      console.error('Transcript analysis error:', error.message);
      
      // Return default analysis if OpenAI fails
      return {
        notice_period_score: 0,
        budget_score: 0,
        location_score: 0,
        experience_score: 0,
        technical_score: 0,
        communication_score: 0,
        overall_qualification_score: 0,
        qualification_breakdown: {
          error: 'Analysis failed',
          message: error.message
        },
        conversation_summary: 'Automatic analysis failed. Manual review required.',
        job_interest: 'Not analyzed',
        key_strengths: [],
        key_concerns: ['Automatic analysis failed'],
        recommendation: 'Manual Review - Analysis Error',
        tech_score: null,
        confidence_score: null,
        notice_period: 'Not mentioned'
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
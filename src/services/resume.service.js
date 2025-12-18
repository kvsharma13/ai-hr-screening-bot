// src/services/resume.service.js
const fs = require('fs').promises;
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');
const JobRequirementsModel = require('../models/jobRequirements.model');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class ResumeService {
  
  /**
   * Extract text from PDF file
   */
  static async extractTextFromPDF(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } catch (error) {
      console.error('PDF extraction error:', error.message);
      throw new Error('Failed to extract text from PDF');
    }
  }

  /**
   * Parse resume using OpenAI to extract structured data
   */
  static async parseResume(resumeText) {
    try {
      console.log('Calling OpenAI API for resume parsing...');
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a resume parser. Extract candidate information and return ONLY valid JSON with no additional text or markdown.'
          },
          {
            role: 'user',
            content: `Extract the following information from this resume and return ONLY valid JSON:

{
  "name": "Full name of the candidate (look at the very top of resume)",
  "phone": "Phone number with country code (format: +91XXXXXXXXXX)",
  "email": "Email address",
  "skills": "Comma-separated list of ALL technical skills mentioned",
  "years_of_experience": "Total years as a number (if fresher or no experience, put 0)",
  "current_company": "Current or most recent company name",
  "notice_period": "Notice period if mentioned, otherwise 'Not specified'"
}

Resume text:
${resumeText.substring(0, 4000)}`
          }
        ],
        temperature: 0.2,
        max_tokens: 700
      });

      const response = completion.choices?.[0]?.message?.content;
      
      if (!response) {
        console.error('Empty response from OpenAI');
        throw new Error('Empty response from OpenAI');
      }

      console.log('OpenAI raw response:', response.substring(0, 200));

      // Clean response (remove markdown backticks if present)
      const cleaned = response
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (parseError) {
        console.error('JSON parse error. Response was:', cleaned);
        throw new Error('Failed to parse OpenAI response as JSON');
      }

      // Validate required fields
      return {
        name: parsed.name || 'Not available',
        phone: parsed.phone || 'Not available',
        email: parsed.email || 'Not available',
        skills: parsed.skills || 'Not available',
        years_of_experience: parsed.years_of_experience || 'Not available',
        current_company: parsed.current_company || 'Not available',
        notice_period: parsed.notice_period || 'Not specified'
      };

    } catch (error) {
      console.error('OpenAI parsing error:', error.message);
      
      // Log more details for debugging
      if (error.response) {
        console.error('OpenAI API Error Status:', error.response.status);
        console.error('OpenAI API Error Data:', error.response.data);
      }
      
      // Return fallback data if OpenAI fails
      return {
        name: 'Not available',
        phone: 'Not available',
        email: 'Not available',
        skills: 'Not available',
        years_of_experience: 'Not available',
        current_company: 'Not available',
        notice_period: 'Not specified'
      };
    }
  }

  /**
   * Check if candidate skills match job requirements
   */
  static async checkSkillMatch(candidateSkills) {
    try {
      // Get current job requirements
      const requirements = await JobRequirementsModel.getCurrent();
      
      if (!requirements || !requirements.required_skills || requirements.required_skills.length === 0) {
        console.log('No job requirements set - accepting all candidates');
        return {
          isMatch: true,
          matchedSkills: [],
          matchCount: 0,
          requiredSkills: [],
          reason: 'No requirements configured'
        };
      }

      // Normalize candidate skills
      const normalizedCandidateSkills = this.normalizeSkills(candidateSkills);
      const normalizedRequiredSkills = requirements.required_skills.map(s => s.toLowerCase().trim());

      console.log('Candidate skills (normalized):', normalizedCandidateSkills.slice(0, 10));
      console.log('Required skills:', normalizedRequiredSkills);

      // Find matches
      const matchedSkills = [];
      const minMatches = 2; // Configurable

      for (const requiredSkill of normalizedRequiredSkills) {
        for (const candidateSkill of normalizedCandidateSkills) {
          // Check for exact match or partial match
          if (candidateSkill.includes(requiredSkill) || requiredSkill.includes(candidateSkill)) {
            // Find original case-sensitive version
            const originalRequired = requirements.required_skills.find(
              s => s.toLowerCase().trim() === requiredSkill
            );
            if (originalRequired && !matchedSkills.includes(originalRequired)) {
              matchedSkills.push(originalRequired);
              break;
            }
          }
        }
      }

      const isMatch = matchedSkills.length >= minMatches;

      console.log(`Skill match result: ${matchedSkills.length}/${normalizedRequiredSkills.length} skills matched`);
      console.log(`Matched skills:`, matchedSkills);

      return {
        isMatch,
        matchedSkills,
        matchCount: matchedSkills.length,
        requiredSkills: requirements.required_skills,
        reason: isMatch 
          ? `Matched ${matchedSkills.length} required skills`
          : `Only ${matchedSkills.length} skills matched (minimum ${minMatches} required)`
      };

    } catch (error) {
      console.error('Skill matching error:', error.message);
      // Fail open - accept candidate if skill matching fails
      return {
        isMatch: true,
        matchedSkills: [],
        matchCount: 0,
        requiredSkills: [],
        reason: 'Skill matching error - accepted by default'
      };
    }
  }

  /**
   * Normalize skills string to array
   */
  static normalizeSkills(skillsString) {
    if (!skillsString || skillsString === 'Not available') {
      return [];
    }

    // Split by common separators
    const skills = skillsString
      .split(/[,;|\n]+/)
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 1);

    return skills;
  }

  /**
   * Parse experience string to number
   */
  static parseExperience(experienceStr) {
    if (!experienceStr || experienceStr === 'Not available') {
      return 0;
    }

    // Extract first number found
    const match = experienceStr.match(/(\d+(\.\d+)?)/);
    if (match) {
      return parseFloat(match[1]);
    }

    return 0;
  }

  /**
   * Extract name from email if name is not available
   */
  static extractNameFromEmail(email, extractedName) {
    if (extractedName && extractedName !== 'Not available') {
      return extractedName;
    }

    if (!email || email === 'Not available') {
      return 'Not available';
    }

    try {
      const emailPart = email.split('@')[0];
      const parts = emailPart.split(/[._\d]+/);
      const name = parts
        .filter((p) => p.length > 1)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');
      return name || 'Not available';
    } catch {
      return 'Not available';
    }
  }
}

module.exports = ResumeService;
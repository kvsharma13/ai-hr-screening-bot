// src/services/resume.service.js
const fs = require('fs').promises;
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');

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
        throw new Error('Empty response from OpenAI');
      }

      // Clean response (remove markdown backticks if present)
      const cleaned = response
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      const parsed = JSON.parse(cleaned);

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

// src/services/email.service.js
const nodemailer = require('nodemailer');

class EmailService {
  
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    this.fromName = process.env.EMAIL_FROM_NAME || 'Mindmap Digital';
    this.fromEmail = process.env.EMAIL_USER;
  }

  /**
   * Send assessment link email
   */
  async sendAssessmentLink(candidateData) {
    try {
      const { name, email, assessment_date, assessment_time, assessment_link } = candidateData;

      const mailOptions = {
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: email,
        subject: 'Your AI Technical Assessment - Mindmap Digital',
        html: this.getAssessmentEmailTemplate(name, assessment_date, assessment_time, assessment_link)
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('✓ Assessment email sent to:', email);
      console.log('Message ID:', info.messageId);

      return {
        success: true,
        messageId: info.messageId
      };

    } catch (error) {
      console.error('❌ Email sending error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Email template for assessment link
   */
  getAssessmentEmailTemplate(name, date, time, link) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px 10px 0 0;
            text-align: center;
        }
        .content {
            background: #ffffff;
            padding: 30px;
            border: 1px solid #e5e7eb;
            border-top: none;
        }
        .button {
            display: inline-block;
            background: #2563eb;
            color: white;
            padding: 14px 28px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            margin: 20px 0;
        }
        .info-box {
            background: #f3f4f6;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1 style="margin: 0; font-size: 28px;">🎯 AI Technical Assessment</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Mindmap Digital</p>
    </div>
    
    <div class="content">
        <p>Hi <strong>${name}</strong>,</p>
        
        <p>Congratulations on qualifying for the next round! We're excited to evaluate your technical skills through our AI-based assessment.</p>
        
        <div class="info-box">
            <h3 style="margin-top: 0; color: #2563eb;">📅 Your Assessment Details</h3>
            <p style="margin: 8px 0;"><strong>Date:</strong> ${date || 'To be confirmed'}</p>
            <p style="margin: 8px 0;"><strong>Time:</strong> ${time || 'To be confirmed'}</p>
            <p style="margin: 8px 0;"><strong>Duration:</strong> 30-45 minutes</p>
            <p style="margin: 8px 0;"><strong>Format:</strong> Remote (Laptop/Desktop required)</p>
        </div>
        
        <p><strong>Important Instructions:</strong></p>
        <ul style="line-height: 1.8;">
            <li>Use a laptop or desktop computer (mobile not supported)</li>
            <li>Ensure stable internet connection</li>
            <li>Find a quiet environment</li>
            <li>Keep valid ID proof ready</li>
            <li>Disable VPN if using one</li>
        </ul>
        
        <div style="text-align: center;">
            <a href="${link}" class="button">Start Assessment</a>
        </div>
        
        <p style="margin-top: 30px;">If you have any questions or need to reschedule, please reply to this email or call us at <strong>+91 80357 38463</strong>.</p>
        
        <p>Best regards,<br>
        <strong>Recruitment Team</strong><br>
        Mindmap Digital</p>
    </div>
    
    <div class="footer">
        <p>This is an automated email. Please do not reply directly to this message.</p>
        <p>© ${new Date().getFullYear()} Mindmap Digital. All rights reserved.</p>
    </div>
</body>
</html>
    `;
  }

  /**
   * Verify email configuration
   */
  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log('✓ Email service configured successfully');
      return true;
    } catch (error) {
      console.error('❌ Email service configuration error:', error.message);
      return false;
    }
  }
}

module.exports = new EmailService();

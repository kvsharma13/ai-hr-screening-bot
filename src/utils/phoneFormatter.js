// src/utils/phoneFormatter.js

/**
 * Normalize phone number to +91XXXXXXXXXX format for deduplication
 */
function normalizePhone(phone) {
  if (!phone || phone === 'Not available') {
    return null;
  }

  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');

  // Already has +91 prefix with 10 digits
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return '+' + cleaned;
  }

  // 10 digit Indian number
  if (cleaned.length === 10) {
    return '+91' + cleaned;
  }

  // 11 digits starting with 0 (remove leading 0)
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return '+91' + cleaned.substring(1);
  }

  // Has country code but no +
  if (cleaned.length > 10) {
    return '+' + cleaned;
  }

  // Invalid format
  return null;
}

/**
 * Format phone for display
 */
function formatPhoneDisplay(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return 'Not available';
  
  // Format as +91 XXXXX XXXXX
  const match = normalized.match(/\+91(\d{5})(\d{5})/);
  if (match) {
    return `+91 ${match[1]} ${match[2]}`;
  }
  
  return normalized;
}

/**
 * Validate Indian phone number
 */
function isValidIndianPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  
  // Check if it matches +91XXXXXXXXXX pattern
  return /^\+91\d{10}$/.test(normalized);
}

module.exports = {
  normalizePhone,
  formatPhoneDisplay,
  isValidIndianPhone
};

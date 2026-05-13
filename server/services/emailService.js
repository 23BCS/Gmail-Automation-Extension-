/**
 * Nodemailer Email Service
 * Handles Gmail SMTP connections and email sending
 */
const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

// Store dynamic transporter (can be updated via settings)
let transporter = null;

/**
 * Create a Gmail SMTP transporter
 */
const createTransporter = (user, appPassword) => {
  // Strip accidental surrounding quotes that dotenv preserves from .env files
  const gmailUser = (user || process.env.GMAIL_USER || '').replace(/^'+|'+$/g, '').trim();
  const gmailPass = (appPassword || process.env.GMAIL_APP_PASSWORD || '').replace(/^'+|'+$/g, '').trim();

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // TLS via STARTTLS
    auth: {
      user: gmailUser,
      pass: gmailPass
    },
    tls: {
      rejectUnauthorized: false
    },
    // Connection pooling for bulk sends
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5 // max 5 messages per second
  });
};

/**
 * Get or create transporter
 */
const getTransporter = (user, appPassword) => {
  if (!transporter || user || appPassword) {
    transporter = createTransporter(user, appPassword);
  }
  return transporter;
};

/**
 * Verify SMTP connection
 */
const verifyConnection = async (user, appPassword) => {
  try {
    const t = createTransporter(user, appPassword);
    await t.verify();
    logger.info('✅ SMTP connection verified successfully');
    return { success: true, message: 'Connection verified' };
  } catch (error) {
    logger.error('❌ SMTP verification failed:', error.message);
    return { success: false, message: error.message };
  }
};

/**
 * Replace placeholders in email content
 * Supports {{name}}, {{company}}, {{email}}, etc.
 */
const replacePlaceholders = (content, data) => {
  if (!content || !data) return content;
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
};

/**
 * Send a single email
 */
const sendEmail = async ({
  to,
  subject,
  htmlContent,
  textContent,
  attachments = [],
  fromName = 'Gmail Automation',
  placeholderData = {},
  smtpUser,
  smtpPass
}) => {
  try {
    const t = getTransporter(smtpUser, smtpPass);
    const fromEmail = (smtpUser || process.env.GMAIL_USER || '').replace(/^'+|'+$/g, '').trim();

    // Replace placeholders in subject and content
    const processedSubject = replacePlaceholders(subject, placeholderData);
    const processedHtml = replacePlaceholders(htmlContent, placeholderData);
    const processedText = textContent
      ? replacePlaceholders(textContent, placeholderData)
      : processedHtml.replace(/<[^>]*>/g, ''); // strip HTML for text version

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject: processedSubject,
      html: processedHtml,
      text: processedText,
      attachments: attachments.map(att => ({
        filename: att.originalname || att.filename,
        path: att.path,
        contentType: att.mimetype
      }))
    };

    const info = await t.sendMail(mailOptions);
    logger.info(`✅ Email sent to ${to} | MessageID: ${info.messageId}`);

    return {
      success: true,
      messageId: info.messageId,
      to,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`❌ Failed to send email to ${to}: ${error.message}`);
    return {
      success: false,
      to,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Sleep helper for delay between emails
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get random delay between min and max milliseconds
 */
const getRandomDelay = (minSec = 2, maxSec = 5) => {
  const min = minSec * 1000;
  const max = maxSec * 1000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

module.exports = {
  sendEmail,
  verifyConnection,
  getTransporter,
  replacePlaceholders,
  sleep,
  getRandomDelay
};
/**
 * Nodemailer Email Service — Fixed
 *
 * Bug fixes:
 * 1. .env not loaded → credentials always empty  → added defensive load + clear error
 * 2. connection pool=true with maxConnections=5  → Gmail blocks free accounts
 *    → removed pool, use fresh single connection per send (safer for Gmail)
 * 3. Cached broken transporter reused on every email
 *    → always create fresh transporter per send (avoids stale/closed connections)
 * 4. recipient.email had whitespace / \r\n from CSV → cleaned before send
 * 5. Empty htmlContent sent as empty string → Gmail delivers blank email
 *    → validate and fallback to plain text version
 * 6. fromName with special chars broke the From header → sanitized
 */

const nodemailer = require('nodemailer');
const { logger }  = require('../utils/logger');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip surrounding quotes + whitespace (dotenv sometimes preserves them) */
const clean = (val) => (val || '').replace(/^["'\s]+|["'\s]+$/g, '').trim();

/** Get Gmail credentials from env, with clear error messages */
const getCredentials = (userOverride, passOverride) => {
  const user = clean(userOverride) || clean(process.env.GMAIL_USER);
  const pass = clean(passOverride) || clean(process.env.GMAIL_APP_PASSWORD);

  if (!user) {
    throw new Error(
      'GMAIL_USER is not set. Add GMAIL_USER=yourname@gmail.com to server/.env and restart.'
    );
  }
  if (!pass) {
    throw new Error(
      'GMAIL_APP_PASSWORD is not set. Add your 16-char App Password to server/.env and restart.'
    );
  }
  if (!user.includes('@gmail.com') && !user.includes('@googlemail.com')) {
    throw new Error(`GMAIL_USER "${user}" does not look like a Gmail address.`);
  }
  // Gmail App Password is 16 chars (with or without spaces)
  const passClean = pass.replace(/\s/g, '');
  if (passClean.length !== 16) {
    logger.warn(
      `⚠️  GMAIL_APP_PASSWORD is ${passClean.length} chars — expected 16. ` +
      'Make sure you copied the full App Password from Google.'
    );
  }

  return { user, pass };
};

/**
 * Create a fresh Gmail SMTP transporter.
 * We do NOT use pool:true because:
 *   - Gmail free accounts close idle connections after ~30s
 *   - pool keeps them "alive" but they silently die → socket hang up errors
 *   - For bulk sends a fresh connection per email is safer and more reliable
 */
const createTransporter = (user, pass) => {
  return nodemailer.createTransport({
    host:   'smtp.gmail.com',
    port:   587,
    secure: false,           // STARTTLS on port 587
    auth:   { user, pass },
    tls:    { rejectUnauthorized: false },
    // No pool — fresh connection per send batch
    connectionTimeout: 10000,  // 10s to connect
    greetingTimeout:   10000,  // 10s for server greeting
    socketTimeout:     30000   // 30s for data transfer
  });
};

// ── Verify SMTP connection ────────────────────────────────────────────────────
const verifyConnection = async (userOverride, passOverride) => {
  try {
    const { user, pass } = getCredentials(userOverride, passOverride);
    const t = createTransporter(user, pass);
    await t.verify();
    await t.close();
    logger.info(`✅ SMTP verified for ${user}`);
    return { success: true, message: `Connected as ${user}` };
  } catch (error) {
    logger.error('❌ SMTP verify failed:', error.message);
    return { success: false, message: error.message };
  }
};

// ── Replace {{placeholder}} tokens in content ─────────────────────────────────
const replacePlaceholders = (content, data) => {
  if (!content || !data) return content || '';
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = data[key];
    return val !== undefined && val !== null && val !== '' ? String(val) : match;
  });
};

// ── Sanitize email address ────────────────────────────────────────────────────
const sanitizeEmail = (email) => {
  if (!email) return '';
  // Remove whitespace, newlines, tabs — common in CSV-parsed data
  return email.replace(/[\s\r\n\t]/g, '').toLowerCase().trim();
};

// ── Build plain-text fallback from HTML ───────────────────────────────────────
const htmlToText = (html) => {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// ── Main sendEmail function ───────────────────────────────────────────────────
const sendEmail = async ({
  to,
  subject,
  htmlContent,
  textContent,
  attachments  = [],
  fromName     = 'Gmail Automation',
  placeholderData = {},
  smtpUser,
  smtpPass
}) => {
  let transporter = null;

  try {
    // ── 1. Validate & clean the recipient address ──────────────────────────
    const toAddress = sanitizeEmail(to);
    if (!toAddress || !toAddress.includes('@') || !toAddress.includes('.')) {
      throw new Error(`Invalid recipient email address: "${to}"`);
    }

    // ── 2. Get credentials (throws with clear message if missing) ──────────
    const { user, pass } = getCredentials(smtpUser, smtpPass);

    // ── 3. Replace placeholders ────────────────────────────────────────────
    const processedSubject = replacePlaceholders(subject || '(No Subject)', placeholderData);
    const processedHtml    = replacePlaceholders(htmlContent || '', placeholderData);

    // ── 4. Validate content — never send a blank email ─────────────────────
    if (!processedHtml.trim()) {
      throw new Error('Email content is empty — nothing to send');
    }

    // ── 5. Build plain-text version ────────────────────────────────────────
    const processedText = textContent
      ? replacePlaceholders(textContent, placeholderData)
      : htmlToText(processedHtml);

    // ── 6. Sanitize fromName (strip chars that break the From header) ───────
    const safeName = (fromName || 'Gmail Automation')
      .replace(/["\r\n]/g, '')
      .trim() || 'Gmail Automation';

    // ── 7. Build mail options ──────────────────────────────────────────────
    const mailOptions = {
      from:    `"${safeName}" <${user}>`,
      to:      toAddress,
      subject: processedSubject,
      html:    processedHtml,
      text:    processedText
    };

    // ── 8. Attach files only if they exist on disk ─────────────────────────
    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments
        .filter(att => att && (att.path || att.content))
        .map(att => ({
          filename:    att.originalname || att.filename || 'attachment',
          path:        att.path,
          content:     att.content,       // buffer fallback
          contentType: att.mimetype || att.contentType || 'application/octet-stream'
        }));
    }

    // ── 9. Create a FRESH transporter for this send (avoids pool bugs) ──────
    transporter = createTransporter(user, pass);

    logger.info(`📤 Sending to ${toAddress} from ${user}`);

    const info = await transporter.sendMail(mailOptions);

    logger.info(`✅ Sent to ${toAddress} | ID: ${info.messageId}`);
    return {
      success:   true,
      messageId: info.messageId,
      to:        toAddress,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    // ── Provide actionable error messages ──────────────────────────────────
    let userMessage = error.message;

    if (error.code === 'EAUTH' || error.message.includes('Invalid login') || error.message.includes('BadCredentials')) {
      userMessage = `Gmail auth failed for ${clean(smtpUser) || clean(process.env.GMAIL_USER)}. ` +
        'Check your App Password in Settings — it must be a 16-char App Password, not your account password.';
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      userMessage = 'Cannot connect to Gmail SMTP. Check your internet connection.';
    } else if (error.message.includes('self signed') || error.code === 'CERT_HAS_EXPIRED') {
      userMessage = 'SSL certificate error. Try setting NODE_TLS_REJECT_UNAUTHORIZED=0 in .env';
    } else if (error.message.includes('Daily sending quota exceeded')) {
      userMessage = 'Gmail daily sending limit reached (500/day for free accounts). Try again tomorrow.';
    } else if (error.message.includes('Rate limit')) {
      userMessage = 'Gmail rate limit hit. Increase the delay between emails in Settings.';
    }

    logger.error(`❌ Failed → ${to}: ${userMessage}`);
    return {
      success:   false,
      to:        sanitizeEmail(to) || to,
      error:     userMessage,
      timestamp: new Date().toISOString()
    };

  } finally {
    // ── Always close the transporter to free the connection ────────────────
    if (transporter) {
      try { transporter.close(); } catch (_) {}
    }
  }
};

// ── Sleep helpers ─────────────────────────────────────────────────────────────
const sleep        = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomDelay = (minSec = 2, maxSec = 5) => {
  const mn = minSec * 1000, mx = maxSec * 1000;
  return Math.floor(Math.random() * (mx - mn + 1)) + mn;
};

module.exports = { sendEmail, verifyConnection, replacePlaceholders, sleep, getRandomDelay };
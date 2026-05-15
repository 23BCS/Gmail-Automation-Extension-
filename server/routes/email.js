/**
 * Email Routes
 * POST /api/email/send        - Send single email
 * POST /api/email/send-bulk   - Send bulk emails
 * GET  /api/email/status/:id  - Get queue status
 * POST /api/email/stop/:id    - Stop queue
 * POST /api/email/pause/:id   - Pause queue
 * POST /api/email/resume/:id  - Resume queue
 * POST /api/email/retry/:id   - Retry failed
 * GET  /api/email/history     - Email history
 * POST /api/email/verify-smtp - Verify SMTP settings
 */
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const { sendEmail, verifyConnection } = require('../services/emailService');
const {
  createQueue,
  startQueue,
  pauseQueue,
  stopQueue,
  getQueue,
  getAllQueues,
  retryFailed
} = require('../services/queueService');
const { emailLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');

// ─── Multer Configuration (multer v2) ────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

// Allowed extensions for attachments and CSV
const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.txt',
  '.jpg', '.jpeg', '.png', '.gif',
  '.csv', '.xlsx', '.xls'
]);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);   // accept
  } else {
    // In multer v2, pass an Error to reject (cb(null, false) silently drops the file)
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', `File type "${ext}" is not allowed`));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter
});

// Helper: wrap multer middleware and return clean JSON errors instead of crashing
const handleMulterError = (middlewareFn) => (req, res, next) => {
  middlewareFn(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE:       'File too large — maximum size is 10 MB',
        LIMIT_FILE_COUNT:      'Too many files — maximum is 5 attachments',
        LIMIT_UNEXPECTED_FILE: err.message || 'Unexpected file field',
      };
      return res.status(400).json({
        success: false,
        message: messages[err.code] || `Upload error: ${err.message}`
      });
    }
    next(err); // pass other errors to global handler
  });
};

// ─── Parse CSV Helper ─────────────────────────────────────────────────────────
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // Support various column names for email
        const email = row.email || row.Email || row.EMAIL || row['Email Address'] || row.mail;
        if (email && email.includes('@')) {
          results.push({
            email: email.trim(),
            name: row.name || row.Name || row.NAME || '',
            company: row.company || row.Company || row.COMPANY || '',
            ...row // include all columns for placeholder support
          });
        }
      })
      .on('end', () => resolve(results))
      .on('error', reject);
  });
};

// ─── POST /verify-smtp ────────────────────────────────────────────────────────
router.post('/verify-smtp', async (req, res, next) => {
  try {
    const { gmailUser, gmailAppPassword } = req.body;
    const result = await verifyConnection(gmailUser, gmailAppPassword);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ─── POST /send (single email) ────────────────────────────────────────────────
router.post('/send',
  emailLimiter,
  handleMulterError(upload.array('attachments', 5)),
  [
    body('to').isEmail().withMessage('Valid email required'),
    body('subject').notEmpty().withMessage('Subject is required'),
    body('htmlContent').notEmpty().withMessage('Email content is required')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { to, subject, htmlContent, fromName, smtpUser, smtpPass } = req.body;
      const placeholderData = req.body.placeholderData
        ? JSON.parse(req.body.placeholderData)
        : {};

      const result = await sendEmail({
        to,
        subject,
        htmlContent,
        attachments: req.files || [],
        fromName,
        placeholderData,
        smtpUser,
        smtpPass
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// ─── POST /send-bulk ──────────────────────────────────────────────────────────
router.post('/send-bulk',
  emailLimiter,
  handleMulterError(upload.fields([
    { name: 'attachments', maxCount: 5 },
    { name: 'csvFile',     maxCount: 1 }
  ])),
  async (req, res, next) => {
    try {
      const {
        subject,
        htmlContent,
        fromName,
        delayMin = 2,
        delayMax = 5,
        smtpUser,
        smtpPass,
        retryFailed: shouldRetry = true
      } = req.body;

      // ── Validate required fields ──────────────────────────────────────────
      if (!subject || !subject.trim()) {
        return res.status(400).json({ success: false, message: 'Subject is required' });
      }
      if (!htmlContent || !htmlContent.trim()) {
        return res.status(400).json({ success: false, message: 'Email content is required' });
      }

      // ── Parse recipients ──────────────────────────────────────────────────
      let recipients = [];

      if (req.body.recipients) {
        try {
          const parsed = JSON.parse(req.body.recipients);
          recipients = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return res.status(400).json({ success: false, message: 'Invalid recipients JSON' });
        }
      }

      // CSV file upload (server-side parsing)
      if (req.files && req.files.csvFile && req.files.csvFile[0]) {
        const csvRecipients = await parseCSV(req.files.csvFile[0].path);
        recipients = [...recipients, ...csvRecipients];
        fs.unlinkSync(req.files.csvFile[0].path);
      }

      // ── Clean & validate each recipient email ─────────────────────────────
      const validRecipients = recipients
        .map(r => ({
          ...r,
          // Trim whitespace/newlines that CSV parsers sometimes leave
          email: (r.email || '').replace(/[\s\r\n\t]/g, '').toLowerCase().trim()
        }))
        .filter(r => {
          // Basic email format validation
          const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email);
          if (!ok) logger.warn(`⚠️  Skipping invalid email: "${r.email}"`);
          return ok;
        });

      // Remove duplicates (same email address)
      const seen = new Set();
      const dedupedRecipients = validRecipients.filter(r => {
        if (seen.has(r.email)) { logger.warn(`⚠️  Duplicate skipped: ${r.email}`); return false; }
        seen.add(r.email);
        return true;
      });

      if (dedupedRecipients.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid recipient email addresses found. Check your list.'
        });
      }

      logger.info(`📋 Valid recipients: ${dedupedRecipients.length} / ${recipients.length}`);

      // ── Use env credentials if not sent from frontend ─────────────────────
      // Frontend doesn't store SMTP creds — they come from .env
      const resolvedSmtpUser = (smtpUser || '').trim() || undefined;  // undefined → emailService reads .env
      const resolvedSmtpPass = (smtpPass || '').trim() || undefined;

      // ── Create and start the queue ────────────────────────────────────────
      const queueId = createQueue({
        recipients:  dedupedRecipients,
        subject:     subject.trim(),
        htmlContent: htmlContent.trim(),
        attachments: req.files && req.files.attachments ? req.files.attachments : [],
        fromName:    (fromName || '').trim() || 'Gmail Automation',
        delayMin:    Math.max(1, parseInt(delayMin) || 2),
        delayMax:    Math.max(1, parseInt(delayMax) || 5),
        smtpUser:    resolvedSmtpUser,
        smtpPass:    resolvedSmtpPass,
        retryFailed: shouldRetry === 'true' || shouldRetry === true,
        maxRetries:  2
      });

      await startQueue(queueId);

      res.json({
        success:    true,
        queueId,
        message:    `Campaign started with ${dedupedRecipients.length} recipients`,
        totalCount: dedupedRecipients.length,
        skipped:    recipients.length - dedupedRecipients.length
      });

    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /status/:id ──────────────────────────────────────────────────────────
router.get('/status/:id', (req, res) => {
  const queue = getQueue(req.params.id);
  if (!queue) {
    return res.status(404).json({ success: false, message: 'Queue not found' });
  }
  res.json({ success: true, queue });
});

// ─── GET /queues ──────────────────────────────────────────────────────────────
router.get('/queues', (req, res) => {
  res.json({ success: true, queues: getAllQueues() });
});

// ─── POST /stop/:id ───────────────────────────────────────────────────────────
router.post('/stop/:id', (req, res) => {
  try {
    const queue = stopQueue(req.params.id);
    res.json({ success: true, message: 'Queue stopped', queue });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
});

// ─── POST /pause/:id ──────────────────────────────────────────────────────────
router.post('/pause/:id', (req, res) => {
  try {
    const queue = pauseQueue(req.params.id);
    res.json({ success: true, message: 'Queue paused', queue });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
});

// ─── POST /resume/:id ─────────────────────────────────────────────────────────
router.post('/resume/:id', async (req, res) => {
  try {
    const queue = await startQueue(req.params.id);
    res.json({ success: true, message: 'Queue resumed', queue });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
});

// ─── POST /retry/:id ──────────────────────────────────────────────────────────
router.post('/retry/:id', async (req, res) => {
  try {
    const result = await retryFailed(req.params.id);
    res.json({ success: true, message: 'Retrying failed emails', result });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
});

// ─── POST /parse-csv ──────────────────────────────────────────────────────────
router.post('/parse-csv', handleMulterError(upload.single('csvFile')), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'CSV file required' });
    }

    const recipients = await parseCSV(req.file.path);
    fs.unlinkSync(req.file.path); // Clean up

    res.json({
      success: true,
      recipients,
      count: recipients.length
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
/**
 * Settings Routes
 */
const express = require('express');
const router = express.Router();
const { verifyConnection } = require('../services/emailService');

// In-memory settings store
let settings = {
  gmailUser: process.env.GMAIL_USER || '',
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD ? '••••••••••••••••' : '',
  fromName: 'Gmail Automation',
  delayMin: 2,
  delayMax: 5,
  retryFailed: true,
  maxRetries: 2,
  smtpVerified: false
};

// GET /api/settings
router.get('/', (req, res) => {
  // Never return actual password
  const safe = { ...settings, gmailAppPassword: settings.gmailAppPassword ? '••••••••' : '' };
  res.json({ success: true, settings: safe });
});

// PUT /api/settings
router.put('/', async (req, res, next) => {
  try {
    const allowed = ['gmailUser', 'gmailAppPassword', 'fromName', 'delayMin', 'delayMax', 'retryFailed', 'maxRetries'];
    allowed.forEach(key => {
      if (req.body[key] !== undefined) settings[key] = req.body[key];
    });

    // Verify new SMTP if credentials changed
    if (req.body.gmailUser || req.body.gmailAppPassword) {
      const verify = await verifyConnection(settings.gmailUser, settings.gmailAppPassword);
      settings.smtpVerified = verify.success;
    }

    res.json({ success: true, settings: { ...settings, gmailAppPassword: '••••••••' } });
  } catch (error) {
    next(error);
  }
});

// POST /api/settings/verify
router.post('/verify', async (req, res) => {
  const { gmailUser, gmailAppPassword } = req.body;
  const result = await verifyConnection(
    gmailUser || settings.gmailUser,
    gmailAppPassword || settings.gmailAppPassword
  );
  res.json(result);
});

module.exports = router;

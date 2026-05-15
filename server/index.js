/**
 * Gmail Automation Extension - Express Server
 * Main entry point
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const path = require('path');

const { logger } = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');

// Route imports
const emailRoutes = require('./routes/email');
const templateRoutes = require('./routes/template');
const scheduleRoutes = require('./routes/schedule');
const reportRoutes = require('./routes/report');
const settingsRoutes = require('./routes/settings');

// Initialize scheduler
require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'chrome-extension://*'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ─── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Logging ───────────────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) }
}));

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
app.use('/api/', generalLimiter);

// ─── Static Files (uploads) ───────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/email', emailRoutes);
app.use('/api/template', templateRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/settings', settingsRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Global Error Handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ─── MongoDB Connection ────────────────────────────────────────────────────────
const connectDB = async () => {
  // Strip any accidental surrounding single-quotes from .env values
  const raw = process.env.MONGODB_URI || '';
  const uri = raw.replace(/^'+|'+$/g, '').trim();

  if (!uri || uri.includes('youruser') || uri.includes('yourpass')) {
    logger.warn('⚠️  MONGODB_URI not configured — running in memory-only mode');
    logger.warn('   Emails still work! Set MONGODB_URI in .env for persistent history.');
    return;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    logger.info('✅ MongoDB connected successfully');
  } catch (error) {
    logger.error(`❌ MongoDB connection failed: ${error.message}`);
    logger.warn('   Continuing in memory-only mode — emails are unaffected');
  }
};

// ─── Start Server ──────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, async () => {
    logger.info(`🚀 Server running on http://localhost:${PORT}`);
    logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🗄️  Database: ${mongoose.connection.readyState === 1 ? 'MongoDB ✅' : 'Memory-only mode'}`);

    // ── Startup diagnostics — show exactly what is/isn't configured ────────
    const clean = v => (v || '').replace(/^["'\s]+|["'\s]+$/g, '').trim();
    const gmailUser = clean(process.env.GMAIL_USER);
    const gmailPass = clean(process.env.GMAIL_APP_PASSWORD);
    const passLen   = gmailPass.replace(/\s/g,'').length;

    logger.info('─────────────────────────────────────────');
    logger.info('📋 Configuration Check:');

    if (!gmailUser) {
      logger.error('❌ GMAIL_USER is NOT SET in .env');
      logger.error('   Fix: Add GMAIL_USER=yourname@gmail.com to server/.env');
    } else {
      logger.info(`✅ GMAIL_USER     = ${gmailUser}`);
    }

    if (!gmailPass) {
      logger.error('❌ GMAIL_APP_PASSWORD is NOT SET in .env');
      logger.error('   Fix: Add GMAIL_APP_PASSWORD=xxxxxxxxxxxxxx to server/.env');
      logger.error('   Get it: myaccount.google.com → Security → App Passwords');
    } else if (passLen !== 16) {
      logger.warn(`⚠️  GMAIL_APP_PASSWORD is ${passLen} chars (expected 16)`);
      logger.warn('   Make sure you copied all 16 characters from Google App Passwords');
    } else {
      logger.info(`✅ GMAIL_APP_PASSWORD = ${'•'.repeat(passLen)} (${passLen} chars ✓)`);
    }

    logger.info('─────────────────────────────────────────');

    // ── Live SMTP test on startup ──────────────────────────────────────────
    if (gmailUser && gmailPass) {
      logger.info('🔌 Testing Gmail SMTP connection...');
      const { verifyConnection } = require('./services/emailService');
      verifyConnection(gmailUser, gmailPass).then(result => {
        if (result.success) {
          logger.info('✅ Gmail SMTP is working — ready to send!');
        } else {
          logger.error(`❌ Gmail SMTP FAILED: ${result.message}`);
          logger.error('   Emails will NOT send until this is fixed.');
          if (result.message.includes('Invalid login') || result.message.includes('EAUTH')) {
            logger.error('   → Your App Password is wrong or 2FA is not enabled on your Google account');
            logger.error('   → Go to: myaccount.google.com → Security → 2-Step Verification → App Passwords');
          }
        }
      });
    } else {
      logger.warn('⏭️  SMTP test skipped — credentials not configured');
    }
  });
});

module.exports = app;
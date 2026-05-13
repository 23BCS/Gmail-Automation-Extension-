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
    logger.info(`📧 Gmail Automation Extension API ready`);
    logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🗄️  Database: ${mongoose.connection.readyState === 1 ? 'MongoDB ✅' : 'Memory-only mode'}`);

    // ── Startup SMTP check ──────────────────────────────────────────────────
    const gmailUser = (process.env.GMAIL_USER || '').replace(/^'+|'+$/g, '').trim();
    const gmailPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/^'+|'+$/g, '').trim();

    if (!gmailUser || gmailUser.includes('youremail')) {
      logger.warn('⚠️  GMAIL_USER not set in .env — configure it in Settings before sending');
    } else if (!gmailPass || gmailPass.includes('xxxx')) {
      logger.warn('⚠️  GMAIL_APP_PASSWORD not set in .env — configure it in Settings before sending');
    } else {
      logger.info(`📬 Gmail account: ${gmailUser}`);
      // Verify SMTP in background (non-blocking)
      const { verifyConnection } = require('./services/emailService');
      verifyConnection(gmailUser, gmailPass).then(result => {
        if (result.success) {
          logger.info('✅ Gmail SMTP verified — ready to send!');
        } else {
          logger.error(`❌ Gmail SMTP failed: ${result.message}`);
          logger.warn('   Check GMAIL_APP_PASSWORD in .env (must be App Password, not account password)');
        }
      });
    }
  });
});

module.exports = app;
/**
 * Rate Limiting Middleware
 * Protects against abuse and spam
 */
const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');

// General API rate limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes'
  },
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Strict email sending rate limit (prevent spam)
const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 500, // max 500 emails per hour
  message: {
    success: false,
    message: 'Email send limit reached. Maximum 500 emails per hour.'
  },
  handler: (req, res, next, options) => {
    logger.warn(`Email rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(options.message);
  }
});

module.exports = { generalLimiter, emailLimiter };

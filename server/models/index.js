/**
 * MongoDB Models
 */
const mongoose = require('mongoose');

// ─── Email History Model ──────────────────────────────────────────────────────
const emailHistorySchema = new mongoose.Schema({
  to: { type: String, required: true },
  subject: { type: String, required: true },
  htmlContent: { type: String },
  status: {
    type: String,
    enum: ['sent', 'failed', 'pending'],
    default: 'pending'
  },
  messageId: { type: String },
  error: { type: String },
  queueId: { type: String },
  sentAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

emailHistorySchema.index({ createdAt: -1 });
emailHistorySchema.index({ status: 1 });

// ─── Email Template Model ────────────────────────────────────────────────────
const templateSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  subject: { type: String, required: true },
  htmlContent: { type: String, required: true },
  description: { type: String },
  tags: [{ type: String }],
  placeholders: [{ type: String }], // detected placeholder names
  usageCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// ─── Draft Model ─────────────────────────────────────────────────────────────
const draftSchema = new mongoose.Schema({
  name: { type: String, required: true },
  recipients: [{ type: String }], // email addresses
  subject: { type: String },
  htmlContent: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// ─── Settings Model ──────────────────────────────────────────────────────────
const settingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = {
  EmailHistory: mongoose.model('EmailHistory', emailHistorySchema),
  Template: mongoose.model('Template', templateSchema),
  Draft: mongoose.model('Draft', draftSchema),
  Settings: mongoose.model('Settings', settingsSchema)
};

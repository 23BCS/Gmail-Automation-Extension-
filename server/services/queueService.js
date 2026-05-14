/**
 * Email Queue Service
 * Manages sequential email sending with pause/resume/stop controls
 */
const { sendEmail, sleep, getRandomDelay } = require('./emailService');
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// In-memory queue store (use Redis in production for multi-instance)
const queues = new Map();

/**
 * Queue status constants
 */
const STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  STOPPED: 'stopped'
};

/**
 * Create a new email queue
 */
const createQueue = ({
  recipients,
  subject,
  htmlContent,
  attachments = [],
  fromName,
  delayMin = 2,
  delayMax = 5,
  smtpUser,
  smtpPass,
  retryFailed = true,
  maxRetries = 2
}) => {
  const queueId = uuidv4();

  const queue = {
    id: queueId,
    status: STATUS.PENDING,
    recipients: recipients.map((r, index) => ({
      id: index,
      ...r,
      status: 'pending',
      retries: 0,
      error: null,
      sentAt: null
    })),
    subject,
    htmlContent,
    attachments,
    fromName,
    delayMin,
    delayMax,
    smtpUser,
    smtpPass,
    retryFailed,
    maxRetries,
    currentIndex: 0,
    sentCount: 0,
    failedCount: 0,
    totalCount: recipients.length,
    startedAt: null,
    completedAt: null,
    logs: [],
    createdAt: new Date().toISOString()
  };

  queues.set(queueId, queue);
  logger.info(`📋 Queue created: ${queueId} | Recipients: ${recipients.length}`);
  return queueId;
};

/**
 * Add a log entry to the queue
 */
const addLog = (queue, type, message, email = null) => {
  queue.logs.push({
    id: queue.logs.length + 1,
    type, // 'success' | 'error' | 'info' | 'warning'
    message,
    email,
    timestamp: new Date().toISOString()
  });
  // Keep only last 500 logs in memory
  if (queue.logs.length > 500) {
    queue.logs = queue.logs.slice(-500);
  }
};

/**
 * Process a single recipient in the queue
 */
const processRecipient = async (queue, recipient) => {
  try {
    recipient.status = 'sending';

    const result = await sendEmail({
      to: recipient.email,
      subject: queue.subject,
      htmlContent: queue.htmlContent,
      attachments: queue.attachments,
      fromName: queue.fromName,
      placeholderData: recipient, // pass full recipient data for placeholders
      smtpUser: queue.smtpUser,
      smtpPass: queue.smtpPass
    });

    if (result.success) {
      recipient.status = 'sent';
      recipient.sentAt = result.timestamp;
      recipient.messageId = result.messageId;
      queue.sentCount++;
      addLog(queue, 'success', `Email sent successfully to ${recipient.email}`, recipient.email);
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    recipient.error = error.message;

    // Retry logic
    if (queue.retryFailed && recipient.retries < queue.maxRetries) {
      recipient.retries++;
      recipient.status = 'retrying';
      addLog(queue, 'warning', `Retrying ${recipient.email} (attempt ${recipient.retries}/${queue.maxRetries})`, recipient.email);

      // Wait before retry
      await sleep(3000);
      return processRecipient(queue, recipient);
    }

    recipient.status = 'failed';
    queue.failedCount++;
    addLog(queue, 'error', `Failed to send to ${recipient.email}: ${error.message}`, recipient.email);
  }
};

/**
 * Start or resume processing the queue
 */
const startQueue = async (queueId) => {
  const queue = queues.get(queueId);
  if (!queue) throw new Error('Queue not found');

  if (queue.status === STATUS.RUNNING) return queue;

  queue.status = STATUS.RUNNING;
  if (!queue.startedAt) queue.startedAt = new Date().toISOString();

  addLog(queue, 'info', `Queue ${queue.status === STATUS.PAUSED ? 'resumed' : 'started'} | ${queue.totalCount} recipients`);
  logger.info(`▶️ Queue ${queueId} started from index ${queue.currentIndex}`);

  // ── Interruptible sleep: checks stop/pause every 200ms during delay ──────
  const interruptibleSleep = async (ms) => {
    const step = 200;
    let elapsed = 0;
    while (elapsed < ms) {
      await sleep(Math.min(step, ms - elapsed));
      elapsed += step;
      // Re-read queue status on every tick so stop/pause is near-instant
      const q = queues.get(queueId);
      if (!q || q.status === STATUS.STOPPED || q.status === STATUS.PAUSED) return;
    }
  };

  // Process emails sequentially (non-blocking)
  (async () => {
    for (let i = queue.currentIndex; i < queue.recipients.length; i++) {
      // Re-read queue on every iteration — catches stop/pause set from outside
      const current = queues.get(queueId);

      if (!current || current.status === STATUS.STOPPED) {
        addLog(queue, 'info', `Queue stopped by user at email ${i + 1}/${queue.totalCount}`);
        logger.info(`⏹️ Queue ${queueId} stopped at index ${i}`);
        return;
      }

      if (current.status === STATUS.PAUSED) {
        queue.currentIndex = i; // remember where to resume
        addLog(queue, 'info', `Queue paused at email ${i + 1}/${queue.totalCount}`);
        logger.info(`⏸️ Queue ${queueId} paused at index ${i}`);
        return;
      }

      queue.currentIndex = i;
      const recipient = queue.recipients[i];
      if (recipient.status === 'sent') continue; // skip already-sent on resume

      await processRecipient(queue, recipient);

      // Interruptible delay — stop/pause takes effect within 200ms
      if (i < queue.recipients.length - 1) {
        const delay = getRandomDelay(queue.delayMin, queue.delayMax);
        addLog(queue, 'info', `Waiting ${(delay / 1000).toFixed(1)}s before next email...`);
        await interruptibleSleep(delay);

        // Check again after sleep in case stop was triggered during wait
        const afterSleep = queues.get(queueId);
        if (!afterSleep || afterSleep.status === STATUS.STOPPED) {
          addLog(queue, 'info', 'Queue stopped during delay');
          return;
        }
        if (afterSleep.status === STATUS.PAUSED) {
          queue.currentIndex = i + 1;
          addLog(queue, 'info', `Queue paused after email ${i + 1}`);
          return;
        }
      }
    }

    // Completed naturally
    queue.status = STATUS.COMPLETED;
    queue.completedAt = new Date().toISOString();
    addLog(queue, 'info', `✅ Queue completed | Sent: ${queue.sentCount} | Failed: ${queue.failedCount}`);
    logger.info(`✅ Queue ${queueId} completed | Sent: ${queue.sentCount} | Failed: ${queue.failedCount}`);
  })();

  return queue;
};

/**
 * Pause the queue
 */
const pauseQueue = (queueId) => {
  const queue = queues.get(queueId);
  if (!queue) throw new Error('Queue not found');
  if (queue.status !== STATUS.RUNNING) return queue;

  queue.status = STATUS.PAUSED;
  logger.info(`⏸️ Queue ${queueId} pause requested`);
  return queue;
};

/**
 * Stop the queue permanently
 */
const stopQueue = (queueId) => {
  const queue = queues.get(queueId);
  if (!queue) throw new Error('Queue not found');

  queue.status = STATUS.STOPPED;
  queue.completedAt = new Date().toISOString();
  addLog(queue, 'info', `Queue stopped manually | Sent: ${queue.sentCount} | Failed: ${queue.failedCount}`);
  logger.info(`⏹️ Queue ${queueId} stopped`);
  return queue;
};

/**
 * Get queue status
 */
const getQueue = (queueId) => {
  return queues.get(queueId) || null;
};

/**
 * Get all queues summary
 */
const getAllQueues = () => {
  const result = [];
  queues.forEach((q) => {
    result.push({
      id: q.id,
      status: q.status,
      totalCount: q.totalCount,
      sentCount: q.sentCount,
      failedCount: q.failedCount,
      currentIndex: q.currentIndex,
      startedAt: q.startedAt,
      completedAt: q.completedAt,
      createdAt: q.createdAt
    });
  });
  return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

/**
 * Retry all failed emails in a queue
 */
const retryFailed = async (queueId) => {
  const queue = queues.get(queueId);
  if (!queue) throw new Error('Queue not found');

  // Reset failed recipients
  let retryCount = 0;
  queue.recipients.forEach(r => {
    if (r.status === 'failed') {
      r.status = 'pending';
      r.error = null;
      r.retries = 0;
      retryCount++;
    }
  });

  if (retryCount === 0) return { message: 'No failed emails to retry' };

  queue.status = STATUS.PENDING;
  queue.currentIndex = 0;
  addLog(queue, 'info', `Retrying ${retryCount} failed emails`);

  return startQueue(queueId);
};

module.exports = {
  createQueue,
  startQueue,
  pauseQueue,
  stopQueue,
  getQueue,
  getAllQueues,
  retryFailed,
  STATUS
};
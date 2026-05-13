/**
 * Email Scheduler Service
 * Handles scheduled email sending using node-cron
 */
const cron = require('node-cron');
const { logger } = require('../utils/logger');

// Store active cron jobs
const activeJobs = new Map();

// In-memory scheduled emails store (use DB in production)
const scheduledEmails = new Map();

/**
 * Schedule an email to be sent at a specific time
 */
const scheduleEmail = (id, emailData, sendAt) => {
  const sendTime = new Date(sendAt);
  const now = new Date();

  if (sendTime <= now) {
    throw new Error('Schedule time must be in the future');
  }

  // Store the scheduled email data
  scheduledEmails.set(id, {
    id,
    ...emailData,
    sendAt: sendTime.toISOString(),
    status: 'scheduled',
    createdAt: new Date().toISOString()
  });

  // Create a one-time cron job
  // Convert date to cron expression: minute hour day month *
  const minute = sendTime.getMinutes();
  const hour = sendTime.getHours();
  const day = sendTime.getDate();
  const month = sendTime.getMonth() + 1;

  const cronExpression = `${minute} ${hour} ${day} ${month} *`;

  try {
    const job = cron.schedule(cronExpression, async () => {
      logger.info(`⏰ Executing scheduled email: ${id}`);

      const scheduled = scheduledEmails.get(id);
      if (!scheduled || scheduled.status !== 'scheduled') return;

      scheduled.status = 'sending';

      try {
        const { createQueue, startQueue } = require('./queueService');
        const queueId = createQueue(scheduled);
        await startQueue(queueId);

        scheduled.status = 'completed';
        scheduled.queueId = queueId;
        logger.info(`✅ Scheduled email ${id} completed`);
      } catch (error) {
        scheduled.status = 'failed';
        scheduled.error = error.message;
        logger.error(`❌ Scheduled email ${id} failed:`, error.message);
      }

      // Clean up cron job after execution
      job.stop();
      activeJobs.delete(id);
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    activeJobs.set(id, job);
    logger.info(`📅 Email scheduled: ${id} at ${sendTime.toISOString()}`);

    return scheduledEmails.get(id);
  } catch (error) {
    scheduledEmails.delete(id);
    throw new Error(`Failed to create cron job: ${error.message}`);
  }
};

/**
 * Cancel a scheduled email
 */
const cancelScheduled = (id) => {
  const job = activeJobs.get(id);
  if (job) {
    job.stop();
    activeJobs.delete(id);
  }

  const scheduled = scheduledEmails.get(id);
  if (scheduled) {
    scheduled.status = 'cancelled';
  }

  return scheduled || null;
};

/**
 * Get all scheduled emails
 */
const getAllScheduled = () => {
  const result = [];
  scheduledEmails.forEach(s => result.push(s));
  return result.sort((a, b) => new Date(a.sendAt) - new Date(b.sendAt));
};

/**
 * Get a specific scheduled email
 */
const getScheduled = (id) => scheduledEmails.get(id) || null;

logger.info('📅 Scheduler service initialized');

module.exports = {
  scheduleEmail,
  cancelScheduled,
  getAllScheduled,
  getScheduled
};

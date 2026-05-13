/**
 * Report Routes - CSV Export
 */
const express = require('express');
const router = express.Router();
const { getAllQueues, getQueue } = require('../services/queueService');

// GET /api/report/export?queueId=xxx
router.get('/export', (req, res) => {
  try {
    const { queueId } = req.query;
    let recipients = [];

    if (queueId) {
      const queue = getQueue(queueId);
      if (!queue) return res.status(404).json({ success: false, message: 'Queue not found' });
      recipients = queue.recipients;
    } else {
      // Export all from all queues
      const queues = getAllQueues();
      queues.forEach(q => {
        const full = getQueue(q.id);
        if (full) recipients = [...recipients, ...full.recipients.map(r => ({ ...r, queueId: q.id }))];
      });
    }

    // Build CSV
    const headers = ['email', 'name', 'company', 'status', 'sentAt', 'error', 'retries', 'queueId'];
    const rows = recipients.map(r =>
      headers.map(h => `"${(r[h] || '').toString().replace(/"/g, '""')}"`)
    );

    const csv = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="email-report-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/report/summary
router.get('/summary', (req, res) => {
  const queues = getAllQueues();
  const summary = {
    totalQueues: queues.length,
    totalSent: queues.reduce((sum, q) => sum + q.sentCount, 0),
    totalFailed: queues.reduce((sum, q) => sum + q.failedCount, 0),
    totalRecipients: queues.reduce((sum, q) => sum + q.totalCount, 0),
    activeQueues: queues.filter(q => q.status === 'running').length,
    queues
  };
  res.json({ success: true, summary });
});

module.exports = router;


/**
 * Settings Routes (separate file but combined here for brevity)
 */
// server/routes/settings.js is a separate require

/**
 * Schedule Routes
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { scheduleEmail, cancelScheduled, getAllScheduled, getScheduled } = require('../services/scheduler');

// GET /api/schedule/list
router.get('/list', (req, res) => {
  res.json({ success: true, scheduled: getAllScheduled() });
});

// POST /api/schedule/create
router.post('/create', async (req, res, next) => {
  try {
    const { sendAt, ...emailData } = req.body;
    if (!sendAt) return res.status(400).json({ success: false, message: 'sendAt date required' });

    const id = uuidv4();
    const scheduled = scheduleEmail(id, emailData, sendAt);
    res.json({ success: true, scheduled });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE /api/schedule/:id
router.delete('/:id', (req, res) => {
  const result = cancelScheduled(req.params.id);
  if (!result) return res.status(404).json({ success: false, message: 'Scheduled email not found' });
  res.json({ success: true, message: 'Scheduled email cancelled' });
});

module.exports = router;

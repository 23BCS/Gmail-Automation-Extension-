/**
 * Template Routes
 */
const express = require('express');
const router = express.Router();

// In-memory template store (use DB model in production)
const templates = new Map();
let templateIdCounter = 1;

// GET /api/template/list
router.get('/list', (req, res) => {
  const list = Array.from(templates.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, templates: list });
});

// POST /api/template/save
router.post('/save', (req, res) => {
  const { name, subject, htmlContent, description, tags } = req.body;
  if (!name || !subject || !htmlContent) {
    return res.status(400).json({ success: false, message: 'Name, subject, and content required' });
  }

  // Detect placeholders
  const placeholders = [...new Set((htmlContent + subject).match(/\{\{(\w+)\}\}/g) || [])];

  const id = templateIdCounter++;
  const template = {
    id,
    name,
    subject,
    htmlContent,
    description: description || '',
    tags: tags || [],
    placeholders,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  templates.set(id, template);
  res.json({ success: true, template });
});

// PUT /api/template/:id
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const template = templates.get(id);
  if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

  const updated = { ...template, ...req.body, id, updatedAt: new Date().toISOString() };
  templates.set(id, updated);
  res.json({ success: true, template: updated });
});

// DELETE /api/template/:id
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!templates.has(id)) return res.status(404).json({ success: false, message: 'Template not found' });
  templates.delete(id);
  res.json({ success: true, message: 'Template deleted' });
});

module.exports = router;

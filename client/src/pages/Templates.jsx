/**
 * Templates Page
 */
import React, { useState, useEffect } from 'react';
import { templateAPI } from '../utils/api';
import toast from 'react-hot-toast';

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', subject: '', htmlContent: '', description: '' });

  const fetchTemplates = async () => {
    try {
      const res = await templateAPI.list();
      setTemplates(res.data.templates || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleSave = async () => {
    if (!form.name || !form.subject || !form.htmlContent) {
      return toast.error('Name, subject, and content required');
    }
    try {
      if (editing) {
        await templateAPI.update(editing.id, form);
        toast.success('Template updated');
      } else {
        await templateAPI.save(form);
        toast.success('Template saved');
      }
      setShowForm(false);
      setEditing(null);
      setForm({ name: '', subject: '', htmlContent: '', description: '' });
      fetchTemplates();
    } catch {}
  };

  const handleEdit = (t) => {
    setEditing(t);
    setForm({ name: t.name, subject: t.subject, htmlContent: t.htmlContent, description: t.description });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await templateAPI.delete(id);
      toast.success('Template deleted');
      fetchTemplates();
    } catch {}
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Templates</h1>
          <p className="text-white/40 text-sm mt-1">Reusable email templates</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ name: '', subject: '', htmlContent: '', description: '' }); }}
          className="px-4 py-2.5 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 rounded-xl text-white text-sm font-medium transition-all"
        >
          + New Template
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-surface-800 border border-white/5 rounded-2xl p-5 space-y-4 animate-slide-up">
          <h3 className="text-lg font-semibold text-white">{editing ? 'Edit Template' : 'New Template'}</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Template Name</label>
              <input
                className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50"
                placeholder="e.g., Welcome Email"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Subject</label>
              <input
                className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50"
                placeholder="Welcome {{name}}!"
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1.5">Content (HTML supported)</label>
            <textarea
              className="w-full h-40 bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50 resize-none font-mono"
              placeholder={`<h2>Hi {{name}},</h2>\n<p>Welcome to our platform!</p>`}
              value={form.htmlContent}
              onChange={e => setForm(f => ({ ...f, htmlContent: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1.5">Description (optional)</label>
            <input
              className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50"
              placeholder="Brief description of this template"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="flex gap-3">
            <button onClick={handleSave} className="px-5 py-2 bg-brand-600 hover:bg-brand-500 rounded-xl text-white text-sm font-medium transition-all">
              {editing ? 'Update' : 'Save Template'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-5 py-2 bg-surface-700 hover:bg-surface-600 border border-white/10 rounded-xl text-white/60 text-sm transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Template list */}
      {templates.length === 0 ? (
        <div className="text-center py-20 text-white/30">
          <div className="text-5xl mb-4">📝</div>
          <div>No templates yet</div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {templates.map(t => (
            <div key={t.id} className="bg-surface-800 border border-white/5 rounded-2xl p-5 hover:border-brand-500/20 transition-all">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-semibold text-white">{t.name}</div>
                  <div className="text-xs text-white/40 mt-0.5">{t.description}</div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => handleEdit(t)} className="text-xs text-brand-400 hover:text-brand-300 px-2 py-1 rounded-lg bg-brand-500/10 transition-all">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-lg bg-red-500/10 transition-all">
                    Del
                  </button>
                </div>
              </div>

              <div className="text-xs text-white/50 mb-2 font-medium">{t.subject}</div>

              <div className="bg-surface-900 rounded-lg p-3 text-xs text-white/30 font-mono truncate">
                {t.htmlContent.slice(0, 100)}...
              </div>

              {t.placeholders && t.placeholders.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {t.placeholders.map(p => (
                    <span key={p} className="text-xs px-2 py-0.5 bg-brand-500/10 text-brand-400 border border-brand-500/20 rounded-md font-mono">
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

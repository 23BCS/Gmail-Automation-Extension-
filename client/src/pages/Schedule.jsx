/**
 * Schedule Page
 */
import React, { useState, useEffect } from 'react';
import { scheduleAPI } from '../utils/api';
import toast from 'react-hot-toast';

export function Schedule() {
  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    subject: '',
    htmlContent: '',
    recipients: '',
    fromName: '',
    sendAt: '',
    delayMin: 2,
    delayMax: 5
  });

  const fetchScheduled = async () => {
    try {
      const res = await scheduleAPI.list();
      setScheduled(res.data.scheduled || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchScheduled(); }, []);

  const handleSchedule = async () => {
    if (!form.subject || !form.htmlContent || !form.recipients || !form.sendAt) {
      return toast.error('All fields required');
    }
    try {
      const recipients = form.recipients.split(/[\n,;]+/).map(e => e.trim())
        .filter(e => e.includes('@')).map(email => ({ email }));

      if (recipients.length === 0) return toast.error('No valid email addresses');

      await scheduleAPI.create({ ...form, recipients });
      toast.success('Email scheduled successfully!');
      setShowForm(false);
      fetchScheduled();
    } catch {}
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this scheduled email?')) return;
    try {
      await scheduleAPI.cancel(id);
      toast.success('Schedule cancelled');
      fetchScheduled();
    } catch {}
  };

  const statusColors = {
    scheduled: 'bg-brand-500/20 text-brand-400 border-brand-500/30',
    sending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    cancelled: 'bg-white/10 text-white/40 border-white/10'
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
          <h1 className="text-2xl font-bold text-white">Schedule Emails</h1>
          <p className="text-white/40 text-sm mt-1">Set emails to send automatically at a future time</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2.5 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 rounded-xl text-white text-sm font-medium transition-all"
        >
          + Schedule Email
        </button>
      </div>

      {showForm && (
        <div className="bg-surface-800 border border-white/5 rounded-2xl p-5 space-y-4 animate-slide-up">
          <h3 className="text-lg font-semibold text-white">New Scheduled Email</h3>

          <div>
            <label className="block text-xs text-white/50 mb-1.5">Recipients (comma-separated)</label>
            <textarea
              className="w-full h-20 bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50 resize-none"
              placeholder="email1@example.com, email2@example.com"
              value={form.recipients}
              onChange={e => setForm(f => ({ ...f, recipients: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-white/50 mb-1.5">From Name</label>
              <input
                className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50"
                placeholder="Your Name"
                value={form.fromName}
                onChange={e => setForm(f => ({ ...f, fromName: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Send At</label>
              <input
                type="datetime-local"
                className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500/50"
                value={form.sendAt}
                onChange={e => setForm(f => ({ ...f, sendAt: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1.5">Subject</label>
            <input
              className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50"
              placeholder="Email subject..."
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1.5">Content (HTML supported)</label>
            <textarea
              className="w-full h-32 bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50 resize-none"
              placeholder="Your email content here..."
              value={form.htmlContent}
              onChange={e => setForm(f => ({ ...f, htmlContent: e.target.value }))}
            />
          </div>

          <div className="flex gap-3">
            <button onClick={handleSchedule} className="px-5 py-2 bg-brand-600 hover:bg-brand-500 rounded-xl text-white text-sm font-medium transition-all">
              Schedule Email
            </button>
            <button onClick={() => setShowForm(false)} className="px-5 py-2 bg-surface-700 hover:bg-surface-600 border border-white/10 rounded-xl text-white/60 text-sm transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}

      {scheduled.length === 0 ? (
        <div className="text-center py-20 text-white/30">
          <div className="text-5xl mb-4">📅</div>
          <div>No scheduled emails</div>
        </div>
      ) : (
        <div className="space-y-3">
          {scheduled.map(s => (
            <div key={s.id} className="bg-surface-800 border border-white/5 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="font-medium text-white">{s.subject}</div>
                  <div className="text-xs text-white/40 mt-1">
                    📅 {new Date(s.sendAt).toLocaleString()} · {s.recipients?.length || 0} recipients
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full border ${statusColors[s.status] || statusColors.scheduled}`}>
                    {s.status}
                  </span>
                  {s.status === 'scheduled' && (
                    <button onClick={() => handleCancel(s.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 bg-red-500/10 rounded-lg transition-all">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Schedule;

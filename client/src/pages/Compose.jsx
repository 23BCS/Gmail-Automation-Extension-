/**
 * Compose Page
 * Full email composition with CSV upload, rich editor, progress tracking
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { emailAPI } from '../utils/api';

// ─── Sub-components ───────────────────────────────────────────────────────────

function RecipientInput({ recipients, setRecipients }) {
  const [inputValue, setInputValue] = useState('');
  const fileRef = useRef();

  const addEmail = (value) => {
    const emails = value.split(/[\n,;]+/).map(e => e.trim()).filter(e => e.includes('@'));
    const newOnes = emails.map(email => ({ email, name: '', status: 'pending' }));
    setRecipients(prev => {
      const existing = new Set(prev.map(r => r.email));
      return [...prev, ...newOnes.filter(r => !existing.has(r.email))];
    });
    setInputValue('');
  };

  const handleCSVUpload = async (file) => {
    const formData = new FormData();
    formData.append('csvFile', file);
    try {
      const res = await emailAPI.parseCSV(formData);
      const csvRecipients = res.data.recipients.map(r => ({ ...r, status: 'pending' }));
      setRecipients(prev => {
        const existing = new Set(prev.map(r => r.email));
        const added = csvRecipients.filter(r => !existing.has(r.email));
        toast.success(`Added ${added.length} recipients from CSV`);
        return [...prev, ...added];
      });
    } catch {
      toast.error('Failed to parse CSV');
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-white/70">Recipients</label>

      <div className="flex gap-2">
        <textarea
          className="flex-1 bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50 resize-none h-20"
          placeholder="Enter email addresses, separated by comma or newline..."
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ',') && !e.shiftKey) {
              e.preventDefault();
              addEmail(inputValue);
            }
          }}
        />
        <div className="flex flex-col gap-2">
          <button
            className="px-4 py-2 bg-surface-600 hover:bg-surface-500 border border-white/10 rounded-xl text-sm text-white/70 hover:text-white transition-all"
            onClick={() => addEmail(inputValue)}
          >
            Add
          </button>
          <button
            className="px-4 py-2 bg-surface-600 hover:bg-surface-500 border border-white/10 rounded-xl text-sm text-white/70 hover:text-white transition-all"
            onClick={() => fileRef.current?.click()}
            title="Upload CSV"
          >
            📎 CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => e.target.files[0] && handleCSVUpload(e.target.files[0])}
          />
        </div>
      </div>

      {/* Recipient tags */}
      {recipients.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">{recipients.length} recipient{recipients.length !== 1 ? 's' : ''}</span>
            <button
              className="text-xs text-red-400 hover:text-red-300"
              onClick={() => setRecipients([])}
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {recipients.map((r, i) => (
              <div key={i} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-colors ${
                r.status === 'sent' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                r.status === 'failed' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                r.status === 'sending' ? 'bg-brand-500/10 border-brand-500/30 text-brand-400 animate-pulse' :
                'bg-surface-600 border-white/10 text-white/60'
              }`}>
                {r.status === 'sent' ? '✓' : r.status === 'failed' ? '✗' : r.status === 'sending' ? '⟳' : ''}
                {r.name ? `${r.name} <${r.email}>` : r.email}
                {r.status === 'pending' && (
                  <button
                    className="text-white/30 hover:text-white/70 ml-1"
                    onClick={() => setRecipients(prev => prev.filter((_, idx) => idx !== i))}
                  >×</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RichEditor({ value, onChange }) {
  const placeholders = ['{{name}}', '{{email}}', '{{company}}', '{{city}}', '{{custom}}'];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-white/70">Message</label>
        <div className="flex gap-1.5 flex-wrap">
          {placeholders.map(p => (
            <button
              key={p}
              className="text-xs px-2 py-0.5 bg-brand-600/20 text-brand-400 border border-brand-500/30 rounded-md hover:bg-brand-600/30 transition-colors font-mono"
              onClick={() => onChange(value + p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <textarea
        className="w-full h-48 bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50 resize-none font-mono leading-relaxed"
        placeholder={`Hi {{name}},\n\nYour message here...\n\nBest regards`}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      <p className="text-xs text-white/30">HTML is supported. Use placeholders to personalize.</p>
    </div>
  );
}

function ProgressPanel({ queueId, onDone }) {
  const [queue, setQueue] = useState(null);
  const pollRef = useRef();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await emailAPI.getStatus(queueId);
      setQueue(res.data.queue);
      if (['completed', 'stopped'].includes(res.data.queue.status)) {
        clearInterval(pollRef.current);
        onDone && onDone(res.data.queue);
      }
    } catch {}
  }, [queueId, onDone]);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 1500);
    return () => clearInterval(pollRef.current);
  }, [fetchStatus]);

  if (!queue) return <div className="text-center text-white/30 py-8">Loading...</div>;

  const progress = queue.totalCount > 0
    ? ((queue.sentCount + queue.failedCount) / queue.totalCount) * 100
    : 0;

  const handleStop = async () => {
    await emailAPI.stop(queueId);
    clearInterval(pollRef.current);
    fetchStatus();
  };

  const handlePause = async () => {
    await emailAPI.pause(queueId);
    clearInterval(pollRef.current);
    fetchStatus();
  };

  const handleResume = async () => {
    await emailAPI.resume(queueId);
    pollRef.current = setInterval(fetchStatus, 1500);
    fetchStatus();
  };

  const handleRetry = async () => {
    await emailAPI.retry(queueId);
    pollRef.current = setInterval(fetchStatus, 1500);
    fetchStatus();
  };

  const statusColors = {
    running: 'text-brand-400',
    completed: 'text-emerald-400',
    paused: 'text-yellow-400',
    stopped: 'text-red-400'
  };

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {queue.status === 'running' && <div className="w-2 h-2 bg-brand-400 rounded-full animate-pulse" />}
          <span className={`font-semibold capitalize ${statusColors[queue.status] || 'text-white'}`}>
            {queue.status}
          </span>
        </div>
        <div className="flex gap-2">
          {queue.status === 'running' && (
            <button onClick={handlePause} className="px-3 py-1.5 bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-xs rounded-lg hover:bg-yellow-500/30 transition-all">
              ⏸ Pause
            </button>
          )}
          {queue.status === 'paused' && (
            <button onClick={handleResume} className="px-3 py-1.5 bg-brand-500/20 border border-brand-500/30 text-brand-400 text-xs rounded-lg hover:bg-brand-500/30 transition-all">
              ▶ Resume
            </button>
          )}
          {['running', 'paused'].includes(queue.status) && (
            <button onClick={handleStop} className="px-3 py-1.5 bg-red-500/20 border border-red-500/30 text-red-400 text-xs rounded-lg hover:bg-red-500/30 transition-all">
              ⏹ Stop
            </button>
          )}
          {queue.status === 'completed' && queue.failedCount > 0 && (
            <button onClick={handleRetry} className="px-3 py-1.5 bg-orange-500/20 border border-orange-500/30 text-orange-400 text-xs rounded-lg hover:bg-orange-500/30 transition-all">
              🔄 Retry Failed
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-white/40 mb-2">
          <span>{queue.sentCount + queue.failedCount} / {queue.totalCount}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-3 bg-surface-600 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-brand-600 to-brand-400"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-emerald-400">{queue.sentCount}</div>
          <div className="text-xs text-emerald-400/60 mt-0.5">Sent</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-red-400">{queue.failedCount}</div>
          <div className="text-xs text-red-400/60 mt-0.5">Failed</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-white/60">{queue.totalCount - queue.sentCount - queue.failedCount}</div>
          <div className="text-xs text-white/30 mt-0.5">Pending</div>
        </div>
      </div>

      {/* Logs */}
      <div>
        <div className="text-xs font-medium text-white/40 mb-2">Activity Log</div>
        <div className="bg-surface-900 border border-white/5 rounded-xl p-3 h-40 overflow-y-auto font-mono text-xs space-y-1">
          {queue.logs && queue.logs.slice(-30).reverse().map((log, i) => (
            <div key={i} className={`flex gap-2 ${
              log.type === 'success' ? 'text-emerald-400' :
              log.type === 'error' ? 'text-red-400' :
              log.type === 'warning' ? 'text-yellow-400' :
              'text-white/40'
            }`}>
              <span className="text-white/20 flex-shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
              <span>{log.message}</span>
            </div>
          ))}
          {(!queue.logs || queue.logs.length === 0) && (
            <div className="text-white/20">No activity yet...</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Compose Page ────────────────────────────────────────────────────────
export default function Compose() {
  const [recipients, setRecipients] = useState([]);
  const [subject, setSubject] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [fromName, setFromName] = useState('');
  const [delayMin, setDelayMin] = useState(2);
  const [delayMax, setDelayMax] = useState(5);
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [queueId, setQueueId] = useState(null);
  const attachRef = useRef();

  const handleSend = async () => {
    if (recipients.length === 0) return toast.error('Add at least one recipient');
    if (!subject.trim()) return toast.error('Subject is required');
    if (!htmlContent.trim()) return toast.error('Email content is required');

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('subject', subject);
      formData.append('htmlContent', htmlContent);
      formData.append('fromName', fromName);
      formData.append('delayMin', delayMin);
      formData.append('delayMax', delayMax);
      formData.append('recipients', JSON.stringify(recipients));
      attachments.forEach(f => formData.append('attachments', f));

      const res = await emailAPI.sendBulk(formData);
      setQueueId(res.data.queueId);
      toast.success(`Campaign started! ${recipients.length} emails queued`);
    } catch {
      setSending(false);
    }
  };

  const handleDone = (queue) => {
    toast.success(`Campaign done! ${queue.sentCount} sent, ${queue.failedCount} failed`);
    // Update recipient statuses from queue
    setRecipients(prev => prev.map(r => {
      const matched = queue.recipients?.find(qr => qr.email === r.email);
      return matched ? { ...r, status: matched.status } : r;
    }));
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Compose Campaign</h1>
        <p className="text-white/40 text-sm mt-1">Send personalized bulk emails with progress tracking</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Form */}
        <div className="space-y-5">
          <div className="bg-surface-800 border border-white/5 rounded-2xl p-5 space-y-5">
            {/* From Name */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">From Name</label>
              <input
                className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50"
                placeholder="Your Name or Company"
                value={fromName}
                onChange={e => setFromName(e.target.value)}
              />
            </div>

            <RecipientInput recipients={recipients} setRecipients={setRecipients} />

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">Subject</label>
              <input
                className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50"
                placeholder="Hi {{name}}, we have something for you..."
                value={subject}
                onChange={e => setSubject(e.target.value)}
              />
            </div>

            <RichEditor value={htmlContent} onChange={setHtmlContent} />

            {/* Attachments */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">Attachments</label>
              <div
                className="border-2 border-dashed border-white/10 rounded-xl p-4 text-center cursor-pointer hover:border-brand-500/40 transition-colors"
                onClick={() => attachRef.current?.click()}
              >
                <div className="text-white/30 text-sm">
                  {attachments.length > 0
                    ? `${attachments.length} file(s) selected`
                    : 'Click to add attachments (max 5, 10MB each)'
                  }
                </div>
              </div>
              <input
                ref={attachRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => setAttachments(Array.from(e.target.files).slice(0, 5))}
              />
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {attachments.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-600 border border-white/10 rounded-lg text-xs text-white/60">
                      📎 {f.name}
                      <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-white/30 hover:text-red-400">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Delay settings */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Min Delay (sec)</label>
                <input type="number" min={1} max={30} value={delayMin}
                  onChange={e => setDelayMin(+e.target.value)}
                  className="w-full bg-surface-700 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Max Delay (sec)</label>
                <input type="number" min={1} max={60} value={delayMax}
                  onChange={e => setDelayMax(+e.target.value)}
                  className="w-full bg-surface-700 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500/50"
                />
              </div>
            </div>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={sending || !!queueId}
              className="w-full py-3 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-semibold transition-all duration-200 shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30"
            >
              {queueId ? '✓ Campaign Running' : sending ? 'Starting...' : `🚀 Send to ${recipients.length} Recipient${recipients.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>

        {/* Right: Progress */}
        <div className="bg-surface-800 border border-white/5 rounded-2xl p-5">
          {queueId ? (
            <ProgressPanel queueId={queueId} onDone={handleDone} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-12 text-white/20">
              <div className="text-5xl mb-4">📊</div>
              <div className="text-sm">Progress will appear here</div>
              <div className="text-xs mt-1">once you start sending</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

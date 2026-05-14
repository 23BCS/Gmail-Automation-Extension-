/**
 * Compose Page — Fixed:
 * 1. CSV drag-and-drop + file input parsed client-side (no server round-trip)
 * 2. Stop button properly clears polling AND resets UI state
 * 3. Message plain text → HTML with line breaks preserved (no paragraph collapse)
 * 4. Attachment drag-and-drop with full file list UI
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { emailAPI } from '../utils/api';

// ─── CSV parser (runs in browser, no server call needed) ──────────────────────
function parseCSVText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const headers = splitCSVLine(lines[0]).map(h =>
    h.replace(/^["'\s]+|["'\s]+$/g, '').toLowerCase()
  );

  const emailIdx   = headers.findIndex(h => ['email','mail','e-mail','email address','emailaddress'].includes(h));
  const nameIdx    = headers.findIndex(h => ['name','full name','fullname','first name','firstname'].includes(h));
  const companyIdx = headers.findIndex(h => ['company','organization','org','company name'].includes(h));
  const cityIdx    = headers.findIndex(h => ['city','location','town'].includes(h));

  // If no recognizable header found, treat first col as emails (no header row)
  const dataStart = emailIdx === -1 ? 0 : 1;
  const results = [];

  for (let i = dataStart; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]).map(c => c.replace(/^["'\s]+|["'\s]+$/g, '').trim());
    const email = emailIdx >= 0 ? cols[emailIdx] : cols[0];
    if (!email || !email.includes('@') || !email.includes('.')) continue;

    const row = { email: email.trim() };
    if (nameIdx    >= 0 && cols[nameIdx])    row.name    = cols[nameIdx];
    if (companyIdx >= 0 && cols[companyIdx]) row.company = cols[companyIdx];
    if (cityIdx    >= 0 && cols[cityIdx])    row.city    = cols[cityIdx];

    // Store ALL columns so any {{placeholder}} can be filled
    headers.forEach((h, idx) => { if (cols[idx]) row[h] = cols[idx]; });
    results.push(row);
  }
  return results;
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

// ─── Convert plain text → HTML preserving formatting ─────────────────────────
function textToHtml(text) {
  if (!text) return '';
  // If user already wrote HTML tags, send as-is
  if (/<[a-zA-Z][\s\S]*?>/.test(text)) return text;

  // Escape HTML entities first
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Split into paragraphs on double newlines, single newlines → <br>
  const paragraphs = escaped.split(/\n{2,}/);
  return paragraphs
    .map(p => `<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#333333;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// ─── RecipientInput component ─────────────────────────────────────────────────
function RecipientInput({ recipients, setRecipients, disabled }) {
  const [inputValue, setInputValue] = useState('');
  const [csvDragging, setCsvDragging] = useState(false);
  const fileRef = useRef();

  const addEmails = useCallback((text) => {
    const raw = text.split(/[\n,;\t|]+/).map(e => e.trim()).filter(Boolean);
    const valid = raw.filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (!valid.length) { toast.error('No valid email addresses found'); return 0; }

    let added = 0;
    setRecipients(prev => {
      const existing = new Set(prev.map(r => r.email.toLowerCase()));
      const newOnes = valid
        .filter(e => !existing.has(e.toLowerCase()))
        .map(email => ({ email, name: '', status: 'pending' }));
      added = newOnes.length;
      return [...prev, ...newOnes];
    });
    setInputValue('');
    return added;
  }, [setRecipients]);

  const handleCSVFile = useCallback((file) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
      toast.error('Please upload a .csv file'); return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseCSVText(e.target.result);
        if (!parsed.length) { toast.error('No valid emails found in CSV — check your column headers'); return; }
        setRecipients(prev => {
          const existing = new Set(prev.map(r => r.email.toLowerCase()));
          const added = parsed.filter(r => !existing.has(r.email.toLowerCase())).map(r => ({ ...r, status: 'pending' }));
          toast.success(`✅ Added ${added.length} of ${parsed.length} emails from CSV`);
          return [...prev, ...added];
        });
      } catch (err) {
        toast.error('CSV read error: ' + err.message);
      }
    };
    reader.onerror = () => toast.error('Could not read file');
    reader.readAsText(file);
  }, [setRecipients]);

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-white/70">Recipients</label>

      {/* Manual input row */}
      <div className="flex gap-2">
        <textarea
          className="flex-1 bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50 resize-none h-20 disabled:opacity-40"
          placeholder="Enter emails separated by comma, semicolon, or newline..."
          value={inputValue}
          disabled={disabled}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const n = addEmails(inputValue);
              if (n > 0) toast.success(`Added ${n} recipient${n > 1 ? 's' : ''}`);
            }
          }}
        />
        <div className="flex flex-col gap-2">
          <button type="button" disabled={disabled}
            className="px-4 py-2 bg-brand-600/20 hover:bg-brand-600/40 border border-brand-500/30 rounded-xl text-sm text-brand-400 disabled:opacity-40 transition-all"
            onClick={() => { const n = addEmails(inputValue); if (n > 0) toast.success(`Added ${n} recipients`); }}
          >Add</button>
          <button type="button" disabled={disabled}
            className="px-4 py-2 bg-surface-600 hover:bg-surface-500 border border-white/10 rounded-xl text-sm text-white/70 hover:text-white disabled:opacity-40 transition-all"
            onClick={() => fileRef.current?.click()}
          >📂 CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => { handleCSVFile(e.target.files[0]); e.target.value = ''; }} />
        </div>
      </div>

      {/* CSV drag & drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all select-none ${
          csvDragging
            ? 'border-brand-400 bg-brand-500/10 text-brand-300'
            : 'border-white/10 hover:border-brand-500/30 text-white/30 hover:text-white/50'
        } ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
        onDragOver={e => { e.preventDefault(); setCsvDragging(true); }}
        onDragLeave={e => { e.preventDefault(); setCsvDragging(false); }}
        onDrop={e => {
          e.preventDefault(); setCsvDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) handleCSVFile(f);
        }}
        onClick={() => !disabled && fileRef.current?.click()}
      >
        <div className="text-2xl mb-1">{csvDragging ? '📂' : '📎'}</div>
        <div className="text-xs font-medium">{csvDragging ? 'Release to upload CSV' : 'Drag & drop CSV here, or click to browse'}</div>
        <div className="text-xs mt-1 opacity-60">Required column: <code className="font-mono">email</code> &nbsp;|&nbsp; Optional: <code className="font-mono">name, company, city</code></div>
      </div>

      {/* CSV format hint */}
      <div className="bg-surface-900/60 rounded-lg px-3 py-2 font-mono text-xs text-white/25 leading-relaxed">
        email,name,company<br/>
        john@example.com,John Doe,Acme Corp
      </div>

      {/* Recipient tags */}
      {recipients.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/40">
              {recipients.length} recipient{recipients.length !== 1 ? 's' : ''}
              {recipients.filter(r => r.name).length > 0 &&
                <span className="text-brand-400/60 ml-1">· {recipients.filter(r => r.name).length} with names</span>}
            </span>
            {!disabled && (
              <button type="button" onClick={() => setRecipients([])}
                className="text-red-400 hover:text-red-300 transition-colors">
                Clear all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
            {recipients.map((r, i) => (
              <div key={`${r.email}-${i}`} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                r.status === 'sent'    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                r.status === 'failed'  ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                r.status === 'sending' ? 'bg-brand-500/10 border-brand-500/30 text-brand-400 animate-pulse' :
                'bg-surface-600 border-white/10 text-white/60'
              }`}>
                <span>
                  {r.status === 'sent' ? '✓ ' : r.status === 'failed' ? '✗ ' : r.status === 'sending' ? '⟳ ' : ''}
                  {r.name ? r.name : r.email}
                </span>
                {r.status === 'pending' && !disabled && (
                  <button type="button"
                    className="text-white/30 hover:text-red-400 transition-colors ml-0.5 leading-none"
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

// ─── Rich text editor with live preview ──────────────────────────────────────
function RichEditor({ value, onChange, disabled }) {
  const [preview, setPreview] = useState(false);
  const textareaRef = useRef();
  const placeholders = ['{{name}}', '{{email}}', '{{company}}', '{{city}}'];

  const insertPlaceholder = (ph) => {
    const el = textareaRef.current;
    if (!el) { onChange(value + ph); return; }
    const s = el.selectionStart, e = el.selectionEnd;
    const next = value.slice(0, s) + ph + value.slice(e);
    onChange(next);
    setTimeout(() => { el.selectionStart = el.selectionEnd = s + ph.length; el.focus(); }, 0);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="text-sm font-medium text-white/70">Message</label>
        <div className="flex items-center gap-1.5 flex-wrap">
          {placeholders.map(p => (
            <button key={p} type="button" disabled={disabled}
              onClick={() => insertPlaceholder(p)}
              className="text-xs px-2 py-0.5 bg-brand-600/20 text-brand-400 border border-brand-500/30 rounded-md hover:bg-brand-600/40 disabled:opacity-40 transition-colors font-mono">
              {p}
            </button>
          ))}
          <button type="button" onClick={() => setPreview(v => !v)}
            className={`text-xs px-3 py-1 rounded-lg border transition-all ${
              preview ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                      : 'bg-surface-600 border-white/10 text-white/50 hover:text-white'
            }`}>
            {preview ? '✏️ Edit' : '👁 Preview'}
          </button>
        </div>
      </div>

      {preview ? (
        /* Preview renders the actual HTML the recipient will see */
        <div className="w-full min-h-52 bg-white rounded-xl px-5 py-4 overflow-auto text-gray-800"
          dangerouslySetInnerHTML={{ __html: textToHtml(value) || '<p style="color:#aaa;font-family:Arial,sans-serif;font-size:14px;">Nothing to preview yet...</p>' }}
        />
      ) : (
        <textarea ref={textareaRef} disabled={disabled}
          className="w-full h-52 bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50 resize-y leading-relaxed disabled:opacity-40"
          placeholder={"Hi {{name}},\n\nI'm reaching out from {{company}} to...\n\nLooking forward to hearing from you.\n\nBest regards,\nYour Name"}
          value={value}
          onChange={e => onChange(e.target.value)}
          spellCheck
        />
      )}

      <p className="text-xs text-white/30">
        💡 Plain text is auto-formatted. Click <strong>Preview</strong> to see how recipients will see it.
        HTML tags like <code className="font-mono">&lt;b&gt;</code>, <code className="font-mono">&lt;a href=""&gt;</code> are supported.
      </p>
    </div>
  );
}

// ─── Attachment upload component ──────────────────────────────────────────────
function AttachmentUpload({ attachments, setAttachments, disabled }) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();
  const MAX = 5;

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList);
    setAttachments(prev => {
      const combined = [...prev, ...incoming].slice(0, MAX);
      if (prev.length + incoming.length > MAX)
        toast(`Only ${MAX} attachments allowed — kept first ${MAX}`);
      return combined;
    });
  };

  const fmt = (bytes) => bytes < 1024 * 1024
    ? (bytes / 1024).toFixed(1) + ' KB'
    : (bytes / (1024 * 1024)).toFixed(1) + ' MB';

  const icon = (name) => {
    const ext = name.split('.').pop().toLowerCase();
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '🖼️';
    if (ext === 'pdf') return '📄';
    if (['doc','docx'].includes(ext)) return '📝';
    if (['xls','xlsx','csv'].includes(ext)) return '📊';
    return '📎';
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-white/70">
        Attachments <span className="font-normal text-white/30 text-xs">(up to {MAX} files · 10 MB each)</span>
      </label>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all select-none ${
          dragging ? 'border-brand-400 bg-brand-500/10 text-brand-300'
                   : 'border-white/10 hover:border-brand-500/30 text-white/30 hover:text-white/50'
        } ${(disabled || attachments.length >= MAX) ? 'opacity-40 pointer-events-none' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={e => { e.preventDefault(); setDragging(false); }}
        onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
      >
        <div className="text-xl mb-1">{dragging ? '📂' : '📎'}</div>
        <div className="text-xs">
          {attachments.length >= MAX
            ? `Maximum ${MAX} files reached`
            : dragging ? 'Drop files here'
            : 'Drag & drop files or click to browse'}
        </div>
        <div className="text-xs mt-1 opacity-60">PDF, DOC, DOCX, TXT, JPG, PNG, XLSX</div>
      </div>

      <input ref={fileRef} type="file" multiple className="hidden"
        accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.xlsx,.xls"
        onChange={e => { if (e.target.files.length) addFiles(e.target.files); e.target.value = ''; }}
      />

      {/* File list */}
      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map((f, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-surface-700 border border-white/10 rounded-xl">
              <span className="text-lg flex-shrink-0">{icon(f.name)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white/80 truncate">{f.name}</div>
                <div className="text-xs text-white/30">{fmt(f.size)}</div>
              </div>
              {!disabled && (
                <button type="button"
                  onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                  className="text-white/30 hover:text-red-400 transition-colors text-lg leading-none">×</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Progress panel ───────────────────────────────────────────────────────────
function ProgressPanel({ queueId, onDone, onStop }) {
  const [queue,    setQueue]    = useState(null);
  const [stopping, setStopping] = useState(false);
  const [pausing,  setPausing]  = useState(false);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await emailAPI.getStatus(queueId);
      const q = res.data.queue;
      setQueue(q);
      if (['completed', 'stopped'].includes(q.status)) {
        stopPolling();
        onDone?.(q);
      }
    } catch (err) { console.error('Poll error:', err.message); }
  }, [queueId, onDone, stopPolling]);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 2000);
    return () => stopPolling();
  }, [fetchStatus, stopPolling]);

  // ── Stop ──
  const handleStop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      stopPolling();                    // 1. immediately stop polling
      await emailAPI.stop(queueId);    // 2. signal backend
      await fetchStatus();             // 3. get final snapshot
      toast.success('⏹ Campaign stopped');
      onStop?.();                      // 4. re-enable parent send button
    } catch (err) {
      toast.error('Stop failed: ' + err.message);
      pollRef.current = setInterval(fetchStatus, 2000); // resume polling on error
    } finally { setStopping(false); }
  };

  // ── Pause ──
  const handlePause = async () => {
    if (pausing) return;
    setPausing(true);
    try {
      stopPolling();
      await emailAPI.pause(queueId);
      await fetchStatus();
      toast('⏸ Campaign paused');
    } catch { toast.error('Pause failed'); pollRef.current = setInterval(fetchStatus, 2000); }
    finally { setPausing(false); }
  };

  // ── Resume ──
  const handleResume = async () => {
    try {
      await emailAPI.resume(queueId);
      pollRef.current = setInterval(fetchStatus, 2000);
      fetchStatus();
      toast.success('▶ Campaign resumed');
    } catch { toast.error('Resume failed'); }
  };

  // ── Retry ──
  const handleRetry = async () => {
    try {
      await emailAPI.retry(queueId);
      pollRef.current = setInterval(fetchStatus, 2000);
      fetchStatus();
      toast.success('🔄 Retrying failed emails...');
    } catch { toast.error('Retry failed'); }
  };

  if (!queue) return (
    <div className="flex flex-col items-center justify-center flex-1 py-12 text-white/30">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
      <div className="text-sm">Connecting to queue...</div>
    </div>
  );

  const done      = queue.sentCount + queue.failedCount;
  const progress  = queue.totalCount > 0 ? (done / queue.totalCount) * 100 : 0;
  const isRunning  = queue.status === 'running';
  const isPaused   = queue.status === 'paused';
  const isFinished = ['completed', 'stopped'].includes(queue.status);

  const statusStyle = {
    running:   'text-brand-400',
    completed: 'text-emerald-400',
    paused:    'text-yellow-400',
    stopped:   'text-red-400',
    pending:   'text-white/50'
  };

  return (
    <div className="space-y-4 animate-fade-in flex flex-col h-full">

      {/* Status + controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {isRunning && <div className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />}
          <span className={`text-sm font-semibold capitalize ${statusStyle[queue.status] || 'text-white'}`}>
            {queue.status}
          </span>
          <span className="text-xs text-white/25 font-mono">#{queueId.slice(0, 8)}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isRunning && (
            <button onClick={handlePause} disabled={pausing}
              className="px-3 py-1.5 text-xs bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 rounded-lg hover:bg-yellow-500/30 disabled:opacity-50 transition-all">
              {pausing ? '...' : '⏸ Pause'}
            </button>
          )}
          {isPaused && (
            <button onClick={handleResume}
              className="px-3 py-1.5 text-xs bg-brand-500/20 border border-brand-500/30 text-brand-400 rounded-lg hover:bg-brand-500/30 transition-all">
              ▶ Resume
            </button>
          )}
          {(isRunning || isPaused) && (
            <button onClick={handleStop} disabled={stopping}
              className="px-3 py-1.5 text-xs bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/30 disabled:opacity-50 transition-all">
              {stopping ? '⏳ Stopping...' : '⏹ Stop'}
            </button>
          )}
          {isFinished && queue.failedCount > 0 && (
            <button onClick={handleRetry}
              className="px-3 py-1.5 text-xs bg-orange-500/20 border border-orange-500/30 text-orange-400 rounded-lg hover:bg-orange-500/30 transition-all">
              🔄 Retry {queue.failedCount} failed
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-white/40 mb-1.5">
          <span>{done} / {queue.totalCount} emails processed</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2.5 bg-surface-600 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              queue.status === 'completed' ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' :
              queue.status === 'stopped'   ? 'bg-gradient-to-r from-red-700 to-red-500' :
              'bg-gradient-to-r from-brand-600 to-brand-400'
            }`}
            style={{ width: `${Math.max(progress > 0 ? 1.5 : 0, progress)}%` }}
          />
        </div>
      </div>

      {/* Stats boxes */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-emerald-400">{queue.sentCount}</div>
          <div className="text-xs text-emerald-400/60 mt-0.5">Sent ✓</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-red-400">{queue.failedCount}</div>
          <div className="text-xs text-red-400/60 mt-0.5">Failed ✗</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-white/60">{Math.max(0, queue.totalCount - done)}</div>
          <div className="text-xs text-white/30 mt-0.5">Pending</div>
        </div>
      </div>

      {/* Activity log */}
      <div className="flex-1">
        <div className="text-xs font-medium text-white/40 mb-1.5">Activity Log</div>
        <div className="bg-surface-900 border border-white/5 rounded-xl p-3 h-44 overflow-y-auto font-mono text-xs space-y-1.5">
          {queue.logs?.length > 0
            ? [...queue.logs].reverse().slice(0, 50).map((log, i) => (
              <div key={i} className={`flex gap-2 ${
                log.type === 'success' ? 'text-emerald-400' :
                log.type === 'error'   ? 'text-red-400' :
                log.type === 'warning' ? 'text-yellow-400' :
                'text-white/40'
              }`}>
                <span className="text-white/20 flex-shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="break-words">{log.message}</span>
              </div>
            ))
            : <div className="text-white/20">No activity yet...</div>
          }
        </div>
      </div>

      {/* Completion banner */}
      {isFinished && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium text-center ${
          queue.status === 'completed'
            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {queue.status === 'completed' ? '✅' : '⏹'} Campaign {queue.status} — {queue.sentCount} sent · {queue.failedCount} failed
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Compose() {
  const [recipients,   setRecipients]   = useState([]);
  const [subject,      setSubject]      = useState('');
  const [message,      setMessage]      = useState('');
  const [fromName,     setFromName]     = useState('');
  const [delayMin,     setDelayMin]     = useState(2);
  const [delayMax,     setDelayMax]     = useState(5);
  const [attachments,  setAttachments]  = useState([]);
  const [sending,      setSending]      = useState(false);
  const [queueId,      setQueueId]      = useState(null);
  const campaignActive = !!queueId;

  const handleSend = async () => {
    if (!recipients.length) return toast.error('Add at least one recipient');
    if (!subject.trim())    return toast.error('Subject is required');
    if (!message.trim())    return toast.error('Message content is required');
    if (delayMin > delayMax) return toast.error('Min delay must be ≤ Max delay');

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('subject',     subject.trim());
      formData.append('htmlContent', textToHtml(message));   // ← converts plain text to proper HTML
      formData.append('fromName',    fromName.trim() || 'Gmail Automation');
      formData.append('delayMin',    String(delayMin));
      formData.append('delayMax',    String(delayMax));
      formData.append('recipients',  JSON.stringify(recipients));
      attachments.forEach(f => formData.append('attachments', f));

      const res = await emailAPI.sendBulk(formData);
      if (!res.data?.success) throw new Error(res.data?.message || 'Server error');

      setQueueId(res.data.queueId);
      toast.success(`🚀 Campaign started! ${recipients.length} emails queued`);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to start campaign');
      setSending(false);
    }
  };

  const handleDone = (q) => {
    toast.success(`✅ Done! ${q.sentCount} sent · ${q.failedCount} failed`);
    setRecipients(prev => prev.map(r => {
      const match = q.recipients?.find(qr => qr.email === r.email);
      return match ? { ...r, status: match.status } : r;
    }));
  };

  // Called when user clicks Stop — re-enables the form
  const handleStop = () => {
    setSending(false);
    setQueueId(null);
  };

  const newCampaign = () => {
    setQueueId(null); setSending(false);
    setRecipients([]); setSubject('');
    setMessage(''); setAttachments([]);
    toast('Ready for a new campaign');
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Compose Campaign</h1>
          <p className="text-white/40 text-sm mt-1">
            Bulk email with personalization, attachments &amp; progress tracking
          </p>
        </div>
        {campaignActive && (
          <button onClick={newCampaign}
            className="text-xs px-4 py-2 bg-surface-700 hover:bg-surface-600 border border-white/10 rounded-xl text-white/60 hover:text-white transition-all">
            + New Campaign
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Left: Compose form ────────────────────────────────────────── */}
        <div className="bg-surface-800 border border-white/5 rounded-2xl p-5 space-y-5">

          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">From Name</label>
            <input disabled={campaignActive}
              className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50 disabled:opacity-40 transition-colors"
              placeholder="Your Name or Company"
              value={fromName} onChange={e => setFromName(e.target.value)}
            />
          </div>

          <RecipientInput
            recipients={recipients}
            setRecipients={setRecipients}
            disabled={campaignActive}
          />

          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Subject</label>
            <input disabled={campaignActive}
              className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50 disabled:opacity-40 transition-colors"
              placeholder="Hi {{name}}, we have something for you..."
              value={subject} onChange={e => setSubject(e.target.value)}
            />
          </div>

          <RichEditor value={message} onChange={setMessage} disabled={campaignActive} />

          <AttachmentUpload
            attachments={attachments}
            setAttachments={setAttachments}
            disabled={campaignActive}
          />

          {/* Delay */}
          <div className="grid grid-cols-2 gap-3">
            {[['Min Delay (sec)', delayMin, setDelayMin, 1, 60],
              ['Max Delay (sec)', delayMax, setDelayMax, 1, 120]].map(([lbl, val, set, mn, mx]) => (
              <div key={lbl}>
                <label className="block text-xs text-white/50 mb-1.5">{lbl}</label>
                <input type="number" min={mn} max={mx} value={val} disabled={campaignActive}
                  onChange={e => set(Math.max(mn, Math.min(mx, +e.target.value)))}
                  className="w-full bg-surface-700 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500/50 disabled:opacity-40"
                />
              </div>
            ))}
          </div>

          {/* Send / status button */}
          <button onClick={handleSend} disabled={sending || campaignActive}
            className="w-full py-3 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-semibold transition-all duration-200 shadow-lg shadow-brand-500/20">
            {campaignActive
              ? '✓ Campaign running — see progress →'
              : sending
              ? '⏳ Starting...'
              : `🚀 Send to ${recipients.length} Recipient${recipients.length !== 1 ? 's' : ''}`}
          </button>
        </div>

        {/* ── Right: Progress panel ─────────────────────────────────────── */}
        <div className="bg-surface-800 border border-white/5 rounded-2xl p-5 flex flex-col min-h-96">
          {queueId ? (
            <ProgressPanel
              queueId={queueId}
              onDone={handleDone}
              onStop={handleStop}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-white/20 py-12">
              <div className="text-5xl mb-4">📊</div>
              <div className="text-sm">Progress tracker</div>
              <div className="text-xs mt-1">appears here once you send</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
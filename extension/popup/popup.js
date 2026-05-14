/**
 * Gmail Automation Extension — Popup Script (Fixed)
 * Fix 1: CSV drag-drop & file input parsed entirely client-side
 * Fix 2: Stop button properly kills polling and resets UI immediately
 * Fix 3: Plain text → HTML preserving line breaks / paragraphs
 * Fix 4: Full attachment support with drag-drop on the Files tab
 */
'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  recipients:    [],   // [{email, name, company, status}]
  attachments:   [],   // File objects
  activeQueueId: null,
  pollInterval:  null,
  settings: {
    apiUrl:      'http://localhost:5000/api',
    delayMin:    2,
    delayMax:    5,
    retryFailed: true,
    notifications: true
  }
};

// ─── DOM shortcuts ────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  restoreActiveQueue();
  bindAll();
});

// ─── Tab switching ────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $(`panel-${tab.dataset.tab}`).classList.add('active');
  });
});

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${name}`));
}

// ─── Bind all events ──────────────────────────────────────────────────────────
function bindAll() {

  // Header buttons
  $('btn-dashboard').onclick = () => chrome.tabs.create({ url: state.settings.apiUrl.replace('/api','') || 'http://localhost:3000' });
  $('btn-refresh').onclick   = () => { if (state.activeQueueId) pollStatus(); showToast('Refreshed'); };

  // ── Compose: Recipients ────────────────────────────────────────────────
  $('btn-add-recip').onclick = () => { addEmailsFromText($('recip-input').value); $('recip-input').value = ''; };
  $('recip-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addEmailsFromText($('recip-input').value);
      $('recip-input').value = '';
    }
  });

  // CSV via button
  $('btn-csv-pick').onclick  = () => $('csv-file').click();
  $('csv-file').onchange     = e => { if (e.target.files[0]) readCSVFile(e.target.files[0]); e.target.value = ''; };

  // CSV via drag-drop
  const csvDrop = $('csv-drop');
  csvDrop.addEventListener('dragover',  e => { e.preventDefault(); csvDrop.classList.add('drag'); });
  csvDrop.addEventListener('dragleave', e => { e.preventDefault(); csvDrop.classList.remove('drag'); });
  csvDrop.addEventListener('drop',      e => {
    e.preventDefault(); csvDrop.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) readCSVFile(f);
  });
  csvDrop.addEventListener('click', () => $('csv-file').click());

  // Placeholder pills
  document.querySelectorAll('.pill').forEach(pill => {
    pill.onclick = () => insertAtCursor($('message'), pill.dataset.ph);
  });

  // Send
  $('btn-send').onclick = handleSend;

  // ── Files (Attachments) tab ────────────────────────────────────────────
  $('btn-attach-browse').onclick = () => $('attach-file-input').click();
  $('attach-file-input').onchange = e => { if (e.target.files.length) addAttachments(e.target.files); e.target.value = ''; };

  const attDrop = $('attach-drop');
  attDrop.addEventListener('dragover',  e => { e.preventDefault(); attDrop.classList.add('drag'); });
  attDrop.addEventListener('dragleave', e => { e.preventDefault(); attDrop.classList.remove('drag'); });
  attDrop.addEventListener('drop',      e => {
    e.preventDefault(); attDrop.classList.remove('drag');
    if (e.dataTransfer.files.length) addAttachments(e.dataTransfer.files);
  });

  // ── Progress controls ──────────────────────────────────────────────────
  $('btn-pause').onclick  = handlePause;
  $('btn-stop').onclick   = handleStop;
  $('btn-resume').onclick = handleResume;
  $('btn-retry').onclick  = handleRetry;

  // ── Settings ───────────────────────────────────────────────────────────
  $('btn-verify').onclick       = handleVerify;
  $('btn-save-settings').onclick= saveSettings;
  $('btn-show-pass').onclick    = () => {
    const p = $('s-pass');
    p.type = p.type === 'password' ? 'text' : 'password';
    $('btn-show-pass').textContent = p.type === 'password' ? '👁' : '🙈';
  };
  $('t-retry').onclick  = function() { this.classList.toggle('on'); };
  $('t-notif').onclick  = function() { this.classList.toggle('on'); };

  // Background queue updates
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'QUEUE_UPDATE' && msg.queue) updateProgressUI(msg.queue);
  });
}

// ─── Fix 1: CSV parsing client-side ──────────────────────────────────────────
function readCSVFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv') && !file.type.includes('csv')) {
    showToast('Please select a .csv file', true); return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSV(e.target.result);
    if (!rows.length) { showToast('No valid emails found in CSV', true); return; }
    const existing = new Set(state.recipients.map(r => r.email.toLowerCase()));
    const added = rows.filter(r => !existing.has(r.email.toLowerCase())).map(r => ({ ...r, status: 'pending' }));
    state.recipients.push(...added);
    renderRecipients();
    showToast(`✅ Added ${added.length} of ${rows.length} emails from CSV`);
  };
  reader.onerror = () => showToast('Could not read file', true);
  reader.readAsText(file);
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const headers = splitLine(lines[0]).map(h => h.replace(/["']/g,'').trim().toLowerCase());
  const eIdx = headers.findIndex(h => ['email','mail','e-mail','email address'].includes(h));
  const nIdx = headers.findIndex(h => ['name','full name','fullname'].includes(h));
  const cIdx = headers.findIndex(h => ['company','organization','org'].includes(h));
  const cityIdx = headers.findIndex(h => ['city','location','town'].includes(h));

  const start  = eIdx === -1 ? 0 : 1;
  const result = [];

  for (let i = start; i < lines.length; i++) {
    const cols  = splitLine(lines[i]).map(c => c.replace(/["']/g,'').trim());
    const email = eIdx >= 0 ? cols[eIdx] : cols[0];
    if (!email || !email.includes('@') || !email.includes('.')) continue;
    const row = { email };
    if (nIdx    >= 0 && cols[nIdx])    row.name    = cols[nIdx];
    if (cIdx    >= 0 && cols[cIdx])    row.company = cols[cIdx];
    if (cityIdx >= 0 && cols[cityIdx]) row.city    = cols[cityIdx];
    headers.forEach((h, idx) => { if (cols[idx]) row[h] = cols[idx]; });
    result.push(row);
  }
  return result;
}

function splitLine(line) {
  const res = []; let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { res.push(cur); cur = ''; continue; }
    cur += ch;
  }
  res.push(cur);
  return res;
}

function addEmailsFromText(text) {
  if (!text.trim()) return;
  const emails = text.split(/[\n,;|\t]+/).map(e => e.trim()).filter(e => e.includes('@') && e.includes('.'));
  if (!emails.length) { showToast('No valid emails found', true); return; }
  const existing = new Set(state.recipients.map(r => r.email.toLowerCase()));
  const added = emails.filter(e => !existing.has(e.toLowerCase())).map(email => ({ email, name:'', status:'pending' }));
  state.recipients.push(...added);
  renderRecipients();
  if (added.length) showToast(`Added ${added.length} recipient${added.length > 1?'s':''}`);
}

function renderRecipients() {
  const wrap = $('recip-tags');
  wrap.innerHTML = '';
  state.recipients.forEach((r, i) => {
    const tag = document.createElement('div');
    tag.className = `tag ${r.status !== 'pending' ? r.status : ''}`;
    tag.innerHTML = `
      ${r.status==='sent'?'✓ ':r.status==='failed'?'✗ ':r.status==='sending'?'⟳ ':''}
      ${esc(r.name || r.email)}
      ${r.status==='pending'?`<span class="x" data-i="${i}">×</span>`:''}
    `;
    wrap.appendChild(tag);
  });
  wrap.querySelectorAll('.x').forEach(x => {
    x.onclick = e => { e.stopPropagation(); state.recipients.splice(+x.dataset.i, 1); renderRecipients(); };
  });
  const n = state.recipients.length;
  $('recip-count').textContent = n ? `${n} recipient${n>1?'s':''}${state.recipients.filter(r=>r.name).length?' (with names)':''}` : '';
  $('btn-send').textContent = n > 0 ? `🚀 Send to ${n} Recipient${n>1?'s':''}` : '🚀 Start Campaign';
}

// ─── Fix 4: Attachments ───────────────────────────────────────────────────────
function addAttachments(fileList) {
  const incoming = Array.from(fileList);
  const combined = [...state.attachments, ...incoming].slice(0, 5);
  if (state.attachments.length + incoming.length > 5) showToast('Max 5 files — kept first 5');
  state.attachments = combined;
  renderAttachments();
}

function renderAttachments() {
  const list = $('attach-list');
  list.innerHTML = '';
  state.attachments.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = 'attach-item';
    item.innerHTML = `
      <div class="attach-icon">${fileIcon(f.name)}</div>
      <div class="attach-info">
        <div class="attach-name">${esc(f.name)}</div>
        <div class="attach-size">${fmtSize(f.size)}</div>
      </div>
      <div class="attach-rm" data-i="${i}">×</div>
    `;
    list.appendChild(item);
  });
  list.querySelectorAll('.attach-rm').forEach(btn => {
    btn.onclick = () => { state.attachments.splice(+btn.dataset.i, 1); renderAttachments(); };
  });
  const n = state.attachments.length;
  $('attach-count').textContent = n ? `${n} / 5 file${n>1?'s':''} attached` : 'No files attached';

  // Update drop zone text
  const dz = $('attach-drop');
  dz.classList.toggle('disabled', n >= 5);
}

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '🖼️';
  if (ext === 'pdf')  return '📄';
  if (['doc','docx'].includes(ext)) return '📝';
  if (['xls','xlsx','csv'].includes(ext)) return '📊';
  return '📎';
}

function fmtSize(b) {
  return b < 1024*1024 ? (b/1024).toFixed(1)+' KB' : (b/(1024*1024)).toFixed(1)+' MB';
}

// ─── Fix 3: Plain text → HTML ─────────────────────────────────────────────────
function textToHtml(text) {
  if (!text) return '';
  if (/<[a-zA-Z][\s\S]*?>/.test(text)) return text; // already HTML
  const esc2 = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const paras = esc2.split(/\n{2,}/);
  return paras
    .map(p => `<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#333;">${p.replace(/\n/g,'<br>')}</p>`)
    .join('');
}

// ─── Send campaign ────────────────────────────────────────────────────────────
async function handleSend() {
  const subject = $('subject').value.trim();
  const message = $('message').value.trim();
  const fromName= $('from-name').value.trim();

  if (!state.recipients.length) { showToast('Add at least one recipient', true); return; }
  if (!subject)  { showToast('Subject is required', true); return; }
  if (!message)  { showToast('Message is required', true); return; }

  const btn = $('btn-send');
  btn.disabled = true;
  btn.textContent = '⏳ Starting...';

  try {
    // Build FormData so we can include attachments
    const formData = new FormData();
    formData.append('subject',     subject);
    formData.append('htmlContent', textToHtml(message));   // ← Fix 3: proper HTML
    formData.append('fromName',    fromName || 'Gmail Automation');
    formData.append('delayMin',    $('delay-min').value);
    formData.append('delayMax',    $('delay-max').value);
    formData.append('recipients',  JSON.stringify(state.recipients));
    formData.append('retryFailed', $('t-retry').classList.contains('on'));
    state.attachments.forEach(f => formData.append('attachments', f));  // ← Fix 4

    const res = await fetch(`${state.settings.apiUrl}/email/send-bulk`, {
      method: 'POST',
      body: formData   // no Content-Type header — browser sets boundary automatically
    });
    const data = await res.json();

    if (!data.success) throw new Error(data.message || 'Server error');

    state.activeQueueId = data.queueId;
    chrome.storage.local.set({ activeQueue: { id: data.queueId, totalCount: state.recipients.length } });

    switchTab('progress');
    showQueueView(data.queueId);
    startPolling();
    showToast(`🚀 Campaign started! ${state.recipients.length} emails queued`);
    btn.textContent = '✓ Campaign Running';

  } catch (err) {
    showToast(err.message || 'Failed to send', true);
    btn.disabled = false;
    btn.textContent = `🚀 Send to ${state.recipients.length} Recipients`;
  }
}

// ─── Fix 2: Stop button — kills polling immediately, resets UI ────────────────
async function handleStop() {
  if (!state.activeQueueId) return;
  const btn = $('btn-stop');
  btn.disabled = true;
  btn.textContent = '⏳ Stopping...';

  try {
    stopPolling();                          // 1. kill polling FIRST so no stale updates
    await apiPost(`/email/stop/${state.activeQueueId}`);  // 2. tell server
    await pollStatus();                     // 3. get final state snapshot
    showToast('⏹ Campaign stopped');

    // 4. Re-enable compose
    state.activeQueueId = null;
    chrome.storage.local.remove('activeQueue');
    $('btn-send').disabled = false;
    $('btn-send').textContent = `🚀 Send to ${state.recipients.length} Recipients`;

    // Update controls UI
    $('ctrl-running').style.display = 'none';
    $('ctrl-paused').style.display  = 'none';

  } catch (err) {
    showToast('Stop failed: ' + err.message, true);
    startPolling(); // resume polling if stop failed
  }

  btn.disabled = false;
  btn.textContent = '⏹ Stop';
}

async function handlePause() {
  if (!state.activeQueueId) return;
  $('btn-pause').disabled = true;
  try {
    stopPolling();
    await apiPost(`/email/pause/${state.activeQueueId}`);
    await pollStatus();
    showToast('⏸ Campaign paused');
    $('ctrl-running').style.display = 'none';
    $('ctrl-paused').style.display  = 'block';
  } catch (err) {
    showToast('Pause failed: ' + err.message, true);
    startPolling();
  }
  $('btn-pause').disabled = false;
}

async function handleResume() {
  if (!state.activeQueueId) return;
  try {
    await apiPost(`/email/resume/${state.activeQueueId}`);
    $('ctrl-running').style.display = 'flex';
    $('ctrl-paused').style.display  = 'none';
    startPolling();
    showToast('▶ Campaign resumed');
  } catch (err) {
    showToast('Resume failed: ' + err.message, true);
  }
}

async function handleRetry() {
  if (!state.activeQueueId) return;
  try {
    await apiPost(`/email/retry/${state.activeQueueId}`);
    $('ctrl-retry').style.display = 'none';
    startPolling();
    showToast('🔄 Retrying failed emails...');
  } catch (err) {
    showToast('Retry failed: ' + err.message, true);
  }
}

// ─── Polling ──────────────────────────────────────────────────────────────────
function startPolling() {
  stopPolling();
  pollStatus();
  state.pollInterval = setInterval(pollStatus, 2000);
}

function stopPolling() {
  if (state.pollInterval) { clearInterval(state.pollInterval); state.pollInterval = null; }
}

async function pollStatus() {
  if (!state.activeQueueId) return;
  try {
    const res  = await fetch(`${state.settings.apiUrl}/email/status/${state.activeQueueId}`);
    const data = await res.json();
    if (data.success && data.queue) updateProgressUI(data.queue);
  } catch (err) {
    console.warn('[GmailAuto] Poll error:', err.message);
  }
}

function showQueueView(queueId) {
  $('no-queue').style.display   = 'none';
  $('queue-view').style.display = 'block';
  $('queue-id-label').textContent = queueId.slice(0, 8) + '…';
}

function updateProgressUI(q) {
  showQueueView(q.id);

  const done  = q.sentCount + q.failedCount;
  const total = q.totalCount;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  // Progress bar
  const fill = $('prog-fill');
  fill.style.width = pct + '%';
  fill.className   = `prog-fill${q.status==='completed'?' done':q.status==='stopped'?' stopped':''}`;

  $('prog-label').textContent = `${done} / ${total}`;
  $('prog-pct').textContent   = pct + '%';
  $('stat-sent').textContent  = q.sentCount;
  $('stat-fail').textContent  = q.failedCount;
  $('stat-pend').textContent  = Math.max(0, total - done);

  // Status badge
  const badge = $('status-badge');
  badge.className = `status-badge ${q.status}`;
  $('status-text').textContent = q.status;
  const dot = badge.querySelector('.dot');
  dot.className = `dot${q.status==='running'?' pulse':''}`;

  // Controls
  const running  = q.status === 'running';
  const paused   = q.status === 'paused';
  const finished = ['completed','stopped'].includes(q.status);

  $('ctrl-running').style.display = running  ? 'flex'  : 'none';
  $('ctrl-paused').style.display  = paused   ? 'block' : 'none';
  $('ctrl-retry').style.display   = (finished && q.failedCount > 0) ? 'block' : 'none';
  $('btn-retry').textContent      = `🔄 Retry ${q.failedCount} Failed`;

  // Re-enable send on completion
  if (finished) {
    stopPolling();
    $('btn-send').disabled    = false;
    $('btn-send').textContent = '🚀 Start New Campaign';
    chrome.storage.local.remove('activeQueue');
    if (state.settings.notifications) {
      chrome.notifications?.create({ type:'basic', iconUrl:'../icons/icon48.png',
        title: q.status==='completed' ? '✅ Campaign Complete!' : '⏹ Campaign Stopped',
        message: `Sent: ${q.sentCount} | Failed: ${q.failedCount} | Total: ${q.totalCount}` });
    }
  }

  // Badge
  chrome.action.setBadgeText({ text: finished ? '' : `${pct}%` });
  chrome.action.setBadgeBackgroundColor({ color:
    running ? '#0284c7' : q.status==='completed' ? '#10b981' :
    paused  ? '#f59e0b' : '#ef4444' });

  // Logs
  if (q.logs?.length) {
    const box = $('log-box');
    box.innerHTML = '';
    [...q.logs].reverse().slice(0, 30).forEach(log => {
      const row = document.createElement('div');
      row.className = 'log-row';
      row.innerHTML = `<span class="log-t">${new Date(log.timestamp).toLocaleTimeString([],{hour12:false})}</span><span class="log-m ${log.type}">${esc(log.message)}</span>`;
      box.appendChild(row);
    });
  }

  // Sync recipient statuses
  if (q.recipients) {
    q.recipients.forEach(qr => {
      const r = state.recipients.find(x => x.email === qr.email);
      if (r && r.status !== qr.status) r.status = qr.status;
    });
    renderRecipients();
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function loadSettings() {
  chrome.storage.sync.get(['settings','smtpSettings'], result => {
    if (result.settings) {
      Object.assign(state.settings, result.settings);
      $('s-api').value  = state.settings.apiUrl  || 'http://localhost:5000/api';
      $('s-dmin').value = state.settings.delayMin || 2;
      $('s-dmax').value = state.settings.delayMax || 5;
      if (!state.settings.retryFailed)    $('t-retry').classList.remove('on');
      if (!state.settings.notifications)  $('t-notif').classList.remove('on');
    }
    if (result.smtpSettings) {
      $('s-gmail').value = result.smtpSettings.gmailUser || '';
    }
  });
}

function saveSettings() {
  const s = {
    apiUrl:      $('s-api').value.trim()  || 'http://localhost:5000/api',
    delayMin:    parseInt($('s-dmin').value) || 2,
    delayMax:    parseInt($('s-dmax').value) || 5,
    retryFailed: $('t-retry').classList.contains('on'),
    notifications: $('t-notif').classList.contains('on')
  };
  Object.assign(state.settings, s);
  chrome.storage.sync.set({ settings: s, smtpSettings: { gmailUser: $('s-gmail').value.trim() } }, () => {
    showToast('✅ Settings saved');
  });
  // Sync to backend
  const u = $('s-gmail').value.trim(), p = $('s-pass').value.trim();
  if (u && p) {
    fetch(`${state.settings.apiUrl}/settings`, { method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ gmailUser: u, gmailAppPassword: p })
    }).catch(() => {});
  }
}

async function handleVerify() {
  const u = $('s-gmail').value.trim(), p = $('s-pass').value.trim();
  if (!u || !p) { showToast('Enter Gmail and App Password first', true); return; }
  const btn = $('btn-verify'), res = $('verify-result');
  btn.disabled = true; btn.textContent = '⏳ Verifying...';
  res.style.display = 'none';
  try {
    const r = await fetch(`${state.settings.apiUrl}/settings/verify`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ gmailUser: u, gmailAppPassword: p })
    });
    const d = await r.json();
    res.style.display = 'block';
    if (d.success) {
      res.style.cssText = 'display:block;padding:8px 10px;border-radius:6px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.3);color:#34d399;font-size:11px';
      res.textContent = '✅ SMTP connection successful!';
      showToast('SMTP verified!');
    } else {
      res.style.cssText = 'display:block;padding:8px 10px;border-radius:6px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#f87171;font-size:11px';
      res.textContent = `❌ Failed: ${d.message}`;
    }
  } catch {
    res.style.cssText = 'display:block;padding:8px 10px;border-radius:6px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#f87171;font-size:11px';
    res.textContent = '❌ Cannot reach backend server — is it running?';
  }
  btn.disabled = false; btn.textContent = '🔌 Test Connection';
}

// ─── Restore queue on popup reopen ────────────────────────────────────────────
function restoreActiveQueue() {
  chrome.storage.local.get(['activeQueue'], result => {
    if (result.activeQueue?.id) {
      state.activeQueueId = result.activeQueue.id;
      showQueueView(result.activeQueue.id);
      startPolling();
    }
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function apiPost(path) {
  const res = await fetch(state.settings.apiUrl + path, { method: 'POST' });
  return res.json();
}

function insertAtCursor(el, text) {
  const s = el.selectionStart, e = el.selectionEnd;
  el.value = el.value.slice(0, s) + text + el.value.slice(e);
  el.selectionStart = el.selectionEnd = s + text.length;
  el.dispatchEvent(new Event('input'));
  el.focus();
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const toastEl = $('toast');
let toastTimer;
function showToast(msg, isErr = false) {
  toastEl.textContent = msg;
  toastEl.className = `show${isErr ? ' err' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.className = '', 3000);
}
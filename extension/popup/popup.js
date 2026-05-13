/**
 * Gmail Automation Extension - Popup Script
 * Handles all popup UI logic: compose, progress tracking, settings
 */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  recipients: [],
  activeQueueId: null,
  pollInterval: null,
  settings: {
    apiUrl: 'http://localhost:5000/api',
    delayMin: 2,
    delayMax: 5,
    retryFailed: true,
    notifications: true,
    gmailUser: '',
    gmailAppPassword: ''
  }
};

// ─── DOM References ───────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const tabs        = document.querySelectorAll('.tab');
const panels      = document.querySelectorAll('.panel');
const recipInput  = $('recipient-input');
const recipTags   = $('recipient-tags');
const csvArea     = $('csv-upload-area');
const csvFile     = $('csv-file');
const btnSend     = $('btn-send');
const btnPause    = $('btn-pause');
const btnStop     = $('btn-stop');
const btnResume   = $('btn-resume');
const toastEl     = $('toast');

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  restoreActiveQueue();
  bindEvents();
});

// ─── Tab switching ────────────────────────────────────────────────────────────
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $(`panel-${tab.dataset.tab}`).classList.add('active');
  });
});

// ─── Event Binding ────────────────────────────────────────────────────────────
function bindEvents() {

  // Dashboard button
  $('btn-dashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: state.settings.apiUrl.replace('/api', '') || 'http://localhost:3000' });
  });

  // Refresh button
  $('btn-refresh').addEventListener('click', () => {
    if (state.activeQueueId) pollQueueStatus();
    showToast('Refreshed');
  });

  // Recipient input - add on Enter or comma
  recipInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addRecipientsFromText(recipInput.value);
      recipInput.value = '';
    }
  });

  recipInput.addEventListener('blur', () => {
    if (recipInput.value.trim()) {
      addRecipientsFromText(recipInput.value);
      recipInput.value = '';
    }
  });

  // CSV upload area click
  csvArea.addEventListener('click', () => csvFile.click());

  csvFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) parseCSVFile(file);
  });

  // CSV drag & drop
  csvArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    csvArea.style.borderColor = 'rgba(14,165,233,0.6)';
  });
  csvArea.addEventListener('dragleave', () => {
    csvArea.style.borderColor = '';
  });
  csvArea.addEventListener('drop', (e) => {
    e.preventDefault();
    csvArea.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) parseCSVFile(file);
  });

  // Placeholder pills
  document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const msgArea = $('message');
      const pos = msgArea.selectionStart;
      const val = msgArea.value;
      msgArea.value = val.slice(0, pos) + pill.dataset.ph + val.slice(pos);
      msgArea.focus();
      msgArea.selectionStart = msgArea.selectionEnd = pos + pill.dataset.ph.length;
    });
  });

  // Send button
  btnSend.addEventListener('click', handleSendCampaign);

  // Queue controls
  btnPause.addEventListener('click', handlePause);
  btnStop.addEventListener('click', handleStop);
  btnResume.addEventListener('click', handleResume);

  // Settings
  $('btn-verify').addEventListener('click', handleVerifySMTP);
  $('btn-save-settings').addEventListener('click', saveSettings);

  // Toggles
  $('toggle-retry').addEventListener('click', function () {
    this.classList.toggle('on');
    state.settings.retryFailed = this.classList.contains('on');
  });

  $('toggle-notifications').addEventListener('click', function () {
    this.classList.toggle('on');
    state.settings.notifications = this.classList.contains('on');
  });

  // Listen for background messages (queue updates)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'QUEUE_UPDATE' && message.queue) {
      updateProgressUI(message.queue);
    }
  });
}

// ─── Recipients ───────────────────────────────────────────────────────────────
function addRecipientsFromText(text) {
  const emails = text.split(/[\n,;]+/)
    .map(e => e.trim())
    .filter(e => e.includes('@') && e.includes('.'));

  const existingEmails = new Set(state.recipients.map(r => r.email));
  let added = 0;

  emails.forEach(email => {
    if (!existingEmails.has(email)) {
      state.recipients.push({ email, name: '', status: 'pending' });
      existingEmails.add(email);
      added++;
    }
  });

  if (added > 0) {
    renderRecipients();
    showToast(`Added ${added} recipient${added > 1 ? 's' : ''}`);
  }
}

function renderRecipients() {
  recipTags.innerHTML = '';
  state.recipients.forEach((r, i) => {
    const tag = document.createElement('div');
    tag.className = `tag ${r.status !== 'pending' ? r.status : ''}`;
    tag.innerHTML = `
      ${r.status === 'sent' ? '✓ ' : r.status === 'failed' ? '✗ ' : ''}
      ${r.name ? `${r.name} &lt;${r.email}&gt;` : r.email}
      ${r.status === 'pending' ? `<span class="remove" data-index="${i}">×</span>` : ''}
    `;
    recipTags.appendChild(tag);
  });

  // Bind remove buttons
  recipTags.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      state.recipients.splice(idx, 1);
      renderRecipients();
    });
  });

  // Update send button label
  const count = state.recipients.length;
  btnSend.textContent = count > 0
    ? `🚀 Send to ${count} Recipient${count > 1 ? 's' : ''}`
    : '🚀 Start Campaign';
}

// ─── CSV Parsing ──────────────────────────────────────────────────────────────
function parseCSVFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    if (lines.length < 2) return showToast('CSV file is empty or invalid', 'error');

    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    const emailIdx = headers.findIndex(h => ['email', 'mail', 'email address', 'e-mail'].includes(h));

    if (emailIdx === -1) return showToast('No "email" column found in CSV', 'error');

    const nameIdx   = headers.findIndex(h => ['name', 'full name', 'fullname'].includes(h));
    const companyIdx = headers.findIndex(h => ['company', 'organization', 'org'].includes(h));

    let added = 0;
    const existing = new Set(state.recipients.map(r => r.email));

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const email = cols[emailIdx]?.replace(/['"]/g, '').trim();
      if (!email || !email.includes('@')) continue;
      if (existing.has(email)) continue;

      state.recipients.push({
        email,
        name: nameIdx >= 0 ? cols[nameIdx]?.replace(/['"]/g, '').trim() || '' : '',
        company: companyIdx >= 0 ? cols[companyIdx]?.replace(/['"]/g, '').trim() || '' : '',
        status: 'pending',
        // Include all columns as potential placeholder data
        ...headers.reduce((acc, h, idx) => {
          acc[h] = cols[idx]?.replace(/['"]/g, '').trim() || '';
          return acc;
        }, {})
      });

      existing.add(email);
      added++;
    }

    renderRecipients();
    showToast(`✅ Added ${added} recipients from CSV`);
  };

  reader.onerror = () => showToast('Failed to read CSV file', 'error');
  reader.readAsText(file);
}

// Parse a single CSV line respecting quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ─── Send Campaign ────────────────────────────────────────────────────────────
async function handleSendCampaign() {
  const subject = $('subject').value.trim();
  const htmlContent = $('message').value.trim();
  const fromName = $('from-name').value.trim();

  if (state.recipients.length === 0) return showToast('Add at least one recipient', 'error');
  if (!subject) return showToast('Subject is required', 'error');
  if (!htmlContent) return showToast('Message content is required', 'error');

  btnSend.disabled = true;
  btnSend.textContent = '⏳ Starting...';

  try {
    const payload = {
      recipients: state.recipients,
      subject,
      htmlContent,
      fromName: fromName || 'Gmail Automation',
      delayMin: state.settings.delayMin,
      delayMax: state.settings.delayMax,
      retryFailed: state.settings.retryFailed
    };

    // Use background service worker to send
    const result = await sendMessage({ type: 'SEND_BULK', payload });

    if (result && result.success) {
      state.activeQueueId = result.queueId;

      // Persist active queue ID
      chrome.storage.local.set({
        activeQueue: {
          id: result.queueId,
          totalCount: state.recipients.length,
          startedAt: new Date().toISOString()
        }
      });

      // Switch to progress tab
      switchTab('progress');
      showQueueView(result.queueId);
      startPolling();

      showToast(`🚀 Campaign started! ${state.recipients.length} emails queued`);
      btnSend.textContent = '✓ Campaign Running';
    } else {
      throw new Error(result?.error || 'Failed to start campaign');
    }
  } catch (err) {
    showToast(err.message || 'Failed to send', 'error');
    btnSend.disabled = false;
    btnSend.textContent = `🚀 Send to ${state.recipients.length} Recipient${state.recipients.length > 1 ? 's' : ''}`;
  }
}

// ─── Queue Controls ───────────────────────────────────────────────────────────
async function handlePause() {
  if (!state.activeQueueId) return;
  btnPause.disabled = true;
  const result = await sendMessage({ type: 'PAUSE_QUEUE', queueId: state.activeQueueId });
  if (result?.success) {
    showToast('⏸ Campaign paused');
    $('queue-controls').style.display = 'none';
    $('btn-resume-row').style.display = 'block';
  }
  btnPause.disabled = false;
}

async function handleStop() {
  if (!state.activeQueueId) return;
  if (!confirm('Stop this campaign? This cannot be undone.')) return;
  btnStop.disabled = true;
  const result = await sendMessage({ type: 'STOP_QUEUE', queueId: state.activeQueueId });
  if (result?.success) {
    showToast('⏹ Campaign stopped');
    stopPolling();
  }
  btnStop.disabled = false;
}

async function handleResume() {
  if (!state.activeQueueId) return;
  btnResume.disabled = true;
  const result = await sendMessage({ type: 'RESUME_QUEUE', queueId: state.activeQueueId });
  if (result?.success) {
    showToast('▶ Campaign resumed');
    $('queue-controls').style.display = 'flex';
    $('btn-resume-row').style.display = 'none';
    startPolling();
  }
  btnResume.disabled = false;
}

// ─── Progress Polling ─────────────────────────────────────────────────────────
function startPolling() {
  stopPolling();
  pollQueueStatus();
  state.pollInterval = setInterval(pollQueueStatus, 2000);
}

function stopPolling() {
  if (state.pollInterval) {
    clearInterval(state.pollInterval);
    state.pollInterval = null;
  }
}

async function pollQueueStatus() {
  if (!state.activeQueueId) return;

  const result = await sendMessage({ type: 'GET_STATUS', queueId: state.activeQueueId });
  if (result?.success && result.queue) {
    updateProgressUI(result.queue);
  }
}

function showQueueView(queueId) {
  $('no-queue').style.display = 'none';
  $('queue-view').style.display = 'block';
  $('queue-id-label').textContent = queueId.slice(0, 8) + '...';
}

function updateProgressUI(queue) {
  showQueueView(queue.id);

  const done = queue.sentCount + queue.failedCount;
  const total = queue.totalCount;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Progress bar
  $('progress-fill').style.width = pct + '%';
  $('progress-label').textContent = `${done} / ${total}`;
  $('progress-pct').textContent = pct + '%';

  // Stats
  $('stat-sent').textContent = queue.sentCount;
  $('stat-failed').textContent = queue.failedCount;
  $('stat-pending').textContent = Math.max(0, total - done);

  // Status badge
  const badge = $('status-badge');
  badge.className = `status-badge ${queue.status}`;
  $('status-text').textContent = queue.status;

  const dot = badge.querySelector('.dot');
  dot.className = `dot ${queue.status === 'running' ? 'pulse' : ''}`;

  // Controls visibility
  if (queue.status === 'running') {
    $('queue-controls').style.display = 'flex';
    $('btn-resume-row').style.display = 'none';
    btnPause.style.display = '';
  } else if (queue.status === 'paused') {
    $('queue-controls').style.display = 'none';
    $('btn-resume-row').style.display = 'block';
  } else if (['completed', 'stopped'].includes(queue.status)) {
    $('queue-controls').style.display = 'none';
    $('btn-resume-row').style.display = 'none';
    stopPolling();

    // Re-enable send button
    btnSend.disabled = false;
    btnSend.textContent = '🚀 Start New Campaign';
  }

  // Logs
  if (queue.logs && queue.logs.length > 0) {
    const container = $('log-container');
    container.innerHTML = '';
    const recent = queue.logs.slice(-20).reverse();
    recent.forEach(log => {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      const time = new Date(log.timestamp).toLocaleTimeString('en', { hour12: false });
      entry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-msg ${log.type}">${escapeHtml(log.message)}</span>
      `;
      container.appendChild(entry);
    });
  }

  // Update recipient tags with live status
  if (queue.recipients) {
    queue.recipients.forEach(qr => {
      const localR = state.recipients.find(r => r.email === qr.email);
      if (localR && localR.status !== qr.status) {
        localR.status = qr.status;
      }
    });
    renderRecipients();
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function loadSettings() {
  chrome.storage.sync.get(['settings', 'smtpSettings'], (result) => {
    if (result.settings) {
      Object.assign(state.settings, result.settings);
      $('settings-delay-min').value = state.settings.delayMin || 2;
      $('settings-delay-max').value = state.settings.delayMax || 5;
      $('settings-api-url').value = state.settings.apiUrl || 'http://localhost:5000/api';

      if (!state.settings.retryFailed) $('toggle-retry').classList.remove('on');
      if (!state.settings.notifications) $('toggle-notifications').classList.remove('on');
    }

    if (result.smtpSettings) {
      $('settings-gmail').value = result.smtpSettings.gmailUser || '';
      // Never populate password field from storage - security
    }
  });
}

function saveSettings() {
  const newSettings = {
    apiUrl: $('settings-api-url').value.trim() || 'http://localhost:5000/api',
    delayMin: parseInt($('settings-delay-min').value) || 2,
    delayMax: parseInt($('settings-delay-max').value) || 5,
    retryFailed: $('toggle-retry').classList.contains('on'),
    notifications: $('toggle-notifications').classList.contains('on')
  };

  const smtpSettings = {
    gmailUser: $('settings-gmail').value.trim()
  };

  Object.assign(state.settings, newSettings);

  chrome.storage.sync.set({ settings: newSettings, smtpSettings }, () => {
    showToast('✅ Settings saved!');
  });

  // Send SMTP settings to backend if provided
  const gmailUser = $('settings-gmail').value.trim();
  const gmailPass = $('settings-password').value.trim();

  if (gmailUser && gmailPass) {
    fetch(`${state.settings.apiUrl}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gmailUser, gmailAppPassword: gmailPass })
    }).catch(() => {});
  }
}

async function handleVerifySMTP() {
  const gmailUser = $('settings-gmail').value.trim();
  const gmailAppPassword = $('settings-password').value.trim();
  const resultEl = $('verify-result');

  if (!gmailUser || !gmailAppPassword) {
    return showToast('Enter Gmail address and App Password first', 'error');
  }

  $('btn-verify').textContent = '⏳ Verifying...';
  $('btn-verify').disabled = true;
  resultEl.style.display = 'none';

  try {
    const res = await fetch(`${state.settings.apiUrl}/settings/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gmailUser, gmailAppPassword })
    });
    const data = await res.json();

    resultEl.style.display = 'block';
    if (data.success) {
      resultEl.style.background = 'rgba(16,185,129,0.1)';
      resultEl.style.border = '1px solid rgba(16,185,129,0.3)';
      resultEl.style.color = '#34d399';
      resultEl.textContent = '✅ Connection verified! SMTP is working.';
      showToast('SMTP verified!');
    } else {
      resultEl.style.background = 'rgba(239,68,68,0.1)';
      resultEl.style.border = '1px solid rgba(239,68,68,0.3)';
      resultEl.style.color = '#f87171';
      resultEl.textContent = `❌ Failed: ${data.message || 'Check your credentials'}`;
    }
  } catch {
    resultEl.style.display = 'block';
    resultEl.style.background = 'rgba(239,68,68,0.1)';
    resultEl.style.border = '1px solid rgba(239,68,68,0.3)';
    resultEl.style.color = '#f87171';
    resultEl.textContent = '❌ Cannot reach backend. Is the server running?';
  }

  $('btn-verify').textContent = '🔌 Verify Connection';
  $('btn-verify').disabled = false;
}

// ─── Restore Active Queue ─────────────────────────────────────────────────────
function restoreActiveQueue() {
  chrome.storage.local.get(['activeQueue'], (result) => {
    if (result.activeQueue && result.activeQueue.id) {
      state.activeQueueId = result.activeQueue.id;
      showQueueView(result.activeQueue.id);
      startPolling();
    }
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function switchTab(tabName) {
  tabs.forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  panels.forEach(p => {
    p.classList.toggle('active', p.id === `panel-${tabName}`);
  });
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        // Background unavailable - call API directly
        callAPIDirectly(message).then(resolve);
      } else {
        resolve(response);
      }
    });
  });
}

// Fallback: direct API call when background is unavailable
async function callAPIDirectly(message) {
  const apiUrl = state.settings.apiUrl;
  try {
    if (message.type === 'GET_STATUS') {
      const res = await fetch(`${apiUrl}/email/status/${message.queueId}`);
      return await res.json();
    }
    if (message.type === 'STOP_QUEUE') {
      const res = await fetch(`${apiUrl}/email/stop/${message.queueId}`, { method: 'POST' });
      return await res.json();
    }
    if (message.type === 'PAUSE_QUEUE') {
      const res = await fetch(`${apiUrl}/email/pause/${message.queueId}`, { method: 'POST' });
      return await res.json();
    }
    if (message.type === 'RESUME_QUEUE') {
      const res = await fetch(`${apiUrl}/email/resume/${message.queueId}`, { method: 'POST' });
      return await res.json();
    }
    if (message.type === 'SEND_BULK') {
      const res = await fetch(`${apiUrl}/email/send-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message.payload)
      });
      return await res.json();
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function showToast(message, type = 'success') {
  toastEl.textContent = message;
  toastEl.style.borderColor = type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.07)';
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

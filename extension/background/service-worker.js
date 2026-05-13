/**
 * Gmail Automation Extension - Background Service Worker
 * Manifest V3 background script
 * Handles: alarms, notifications, storage, message passing
 */

const API_BASE = 'http://localhost:5000/api'; // Change to production URL after deploy

// ─── Install / Update ─────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[GmailAuto] Extension installed:', details.reason);

  // Set default settings in chrome.storage
  chrome.storage.sync.get(['settings'], (result) => {
    if (!result.settings) {
      chrome.storage.sync.set({
        settings: {
          apiUrl: API_BASE,
          delayMin: 2,
          delayMax: 5,
          retryFailed: true,
          notifications: true,
          theme: 'dark'
        }
      });
    }
  });

  // Show welcome notification on first install
  if (details.reason === 'install') {
    showNotification(
      'Gmail Automation Ready! 🚀',
      'Click the extension icon to start sending bulk emails.'
    );
  }
});

// ─── Notification Helper ──────────────────────────────────────────────────────
function showNotification(title, message, type = 'basic') {
  chrome.notifications.create({
    type,
    iconUrl: '../icons/icon48.png',
    title,
    message,
    priority: 1
  });
}

// ─── Message Handler (from popup) ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[GmailAuto] Message received:', message.type);

  switch (message.type) {

    // ── Send bulk emails ──────────────────────────────────────────────────
    case 'SEND_BULK': {
      handleSendBulk(message.payload).then(sendResponse);
      return true; // async response
    }

    // ── Get queue status ──────────────────────────────────────────────────
    case 'GET_STATUS': {
      fetchQueueStatus(message.queueId).then(sendResponse);
      return true;
    }

    // ── Stop queue ────────────────────────────────────────────────────────
    case 'STOP_QUEUE': {
      stopQueue(message.queueId).then(sendResponse);
      return true;
    }

    // ── Pause queue ───────────────────────────────────────────────────────
    case 'PAUSE_QUEUE': {
      pauseQueue(message.queueId).then(sendResponse);
      return true;
    }

    // ── Resume queue ──────────────────────────────────────────────────────
    case 'RESUME_QUEUE': {
      resumeQueue(message.queueId).then(sendResponse);
      return true;
    }

    // ── Save to storage ───────────────────────────────────────────────────
    case 'SAVE_DRAFT': {
      chrome.storage.local.set({ [`draft_${Date.now()}`]: message.data }, () => {
        sendResponse({ success: true });
      });
      return true;
    }

    // ── Get API URL ───────────────────────────────────────────────────────
    case 'GET_API_URL': {
      chrome.storage.sync.get(['settings'], (result) => {
        sendResponse({ apiUrl: result.settings?.apiUrl || API_BASE });
      });
      return true;
    }

    // ── Open dashboard ────────────────────────────────────────────────────
    case 'OPEN_DASHBOARD': {
      chrome.tabs.create({ url: 'http://localhost:3000' });
      sendResponse({ success: true });
      return false;
    }

    default:
      sendResponse({ error: 'Unknown message type' });
      return false;
  }
});

// ─── API Helpers ──────────────────────────────────────────────────────────────

async function getApiUrl() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['settings'], (result) => {
      resolve(result.settings?.apiUrl || API_BASE);
    });
  });
}

async function handleSendBulk(payload) {
  try {
    const apiUrl = await getApiUrl();
    const response = await fetch(`${apiUrl}/email/send-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (data.success) {
      // Store active queue in local storage
      await chrome.storage.local.set({
        activeQueue: {
          id: data.queueId,
          startedAt: new Date().toISOString(),
          totalCount: payload.recipients?.length || 0
        }
      });

      // Set up alarm to poll progress
      chrome.alarms.create('pollQueue', { periodInMinutes: 0.1 }); // every 6 seconds

      showNotification(
        'Email Campaign Started! 📧',
        `Sending to ${payload.recipients?.length || 0} recipients...`
      );
    }

    return data;
  } catch (error) {
    console.error('[GmailAuto] Send bulk error:', error);
    return { success: false, error: error.message };
  }
}

async function fetchQueueStatus(queueId) {
  try {
    const apiUrl = await getApiUrl();
    const response = await fetch(`${apiUrl}/email/status/${queueId}`);
    return await response.json();
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function stopQueue(queueId) {
  try {
    const apiUrl = await getApiUrl();
    const response = await fetch(`${apiUrl}/email/stop/${queueId}`, { method: 'POST' });
    chrome.alarms.clear('pollQueue');
    return await response.json();
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function pauseQueue(queueId) {
  try {
    const apiUrl = await getApiUrl();
    const response = await fetch(`${apiUrl}/email/pause/${queueId}`, { method: 'POST' });
    return await response.json();
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function resumeQueue(queueId) {
  try {
    const apiUrl = await getApiUrl();
    const response = await fetch(`${apiUrl}/email/resume/${queueId}`, { method: 'POST' });
    chrome.alarms.create('pollQueue', { periodInMinutes: 0.1 });
    return await response.json();
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ─── Alarm Handler (queue polling) ───────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'pollQueue') return;

  const storage = await chrome.storage.local.get(['activeQueue']);
  const activeQueue = storage.activeQueue;
  if (!activeQueue) {
    chrome.alarms.clear('pollQueue');
    return;
  }

  try {
    const status = await fetchQueueStatus(activeQueue.id);
    if (!status.success || !status.queue) return;

    const queue = status.queue;

    // Update badge with progress
    const progress = queue.totalCount > 0
      ? Math.round(((queue.sentCount + queue.failedCount) / queue.totalCount) * 100)
      : 0;

    chrome.action.setBadgeText({ text: `${progress}%` });
    chrome.action.setBadgeBackgroundColor({
      color: queue.status === 'running' ? '#0284c7' :
             queue.status === 'completed' ? '#10b981' :
             queue.status === 'paused' ? '#f59e0b' : '#ef4444'
    });

    // Notify on completion
    if (['completed', 'stopped'].includes(queue.status)) {
      chrome.alarms.clear('pollQueue');
      chrome.storage.local.remove('activeQueue');

      setTimeout(() => {
        chrome.action.setBadgeText({ text: '' });
      }, 10000);

      showNotification(
        queue.status === 'completed' ? '✅ Campaign Complete!' : '⏹️ Campaign Stopped',
        `Sent: ${queue.sentCount} | Failed: ${queue.failedCount} | Total: ${queue.totalCount}`
      );
    }

    // Broadcast status to any open popups
    chrome.runtime.sendMessage({
      type: 'QUEUE_UPDATE',
      queue
    }).catch(() => {}); // popup may be closed, ignore error

  } catch (error) {
    console.error('[GmailAuto] Poll error:', error.message);
  }
});

// ─── Notification click handler ───────────────────────────────────────────────
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.tabs.create({ url: 'http://localhost:3000/history' });
});

console.log('[GmailAuto] Background service worker initialized ✅');

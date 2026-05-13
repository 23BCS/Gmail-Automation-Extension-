/**
 * Settings Page
 * SMTP config, default settings, admin options
 */
import React, { useState, useEffect } from 'react';
import { settingsAPI } from '../utils/api';
import toast from 'react-hot-toast';

export default function Settings() {
  const [settings, setSettings] = useState({
    gmailUser: '',
    gmailAppPassword: '',
    fromName: 'Gmail Automation',
    delayMin: 2,
    delayMax: 5,
    retryFailed: true,
    maxRetries: 2
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await settingsAPI.get();
        setSettings(s => ({ ...s, ...res.data.settings }));
      } catch {}
      setLoading(false);
    };
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsAPI.update(settings);
      toast.success('Settings saved!');
    } catch {}
    setSaving(false);
  };

  const handleVerify = async () => {
    setVerifying(true);
    setVerified(null);
    try {
      const res = await settingsAPI.verify({
        gmailUser: settings.gmailUser,
        gmailAppPassword: settings.gmailAppPassword
      });
      setVerified(res.data.success);
      if (res.data.success) toast.success('SMTP connection verified!');
      else toast.error('SMTP verification failed');
    } catch {
      setVerified(false);
    }
    setVerifying(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-white/40 text-sm mt-1">Configure SMTP and sending preferences</p>
      </div>

      {/* SMTP Config */}
      <div className="bg-surface-800 border border-white/5 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-xl">📧</div>
          <div>
            <div className="font-semibold text-white">Gmail SMTP</div>
            <div className="text-xs text-white/40">Configure your Gmail account for sending</div>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <div className="text-xs text-amber-400/80 font-medium mb-1">⚠️ Important: Gmail App Password Required</div>
          <div className="text-xs text-amber-400/60 leading-relaxed">
            You must use a Gmail App Password, not your regular password. Go to Google Account → Security → 2-Step Verification → App Passwords to generate one.
          </div>
        </div>

        <div>
          <label className="block text-xs text-white/50 mb-1.5">Gmail Address</label>
          <input
            type="email"
            className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50"
            placeholder="yourname@gmail.com"
            value={settings.gmailUser}
            onChange={e => setSettings(s => ({ ...s, gmailUser: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-xs text-white/50 mb-1.5">App Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50 font-mono"
              placeholder="xxxx xxxx xxxx xxxx"
              value={settings.gmailAppPassword}
              onChange={e => setSettings(s => ({ ...s, gmailAppPassword: e.target.value }))}
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 text-xs"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs text-white/50 mb-1.5">From Name</label>
          <input
            className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500/50"
            placeholder="Your Name or Company"
            value={settings.fromName}
            onChange={e => setSettings(s => ({ ...s, fromName: e.target.value }))}
          />
        </div>

        <button
          onClick={handleVerify}
          disabled={verifying || !settings.gmailUser || !settings.gmailAppPassword}
          className="w-full py-2.5 bg-surface-700 hover:bg-surface-600 border border-white/10 disabled:opacity-50 rounded-xl text-sm text-white/70 hover:text-white transition-all"
        >
          {verifying ? 'Verifying...' : '🔌 Test SMTP Connection'}
        </button>

        {verified !== null && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
            verified
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}>
            {verified ? '✅ Connection successful!' : '❌ Connection failed. Check credentials.'}
          </div>
        )}
      </div>

      {/* Sending Preferences */}
      <div className="bg-surface-800 border border-white/5 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-xl">⚙️</div>
          <div>
            <div className="font-semibold text-white">Sending Preferences</div>
            <div className="text-xs text-white/40">Default settings for bulk email campaigns</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Min Delay (seconds)</label>
            <input
              type="number" min={1} max={30}
              className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-500/50"
              value={settings.delayMin}
              onChange={e => setSettings(s => ({ ...s, delayMin: +e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Max Delay (seconds)</label>
            <input
              type="number" min={1} max={60}
              className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-500/50"
              value={settings.delayMax}
              onChange={e => setSettings(s => ({ ...s, delayMax: +e.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Max Retries</label>
            <input
              type="number" min={0} max={5}
              className="w-full bg-surface-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-500/50"
              value={settings.maxRetries}
              onChange={e => setSettings(s => ({ ...s, maxRetries: +e.target.value }))}
            />
          </div>
          <div className="flex items-end pb-0.5">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${settings.retryFailed ? 'bg-brand-500' : 'bg-surface-600'}`}
                onClick={() => setSettings(s => ({ ...s, retryFailed: !s.retryFailed }))}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${settings.retryFailed ? 'left-7' : 'left-1'}`} />
              </div>
              <span className="text-sm text-white/70">Auto-retry failed</span>
            </label>
          </div>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 rounded-xl text-white font-semibold transition-all shadow-lg shadow-brand-500/20"
      >
        {saving ? 'Saving...' : '💾 Save Settings'}
      </button>

      {/* Security note */}
      <div className="bg-surface-800 border border-white/5 rounded-2xl p-5">
        <div className="text-xs font-semibold text-white/60 mb-3">🛡️ Security Notes</div>
        <ul className="text-xs text-white/30 space-y-1.5">
          <li>• Your App Password is stored in server environment variables, never in the database</li>
          <li>• Always use Gmail App Passwords, never your account password</li>
          <li>• Rate limiting protects you from accidental spam (max 500 emails/hour)</li>
          <li>• All API routes are protected with Helmet.js security headers</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Dashboard Page
 * Overview stats, recent queues, quick actions
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { reportAPI, emailAPI } from '../utils/api';

function StatCard({ label, value, color, icon, sub }) {
  return (
    <div className="bg-surface-800 border border-white/5 rounded-2xl p-5 flex items-start gap-4 animate-slide-up">
      <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center text-2xl flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <div className="text-3xl font-bold text-white tabular-nums">{value}</div>
        <div className="text-sm text-white/50 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-white/30 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

function QueueRow({ queue }) {
  const statusColor = {
    running: 'bg-brand-500/20 text-brand-400',
    completed: 'bg-emerald-500/20 text-emerald-400',
    paused: 'bg-yellow-500/20 text-yellow-400',
    stopped: 'bg-red-500/20 text-red-400',
    pending: 'bg-white/10 text-white/50'
  };

  const progress = queue.totalCount > 0
    ? Math.round(((queue.sentCount + queue.failedCount) / queue.totalCount) * 100)
    : 0;

  return (
    <div className="flex items-center gap-4 py-3 border-b border-white/5 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white/80 font-mono truncate">{queue.id.slice(0, 8)}...</div>
        <div className="text-xs text-white/30 mt-0.5">
          {queue.sentCount} sent · {queue.failedCount} failed · {queue.totalCount} total
        </div>
      </div>

      <div className="w-24">
        <div className="text-xs text-white/40 mb-1">{progress}%</div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[queue.status] || statusColor.pending}`}>
        {queue.status}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = async () => {
    try {
      const res = await reportAPI.summary();
      setSummary(res.data.summary);
    } catch {
      // Offline/no DB - show zeros
      setSummary({ totalSent: 0, totalFailed: 0, totalRecipients: 0, activeQueues: 0, queues: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    // Auto-refresh every 5 seconds when queues are active
    const interval = setInterval(fetchSummary, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const successRate = summary.totalRecipients > 0
    ? Math.round((summary.totalSent / summary.totalRecipients) * 100)
    : 0;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-white/40 text-sm mt-1">Gmail Automation Overview</p>
        </div>
        <Link
          to="/compose"
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 rounded-xl text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30 hover:scale-105"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          New Campaign
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Sent"
          value={summary.totalSent.toLocaleString()}
          color="bg-emerald-500/10"
          icon="✉️"
          sub="All time"
        />
        <StatCard
          label="Failed"
          value={summary.totalFailed.toLocaleString()}
          color="bg-red-500/10"
          icon="❌"
          sub={`${100 - successRate}% fail rate`}
        />
        <StatCard
          label="Total Recipients"
          value={summary.totalRecipients.toLocaleString()}
          color="bg-brand-500/10"
          icon="👥"
          sub="All campaigns"
        />
        <StatCard
          label="Success Rate"
          value={`${successRate}%`}
          color="bg-purple-500/10"
          icon="📈"
          sub={`${summary.activeQueues} active`}
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { to: '/compose', label: 'Send Emails', icon: '📧', color: 'from-brand-600/20 to-brand-800/20 border-brand-500/20 hover:border-brand-500/40' },
          { to: '/templates', label: 'Templates', icon: '📝', color: 'from-purple-600/20 to-purple-800/20 border-purple-500/20 hover:border-purple-500/40' },
          { to: '/schedule', label: 'Schedule', icon: '📅', color: 'from-amber-600/20 to-amber-800/20 border-amber-500/20 hover:border-amber-500/40' },
          { to: '/history', label: 'View History', icon: '🕐', color: 'from-emerald-600/20 to-emerald-800/20 border-emerald-500/20 hover:border-emerald-500/40' }
        ].map(({ to, label, icon, color }) => (
          <Link
            key={to}
            to={to}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl bg-gradient-to-b border transition-all duration-200 hover:scale-105 ${color}`}
          >
            <span className="text-2xl">{icon}</span>
            <span className="text-xs text-white/70 font-medium">{label}</span>
          </Link>
        ))}
      </div>

      {/* Recent Queues */}
      <div className="bg-surface-800 border border-white/5 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Recent Campaigns</h2>
          <button
            onClick={fetchSummary}
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Refresh
          </button>
        </div>

        {summary.queues && summary.queues.length > 0 ? (
          <div>
            {summary.queues.slice(0, 8).map(q => (
              <QueueRow key={q.id} queue={q} />
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-white/30">
            <div className="text-4xl mb-3">📭</div>
            <div className="text-sm">No campaigns yet</div>
            <Link to="/compose" className="text-brand-400 text-sm hover:underline mt-2 inline-block">
              Start your first campaign →
            </Link>
          </div>
        )}
      </div>

      {/* Placeholder tip */}
      <div className="bg-gradient-to-r from-brand-900/40 to-purple-900/40 border border-brand-500/20 rounded-2xl p-5">
        <div className="text-sm font-semibold text-brand-400 mb-2">💡 Personalization Tips</div>
        <div className="text-xs text-white/50 leading-relaxed">
          Use placeholders in your email: <code className="text-brand-300 bg-brand-900/40 px-1.5 py-0.5 rounded">{'{{name}}'}</code>, <code className="text-brand-300 bg-brand-900/40 px-1.5 py-0.5 rounded">{'{{email}}'}</code>, <code className="text-brand-300 bg-brand-900/40 px-1.5 py-0.5 rounded">{'{{company}}'}</code> — values are pulled from your CSV columns automatically.
        </div>
      </div>
    </div>
  );
}

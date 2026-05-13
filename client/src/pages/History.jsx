/**
 * History Page
 */
import React, { useState, useEffect } from 'react';
import { emailAPI, reportAPI } from '../utils/api';
import toast from 'react-hot-toast';

export function History() {
  const [queues, setQueues] = useState([]);
  const [selectedQueue, setSelectedQueue] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await emailAPI.getQueues();
        setQueues(res.data.queues || []);
      } catch {}
      setLoading(false);
    };
    fetch();
    const interval = setInterval(fetch, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleExport = (queueId) => {
    reportAPI.exportCSV(queueId);
    toast.success('Downloading CSV report...');
  };

  const statusBadge = (status) => {
    const map = {
      running: 'bg-brand-500/20 text-brand-400 border-brand-500/30',
      completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      paused: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      stopped: 'bg-red-500/20 text-red-400 border-red-500/30',
      pending: 'bg-white/10 text-white/50 border-white/10'
    };
    return map[status] || map.pending;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Email History</h1>
          <p className="text-white/40 text-sm mt-1">{queues.length} campaigns total</p>
        </div>
        <button
          onClick={() => handleExport()}
          className="px-4 py-2 bg-surface-700 hover:bg-surface-600 border border-white/10 rounded-xl text-sm text-white/70 hover:text-white transition-all"
        >
          📥 Export All CSV
        </button>
      </div>

      {queues.length === 0 ? (
        <div className="text-center py-20 text-white/30">
          <div className="text-5xl mb-4">📭</div>
          <div>No campaigns yet</div>
        </div>
      ) : (
        <div className="space-y-3">
          {queues.map(queue => (
            <div
              key={queue.id}
              className="bg-surface-800 border border-white/5 rounded-2xl p-5 cursor-pointer hover:border-brand-500/20 transition-all"
              onClick={() => setSelectedQueue(selectedQueue?.id === queue.id ? null : queue)}
            >
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono text-white/60 truncate">{queue.id}</div>
                  <div className="text-xs text-white/30 mt-0.5">
                    {new Date(queue.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-center">
                    <div className="text-emerald-400 font-bold">{queue.sentCount}</div>
                    <div className="text-xs text-white/30">sent</div>
                  </div>
                  <div className="text-center">
                    <div className="text-red-400 font-bold">{queue.failedCount}</div>
                    <div className="text-xs text-white/30">failed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white/60 font-bold">{queue.totalCount}</div>
                    <div className="text-xs text-white/30">total</div>
                  </div>

                  <span className={`text-xs px-2.5 py-1 rounded-full border ${statusBadge(queue.status)}`}>
                    {queue.status}
                  </span>

                  <button
                    className="text-xs text-brand-400 hover:text-brand-300 px-2"
                    onClick={e => { e.stopPropagation(); handleExport(queue.id); }}
                  >
                    📥
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full"
                  style={{ width: `${queue.totalCount > 0 ? ((queue.sentCount + queue.failedCount) / queue.totalCount) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default History;

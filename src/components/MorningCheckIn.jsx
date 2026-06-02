import { METRICS } from '../utils/scoring';

export default function MorningCheckIn({ checkIn, setCheckIn, targets, setTargets, onDone }) {
  const activityMetrics = METRICS.filter(m => ['calls', 'emails', 'linkedin', 'followups', 'meetingsRequested'].includes(m.key));

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-blue-500/30">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">Morning Check-In</h3>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-xs text-slate-400 font-medium uppercase tracking-wider mb-3">1. Activity Targets for Today</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {activityMetrics.map(m => (
              <div key={m.key}>
                <label className="block text-xs text-slate-500 mb-1">{m.label}</label>
                <input
                  type="number"
                  min="0"
                  value={targets[m.key] ?? ''}
                  onChange={e => setTargets(prev => ({ ...prev, [m.key]: Number(e.target.value) }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            ))}
          </div>
        </div>

        {[
          { key: 'topAccounts', label: '2. Top Accounts Pursuing Today', placeholder: 'e.g. Acme Corp (CEO), TechStartup (Head of Sales)...' },
          { key: 'biggestRisk', label: '3. Biggest Risk to Hitting Target', placeholder: 'e.g. Gatekeepers, no data on target list...' },
          { key: 'nonNegotiable', label: '4. One Non-Negotiable for Today', placeholder: 'e.g. Book a meeting with Acme CEO...' },
        ].map(f => (
          <div key={f.key}>
            <label className="block text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">{f.label}</label>
            <textarea
              rows={2}
              value={checkIn[f.key] || ''}
              onChange={e => setCheckIn(prev => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
        ))}

        <button
          onClick={onDone}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
        >
          Start Day
        </button>
      </div>
    </div>
  );
}

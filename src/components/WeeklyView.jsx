import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { weekDates, formatDate, todayStr } from '../utils/dates';
import { METRICS, calcScores, calcRatios } from '../utils/scoring';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeeklyView({ dailyData }) {
  const dates = weekDates(todayStr());

  const weekActuals = Object.fromEntries(METRICS.map(m => [m.key, 0]));
  const weekTargets = Object.fromEntries(METRICS.map(m => [m.key, 0]));

  const chartData = dates.map((d, i) => {
    const day = dailyData[d] || {};
    const actuals = day.actuals || {};
    const targets = day.targets || {};
    METRICS.forEach(m => {
      weekActuals[m.key] += actuals[m.key] || 0;
      weekTargets[m.key] += targets[m.key] || 0;
    });
    const scores = calcScores(actuals, targets);
    const avg = Math.round((scores.activity + scores.execution + scores.pipeline) / 3);
    return { day: DAY_LABELS[i], score: avg, date: d };
  });

  const ratios = calcRatios(weekActuals);

  const channels = [
    { key: 'calls', label: 'Calls', target: weekTargets.calls },
    { key: 'emails', label: 'Emails', target: weekTargets.emails },
    { key: 'linkedin', label: 'LinkedIn', target: weekTargets.linkedin },
  ];
  const bestChannel = channels.filter(c => c.target > 0).sort((a, b) => {
    const pA = weekActuals[a.key] / a.target;
    const pB = weekActuals[b.key] / b.target;
    return pB - pA;
  })[0];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-200">
        Week of {formatDate(dates[0])}
      </h2>

      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Daily Performance Score</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} barSize={32}>
            <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#f1f5f9' }}
              itemStyle={{ color: '#94a3b8' }}
            />
            <Bar dataKey="score" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.score >= 75 ? '#22c55e' : entry.score >= 50 ? '#f59e0b' : entry.score > 0 ? '#ef4444' : '#334155'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700">
          <h3 className="text-sm font-semibold text-slate-300">Weekly Totals</h3>
        </div>
        <div className="divide-y divide-slate-700/50">
          {METRICS.map(m => (
            <div key={m.key} className="flex items-center justify-between px-5 py-2.5">
              <span className="text-sm text-slate-400">{m.label}</span>
              <span className="text-sm font-semibold text-slate-200">
                {m.prefix}{weekActuals[m.key].toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Weekly Conversion Ratios</h3>
        <div className="grid grid-cols-5 gap-3">
          {ratios.map(r => (
            <div key={r.label} className="text-center">
              <div className={`text-2xl font-bold mb-1 ${r.value === null ? 'text-slate-600' : r.value >= 20 ? 'text-green-400' : 'text-amber-400'}`}>
                {r.value === null ? '—' : `${r.value}%`}
              </div>
              <div className="text-xs text-slate-400 leading-tight">{r.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Best Outreach Channel</h3>
          {bestChannel ? (
            <div>
              <div className="text-2xl font-bold text-blue-400">{bestChannel.label}</div>
              <div className="text-sm text-slate-400 mt-1">
                {weekActuals[bestChannel.key]} / {bestChannel.target} target
                ({bestChannel.target > 0 ? Math.round((weekActuals[bestChannel.key] / bestChannel.target) * 100) : 0}%)
              </div>
            </div>
          ) : <div className="text-slate-500 text-sm">No data yet</div>}
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Pipeline This Week</h3>
          <div className="text-2xl font-bold text-green-400">
            £{weekActuals.pipeline.toLocaleString()}
          </div>
          <div className="text-sm text-slate-400 mt-1">
            {weekActuals.meetingsBooked} meetings booked · {weekActuals.opportunities} opportunities
          </div>
        </div>
      </div>
    </div>
  );
}

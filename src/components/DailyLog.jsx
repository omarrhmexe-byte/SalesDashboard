import { useState } from 'react';
import { METRICS, calcScores } from '../utils/scoring';
import { formatDate, todayStr } from '../utils/dates';
import ScoresPanel from './ScoresPanel';
import BottleneckAnalysis from './BottleneckAnalysis';
import MorningCheckIn from './MorningCheckIn';

const EMPTY_ACTUALS = Object.fromEntries(METRICS.map(m => [m.key, 0]));
const DEFAULT_TARGETS = {
  calls: 50, dms: 10, conversations: 5, emails: 30, linkedin: 20,
  followups: 15, meetingsRequested: 5, meetingsBooked: 2, opportunities: 1, pipeline: 5000,
};

export default function DailyLog({ dailyData, setDailyData }) {
  const [date, setDate] = useState(todayStr());
  const [showCheckIn, setShowCheckIn] = useState(true);
  const [saved, setSaved] = useState(false);

  const dayData = dailyData[date] || {};
  const actuals = dayData.actuals || { ...EMPTY_ACTUALS };
  const targets = dayData.targets || { ...DEFAULT_TARGETS };
  const checkIn = dayData.checkIn || {};

  function updateField(obj, key, value) {
    setDailyData(prev => ({
      ...prev,
      [date]: { ...prev[date], [key]: { ...(prev[date]?.[key] || obj), ...value } },
    }));
    setSaved(false);
  }

  function setActuals(fn) {
    const next = typeof fn === 'function' ? fn(actuals) : fn;
    setDailyData(prev => ({ ...prev, [date]: { ...prev[date], actuals: next } }));
    setSaved(false);
  }

  function setTargets(fn) {
    const next = typeof fn === 'function' ? fn(targets) : fn;
    setDailyData(prev => ({ ...prev, [date]: { ...prev[date], targets: next } }));
    setSaved(false);
  }

  function setCheckIn(fn) {
    const next = typeof fn === 'function' ? fn(checkIn) : fn;
    setDailyData(prev => ({ ...prev, [date]: { ...prev[date], checkIn: next } }));
  }

  function save() {
    setDailyData(prev => ({ ...prev, [date]: { ...prev[date], actuals, targets, checkIn, saved: true } }));
    setSaved(true);
  }

  const scores = calcScores(actuals, targets);
  const hasSaved = dayData.saved;

  if (showCheckIn && !dayData.checkInDone) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-4 text-slate-400 text-sm">{formatDate(date)}</div>
        <MorningCheckIn
          checkIn={checkIn}
          setCheckIn={setCheckIn}
          targets={targets}
          setTargets={setTargets}
          onDone={() => {
            setDailyData(prev => ({ ...prev, [date]: { ...prev[date], checkIn, targets, checkInDone: true } }));
            setShowCheckIn(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">{formatDate(date)}</h2>
          {checkIn.nonNegotiable && (
            <p className="text-sm text-slate-400 mt-0.5">
              Non-negotiable: <span className="text-amber-400">{checkIn.nonNegotiable}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setSaved(false); }}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => setShowCheckIn(true)}
            className="text-xs text-slate-400 hover:text-blue-400 border border-slate-600 hover:border-blue-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            Edit Check-In
          </button>
        </div>
      </div>

      {checkIn.topAccounts && (
        <div className="bg-slate-800 rounded-lg px-4 py-3 border border-slate-700 text-sm text-slate-300">
          <span className="text-slate-500 text-xs uppercase tracking-wider mr-2">Focus accounts:</span>
          {checkIn.topAccounts}
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300">End of Day Actuals</h3>
          <span className="text-xs text-slate-500">vs target</span>
        </div>
        <div className="divide-y divide-slate-700/50">
          {METRICS.map(m => {
            const actual = actuals[m.key] ?? 0;
            const target = targets[m.key] ?? 0;
            const pct = target > 0 ? Math.round((actual / target) * 100) : null;
            const met = pct !== null && pct >= 100;
            const close = pct !== null && pct >= 75 && pct < 100;
            return (
              <div key={m.key} className="flex items-center gap-4 px-5 py-3">
                <span className="text-sm text-slate-300 w-48 shrink-0">{m.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Target:</span>
                  <input
                    type="number"
                    min="0"
                    value={targets[m.key] ?? ''}
                    onChange={e => setTargets(prev => ({ ...prev, [m.key]: Number(e.target.value) }))}
                    className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Actual:</span>
                  <input
                    type="number"
                    min="0"
                    value={actuals[m.key] ?? ''}
                    onChange={e => setActuals(prev => ({ ...prev, [m.key]: Number(e.target.value) }))}
                    className="w-24 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 font-medium focus:outline-none focus:border-blue-500"
                  />
                </div>
                {pct !== null && (
                  <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
                    met ? 'bg-green-500/20 text-green-400' :
                    close ? 'bg-amber-500/20 text-amber-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {pct}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-slate-700">
          <button
            onClick={save}
            className={`px-6 py-2 rounded-lg text-sm font-semibold transition-colors ${
              saved ? 'bg-green-600/30 text-green-400 border border-green-500/30' : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {saved ? 'Saved' : 'Save Day'}
          </button>
        </div>
      </div>

      {hasSaved && (
        <>
          <ScoresPanel scores={scores} />
          <BottleneckAnalysis scores={scores} actuals={actuals} />
        </>
      )}
    </div>
  );
}

import { scoreColor } from '../utils/scoring';

const colorMap = {
  green: { bar: 'bg-green-500', text: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
  amber: { bar: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  red: { bar: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
};

function ScoreBar({ label, score }) {
  const color = scoreColor(score);
  const c = colorMap[color];
  return (
    <div className={`rounded-lg border p-4 ${c.bg}`}>
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        <span className={`text-2xl font-bold ${c.text}`}>{score}</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${c.bar}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

export default function ScoresPanel({ scores }) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Performance Scores</h3>
      <div className="grid grid-cols-3 gap-3">
        <ScoreBar label="Activity" score={scores.activity} />
        <ScoreBar label="Execution" score={scores.execution} />
        <ScoreBar label="Pipeline" score={scores.pipeline} />
      </div>
    </div>
  );
}

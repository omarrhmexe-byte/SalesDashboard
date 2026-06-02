import { bottleneck, calcRatios } from '../utils/scoring';

const levelColors = {
  red: 'bg-red-500/10 border-red-500/40 text-red-300',
  amber: 'bg-amber-500/10 border-amber-500/40 text-amber-300',
  green: 'bg-green-500/10 border-green-500/40 text-green-300',
};

export default function BottleneckAnalysis({ scores, actuals }) {
  const bn = bottleneck(scores);
  const ratios = calcRatios(actuals);

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-4 ${levelColors[bn.level]}`}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">Bottleneck</div>
        <p className="text-sm font-medium">{bn.message}</p>
      </div>

      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Conversion Funnel</h3>
        <div className="grid grid-cols-5 gap-2">
          {ratios.map(r => (
            <div key={r.label} className="text-center">
              <div className={`text-xl font-bold mb-1 ${r.value === null ? 'text-slate-600' : r.value >= 20 ? 'text-green-400' : 'text-amber-400'}`}>
                {r.value === null ? '—' : `${r.value}%`}
              </div>
              <div className="text-xs text-slate-400 leading-tight">{r.label}</div>
              <div className="text-xs text-slate-600 mt-0.5">{r.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

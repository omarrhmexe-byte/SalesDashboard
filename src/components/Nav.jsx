export default function Nav({ tab, setTab }) {
  const tabs = [
    { id: 'daily', label: 'Daily Log' },
    { id: 'weekly', label: 'Weekly Review' },
    { id: 'accounts', label: 'Accounts' },
  ];

  return (
    <nav className="bg-slate-900 border-b border-slate-700 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
        <div className="flex items-center gap-2 py-4">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-sm font-semibold text-slate-200 tracking-wide uppercase">Sales Coach</span>
        </div>
        <div className="flex">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-4 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

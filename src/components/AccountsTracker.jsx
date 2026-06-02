import { useState } from 'react';
import { todayStr, isOverdue } from '../utils/dates';

const STATUSES = ['Prospecting', 'Contacted', 'Conversation', 'Meeting Booked', 'Opportunity'];

const STATUS_COLORS = {
  'Prospecting': 'bg-slate-500/20 text-slate-400',
  'Contacted': 'bg-blue-500/20 text-blue-400',
  'Conversation': 'bg-yellow-500/20 text-yellow-400',
  'Meeting Booked': 'bg-purple-500/20 text-purple-400',
  'Opportunity': 'bg-green-500/20 text-green-400',
};

const EMPTY = { company: '', contact: '', status: 'Prospecting', lastAction: '', nextAction: '', nextActionDate: '' };

export default function AccountsTracker({ accounts, setAccounts }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState('All');

  function openNew() { setForm(EMPTY); setEditing('new'); }

  function openEdit(acc) { setForm({ ...acc }); setEditing(acc.id); }

  function save() {
    if (!form.company.trim()) return;
    if (editing === 'new') {
      setAccounts(prev => [...prev, { ...form, id: Date.now() }]);
    } else {
      setAccounts(prev => prev.map(a => a.id === editing ? { ...form, id: editing } : a));
    }
    setEditing(null);
  }

  function remove(id) {
    if (confirm('Delete this account?')) setAccounts(prev => prev.filter(a => a.id !== id));
  }

  const filtered = filter === 'All' ? accounts : accounts.filter(a => a.status === filter);
  const overdueCount = accounts.filter(a => isOverdue(a.nextActionDate)).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Accounts Tracker</h2>
          {overdueCount > 0 && (
            <p className="text-xs text-red-400 mt-0.5">{overdueCount} account{overdueCount > 1 ? 's' : ''} with overdue actions</p>
          )}
        </div>
        <button
          onClick={openNew}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + Add Account
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['All', ...STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
              filter === s ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {editing && (
        <div className="bg-slate-800 rounded-xl p-5 border border-blue-500/30">
          <h3 className="text-sm font-semibold text-blue-400 mb-4">{editing === 'new' ? 'Add Account' : 'Edit Account'}</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'company', label: 'Company', placeholder: 'Acme Corp' },
              { key: 'contact', label: 'Contact Name', placeholder: 'John Smith, CEO' },
              { key: 'lastAction', label: 'Last Action', placeholder: 'Called, left voicemail' },
              { key: 'nextAction', label: 'Next Action', placeholder: 'Follow up email' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
                <input
                  type="text"
                  value={form[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Next Action Date</label>
              <input
                type="date"
                value={form.nextActionDate}
                onChange={e => setForm(p => ({ ...p, nextActionDate: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg">Save</button>
            <button onClick={() => setEditing(null)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-semibold px-4 py-2 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500">No accounts yet. Add one to start tracking.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(acc => {
            const overdue = isOverdue(acc.nextActionDate);
            return (
              <div
                key={acc.id}
                className={`bg-slate-800 rounded-xl p-4 border transition-colors ${
                  overdue ? 'border-red-500/40' : 'border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-200">{acc.company}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[acc.status]}`}>{acc.status}</span>
                      {overdue && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">Overdue</span>}
                    </div>
                    {acc.contact && <div className="text-sm text-slate-400 mt-0.5">{acc.contact}</div>}
                    <div className="flex gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                      {acc.lastAction && <span>Last: {acc.lastAction}</span>}
                      {acc.nextAction && (
                        <span className={overdue ? 'text-red-400' : 'text-slate-400'}>
                          Next: {acc.nextAction}{acc.nextActionDate ? ` · ${acc.nextActionDate}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => openEdit(acc)} className="text-xs text-slate-400 hover:text-blue-400 transition-colors">Edit</button>
                    <button onClick={() => remove(acc.id)} className="text-xs text-slate-400 hover:text-red-400 transition-colors">Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

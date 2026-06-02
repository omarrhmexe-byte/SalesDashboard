import { useState } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import Nav from './components/Nav';
import DailyLog from './components/DailyLog';
import WeeklyView from './components/WeeklyView';
import AccountsTracker from './components/AccountsTracker';

export default function App() {
  const [tab, setTab] = useState('daily');
  const [dailyData, setDailyData] = useLocalStorage('sales_daily', {});
  const [accounts, setAccounts] = useLocalStorage('sales_accounts', []);

  return (
    <div className="min-h-screen bg-slate-900">
      <Nav tab={tab} setTab={setTab} />
      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === 'daily' && <DailyLog dailyData={dailyData} setDailyData={setDailyData} />}
        {tab === 'weekly' && <WeeklyView dailyData={dailyData} />}
        {tab === 'accounts' && <AccountsTracker accounts={accounts} setAccounts={setAccounts} />}
      </main>
    </div>
  );
}

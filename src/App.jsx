import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Customers from './pages/Customers';
import Estimates from './pages/Estimates';
import Invoices from './pages/Invoices';
import Payments from './pages/Payments';
import Hours from './pages/Hours';
import Expenses from './pages/Expenses';
import Scheduling from './pages/Scheduling';
import AiAssistant from './pages/AiAssistant';
import CrmLogin from './pages/CrmLogin';
import './App.css';

const ownerEmail = 'cramerservicesllc@gmail.com';
const staffRoles = ['admin', 'staff', 'technician', 'tech'];

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [staffAllowed, setStaffAllowed] = useState(false);
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    let active = true;
    const checkStaff = async (nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setAuthLoading(true);
      setAccessError('');
      if (!nextSession?.user) {
        setStaffAllowed(false); setAuthLoading(false); return;
      }

      const email = (nextSession.user.email || '').toLowerCase();
      if (email === ownerEmail) {
        setStaffAllowed(true); setAuthLoading(false); return;
      }

      const { data, error } = await supabase.from('profiles').select('role').eq('auth_user_id', nextSession.user.id).maybeSingle();
      const allowed = !error && staffRoles.includes(String(data?.role || '').toLowerCase());
      setStaffAllowed(allowed);
      if (!allowed) setAccessError('This account is not approved for staff CRM access. Ask an administrator to set its profile role to technician or staff.');
      setAuthLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => checkStaff(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => checkStaff(nextSession));
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const renderPage = () => {
    const pages = {
      dashboard: <Dashboard setCurrentPage={setCurrentPage} />,
      assistant: <AiAssistant />,
      scheduling: <Scheduling />,
      hours: <Hours />,
      expenses: <Expenses />,
      leads: <Leads />,
      customers: <Customers />,
      estimates: <Estimates />,
      invoices: <Invoices />,
      payments: <Payments />,
    };
    return pages[currentPage] || pages.dashboard;
  };

  if (authLoading) return <div className="crm-auth-loading">Checking staff access…</div>;
  if (!session || !staffAllowed) return <CrmLogin accessError={accessError} />;

  const navItems = [
    ['dashboard', 'Dashboard'], ['assistant', 'AI Assistant'], ['scheduling', 'Scheduling'],
    ['expenses', 'Expenses'], ['hours', 'Hours'], ['leads', 'Leads'], ['customers', 'Customers'],
    ['estimates', 'Estimates'], ['invoices', 'Invoices'], ['payments', 'Payments'],
  ];

  return <div className="app">
    <nav className="app-nav"><div className="nav-brand"><h1>CRM System</h1></div><div className="nav-links">
      {navItems.map(([key, label]) => <button key={key} className={currentPage === key ? 'active' : ''} onClick={() => setCurrentPage(key)}>{label}</button>)}
      <button className="sign-out-nav" onClick={() => supabase.auth.signOut()}>Sign Out</button>
    </div></nav>
    <main className="app-main">{renderPage()}</main>
  </div>;
}

export default App;

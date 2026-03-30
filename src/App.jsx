import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Customers from './pages/Customers';
import Estimates from './pages/Estimates';
import Invoices from './pages/Invoices';
import Payments from './pages/Payments';
import './App.css';
import Hours from './pages/Hours';
 
function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

 const renderPage = () => {
  switch (currentPage) {
    case 'dashboard':
      return <Dashboard />;
    case 'customers':
      return <Customers />;
    case 'estimates':
      return <Estimates />;
    case 'invoices':
      return <Invoices />;
    case 'payments':
      return <Payments />;
    case 'hours':
      return <Hours />;
    default:
      return <Dashboard />;
  }
};

  return (
    <div className="app">
      <nav className="app-nav">
        <div className="nav-brand">
          <h1>CRM System</h1>
        </div>

        <div className="nav-links">
          <button
            className={currentPage === 'dashboard' ? 'active' : ''}
            onClick={() => setCurrentPage('dashboard')}
          >
            Dashboard
          </button>
<button
  className={currentPage === 'hours' ? 'active' : ''}
  onClick={() => setCurrentPage('hours')}
>
  Hours
</button>
          <button
            className={currentPage === 'leads' ? 'active' : ''}
            onClick={() => setCurrentPage('leads')}
          >
            Leads
          </button>

          <button
            className={currentPage === 'customers' ? 'active' : ''}
            onClick={() => setCurrentPage('customers')}
          >
            Customers
          </button>

          <button
            className={currentPage === 'estimates' ? 'active' : ''}
            onClick={() => setCurrentPage('estimates')}
          >
            Estimates
          </button>

          <button
            className={currentPage === 'invoices' ? 'active' : ''}
            onClick={() => setCurrentPage('invoices')}
          >
            Invoices
          </button>

          <button
            className={currentPage === 'payments' ? 'active' : ''}
            onClick={() => setCurrentPage('payments')}
          >
            Payments
          </button>
        </div>
      </nav>

      <main className="app-main">
        {renderPage()}
      </main>
    </div>
  );
}

export default App;

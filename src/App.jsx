import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Customers from './pages/Customers';
import Estimates from './pages/Estimates';
import Invoices from './pages/Invoices';
import Payments from './pages/Payments';
import Hours from './pages/Hours';
import Expenses from './pages/Expenses';
import Scheduling from './pages/Scheduling';
import './App.css';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard setCurrentPage={setCurrentPage} />;
      case 'scheduling':
        return <Scheduling />;
      case 'hours':
        return <Hours />;
      case 'expenses':
        return <Expenses />;
      case 'leads':
        return <Leads />;
      case 'customers':
        return <Customers />;
      case 'estimates':
        return <Estimates />;
      case 'invoices':
        return <Invoices />;
      case 'payments':
        return <Payments />;
      default:
        return <Dashboard setCurrentPage={setCurrentPage} />;
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
            className={currentPage === 'scheduling' ? 'active' : ''}
            onClick={() => setCurrentPage('scheduling')}
          >
            Scheduling
          </button>

          <button
            className={currentPage === 'expenses' ? 'active' : ''}
            onClick={() => setCurrentPage('expenses')}
          >
            Expenses
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

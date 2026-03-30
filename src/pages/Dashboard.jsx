import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './Dashboard.css';

function Dashboard() {
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalEstimates: 0,
    totalInvoices: 0,
    totalRevenue: 0,
    paidAmount: 0,
    pendingAmount: 0,
    recentInvoices: [],
    recentEstimates: [],
    recentHours: []
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const [
        customersRes,
        estimatesCountRes,
        invoicesTotalsRes,
        recentEstimatesRes,
        recentInvoicesRes,
        recentHoursRes
      ] = await Promise.all([
        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true }),

        supabase
          .from('estimates')
          .select('id', { count: 'exact', head: true }),

        supabase
          .from('crm_invoices')
          .select('id, total_amount, amount_paid, amount_due', { count: 'exact' }),

        supabase
          .from('estimates')
          .select('*, customers(name)')
          .order('created_at', { ascending: false })
          .limit(5),

        supabase
          .from('crm_invoices')
          .select('*, customers(name)')
          .order('created_at', { ascending: false })
          .limit(5),

        supabase
          .from('job_hours')
          .select('*')
          .neq('status', 'running')
          .order('created_at', { ascending: false })
          .limit(5)
      ]);

      if (customersRes.error) throw customersRes.error;
      if (estimatesCountRes.error) throw estimatesCountRes.error;
      if (invoicesTotalsRes.error) throw invoicesTotalsRes.error;
      if (recentEstimatesRes.error) throw recentEstimatesRes.error;
      if (recentInvoicesRes.error) throw recentInvoicesRes.error;
      if (recentHoursRes.error) throw recentHoursRes.error;

      const allInvoices = invoicesTotalsRes.data || [];

      const totalRevenue = allInvoices.reduce(
        (sum, inv) => sum + parseFloat(inv.total_amount || 0),
        0
      );

      const paidAmount = allInvoices.reduce(
        (sum, inv) => sum + parseFloat(inv.amount_paid || 0),
        0
      );

      const pendingAmount = allInvoices.reduce(
        (sum, inv) => sum + parseFloat(inv.amount_due || 0),
        0
      );

      setStats({
        totalCustomers: customersRes.count || 0,
        totalEstimates: estimatesCountRes.count || 0,
        totalInvoices: invoicesTotalsRes.count || 0,
        totalRevenue,
        paidAmount,
        pendingAmount,
        recentEstimates: recentEstimatesRes.data || [],
        recentInvoices: recentInvoicesRes.data || [],
        recentHours: recentHoursRes.data || []
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return `$${parseFloat(amount || 0).toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';

    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard">
      <h2 className="dashboard-title">Dashboard</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#d4edff' }}>
            <span style={{ color: '#2980b9' }}>👥</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalCustomers}</div>
            <div className="stat-label">Total Customers</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#fff3cd' }}>
            <span style={{ color: '#f39c12' }}>📄</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalEstimates}</div>
            <div className="stat-label">Total Estimates</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#d5f4e6' }}>
            <span style={{ color: '#27ae60' }}>📋</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalInvoices}</div>
            <div className="stat-label">Total Invoices</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#d5f4e6' }}>
            <span style={{ color: '#27ae60' }}>💰</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.paidAmount)}</div>
            <div className="stat-label">Amount Paid</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#fadbd8' }}>
            <span style={{ color: '#e74c3c' }}>⏳</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.pendingAmount)}</div>
            <div className="stat-label">Amount Pending</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#d4edff' }}>
            <span style={{ color: '#2980b9' }}>📊</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.totalRevenue)}</div>
            <div className="stat-label">Total Revenue</div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-section">
          <h3>Recent Estimates</h3>
          {stats.recentEstimates.length === 0 ? (
            <div className="empty-state-small">No estimates yet</div>
          ) : (
            <div className="list-items">
              {stats.recentEstimates.map((estimate) => (
                <div key={estimate.id} className="list-item">
                  <div className="list-item-main">
                    <div className="list-item-title">
                      {estimate.estimate_number}
                    </div>
                    <div className="list-item-subtitle">
                      {estimate.customers?.name || 'Unknown Customer'}
                    </div>
                  </div>
                  <div className="list-item-side">
                    <div className="list-item-amount">
                      {formatCurrency(estimate.total_amount)}
                    </div>
                    <span className={`status-badge status-${estimate.status}`}>
                      {estimate.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <h3>Recent Invoices</h3>
          {stats.recentInvoices.length === 0 ? (
            <div className="empty-state-small">No invoices yet</div>
          ) : (
            <div className="list-items">
              {stats.recentInvoices.map((invoice) => (
                <div key={invoice.id} className="list-item">
                  <div className="list-item-main">
                    <div className="list-item-title">
                      {invoice.invoice_number}
                    </div>
                    <div className="list-item-subtitle">
                      {invoice.customers?.name || 'Unknown Customer'}
                    </div>
                  </div>
                  <div className="list-item-side">
                    <div className="list-item-amount">
                      {formatCurrency(invoice.total_amount)}
                    </div>
                    <span className={`status-badge status-${invoice.status}`}>
                      {invoice.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <h3>Recent Job Hours</h3>
          {stats.recentHours.length === 0 ? (
            <div className="empty-state-small">No hour entries yet</div>
          ) : (
            <div className="list-items">
              {stats.recentHours.map((row) => (
                <div key={row.id} className="list-item">
                  <div className="list-item-main">
                    <div className="list-item-title">
                      {row.estimate_number || 'Unknown Estimate'}
                    </div>
                    <div className="list-item-subtitle">
                      {row.tech_name || 'Unknown Tech'}
                    </div>
                    <div className="list-item-subtitle">
                      {formatDate(row.work_date)} • {parseFloat(row.total_hours || 0).toFixed(2)} hrs
                    </div>
                  </div>
                  <div className="list-item-side">
                    <span className={`status-badge status-${row.status}`}>
                      {row.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

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
    recentEstimates: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [customersRes, estimatesRes, invoicesRes] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('estimates').select('id', { count: 'exact', head: true }),
        supabase.from('crm_invoices').select('*').order('created_at', { ascending: false }).limit(5)
      ]);

      const invoicesData = invoicesRes.data || [];
      const totalRevenue = invoicesData.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);
      const paidAmount = invoicesData.reduce((sum, inv) => sum + parseFloat(inv.amount_paid || 0), 0);
      const pendingAmount = invoicesData.reduce((sum, inv) => sum + parseFloat(inv.amount_due || 0), 0);

      const estimatesData = await supabase
        .from('estimates')
        .select('*, customers(name)')
        .order('created_at', { ascending: false })
        .limit(5);

      const invoicesWithCustomers = await supabase
        .from('crm_invoices')
        .select('*, customers(name)')
        .order('created_at', { ascending: false })
        .limit(5);

      setStats({
        totalCustomers: customersRes.count || 0,
        totalEstimates: estimatesRes.count || 0,
        totalInvoices: invoicesRes.count || 0,
        totalRevenue,
        paidAmount,
        pendingAmount,
        recentEstimates: estimatesData.data || [],
        recentInvoices: invoicesWithCustomers.data || []
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
                    <div className="list-item-amount">{formatCurrency(estimate.total_amount)}</div>
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
                    <div className="list-item-amount">{formatCurrency(invoice.total_amount)}</div>
                    <span className={`status-badge status-${invoice.status}`}>
                      {invoice.status}
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

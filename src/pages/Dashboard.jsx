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
    totalExpenses: 0,
    totalHours: 0,
    totalProfit: 0,
    profitPerHour: 0,
    recentInvoices: [],
    recentEstimates: [],
    recentHours: [],
    recentExpenses: [],
    jobMetrics: []
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
        recentHoursRes,
        recentExpensesRes,
        allExpensesRes,
        allHoursRes
      ] = await Promise.all([
        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true }),

        supabase
          .from('estimates')
          .select('id', { count: 'exact', head: true }),

        supabase
          .from('crm_invoices')
          .select('id, estimate_id, total_amount, amount_paid, amount_due', { count: 'exact' }),

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
          .limit(5),

        supabase
          .from('job_expenses')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5),

        supabase
          .from('job_expenses')
          .select('id, estimate_id, estimate_number, total_amount'),

        supabase
          .from('job_hours')
          .select('id, estimate_id, estimate_number, total_hours')
          .neq('status', 'running')
      ]);

      if (customersRes.error) throw customersRes.error;
      if (estimatesCountRes.error) throw estimatesCountRes.error;
      if (invoicesTotalsRes.error) throw invoicesTotalsRes.error;
      if (recentEstimatesRes.error) throw recentEstimatesRes.error;
      if (recentInvoicesRes.error) throw recentInvoicesRes.error;
      if (recentHoursRes.error) throw recentHoursRes.error;
      if (recentExpensesRes.error) throw recentExpensesRes.error;
      if (allExpensesRes.error) throw allExpensesRes.error;
      if (allHoursRes.error) throw allHoursRes.error;

      const allInvoices = invoicesTotalsRes.data || [];
      const allExpenses = allExpensesRes.data || [];
      const allHours = allHoursRes.data || [];

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

      const totalExpenses = allExpenses.reduce(
        (sum, exp) => sum + parseFloat(exp.total_amount || 0),
        0
      );

      const totalHours = allHours.reduce(
        (sum, row) => sum + parseFloat(row.total_hours || 0),
        0
      );

      const totalProfit = totalRevenue - totalExpenses;
      const profitPerHour = totalHours > 0 ? totalProfit / totalHours : 0;

      const revenueByEstimate = {};
      const expenseByEstimate = {};
      const hoursByEstimate = {};

      allInvoices.forEach((inv) => {
        if (!inv.estimate_id) return;
        revenueByEstimate[inv.estimate_id] =
          (revenueByEstimate[inv.estimate_id] || 0) + Number(inv.total_amount || 0);
      });

      allExpenses.forEach((exp) => {
        if (!exp.estimate_id) return;
        expenseByEstimate[exp.estimate_id] =
          (expenseByEstimate[exp.estimate_id] || 0) + Number(exp.total_amount || 0);
      });

      allHours.forEach((row) => {
        if (!row.estimate_id) return;
        hoursByEstimate[row.estimate_id] =
          (hoursByEstimate[row.estimate_id] || 0) + Number(row.total_hours || 0);
      });

      const estimateNumbers = {};
      allInvoices.forEach((inv) => {
        if (inv.estimate_id) {
          estimateNumbers[inv.estimate_id] = inv.estimate_number || estimateNumbers[inv.estimate_id];
        }
      });
      allExpenses.forEach((exp) => {
        if (exp.estimate_id) {
          estimateNumbers[exp.estimate_id] = exp.estimate_number || estimateNumbers[exp.estimate_id];
        }
      });
      allHours.forEach((row) => {
        if (row.estimate_id) {
          estimateNumbers[row.estimate_id] = row.estimate_number || estimateNumbers[row.estimate_id];
        }
      });

      const allEstimateIds = Array.from(
        new Set([
          ...Object.keys(revenueByEstimate),
          ...Object.keys(expenseByEstimate),
          ...Object.keys(hoursByEstimate)
        ])
      );

      const jobMetrics = allEstimateIds
        .map((estimateId) => {
          const revenue = revenueByEstimate[estimateId] || 0;
          const expenses = expenseByEstimate[estimateId] || 0;
          const hours = hoursByEstimate[estimateId] || 0;
          const profit = revenue - expenses;
          const profitPerHourValue = hours > 0 ? profit / hours : 0;

          return {
            estimate_id: estimateId,
            estimate_number: estimateNumbers[estimateId] || 'Unknown Estimate',
            revenue,
            expenses,
            hours,
            profit,
            profitPerHour: profitPerHourValue
          };
        })
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 5);

      setStats({
        totalCustomers: customersRes.count || 0,
        totalEstimates: estimatesCountRes.count || 0,
        totalInvoices: invoicesTotalsRes.count || 0,
        totalRevenue,
        paidAmount,
        pendingAmount,
        totalExpenses,
        totalHours,
        totalProfit,
        profitPerHour,
        recentEstimates: recentEstimatesRes.data || [],
        recentInvoices: recentInvoicesRes.data || [],
        recentHours: recentHoursRes.data || [],
        recentExpenses: recentExpensesRes.data || [],
        jobMetrics
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

  const formatHours = (amount) => {
    return Number(amount || 0).toFixed(2);
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

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#fdebd0' }}>
            <span style={{ color: '#d35400' }}>🧾</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.totalExpenses)}</div>
            <div className="stat-label">Total Expenses</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#ebf5fb' }}>
            <span style={{ color: '#2471a3' }}>⏱️</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatHours(stats.totalHours)}</div>
            <div className="stat-label">Total Hours</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#e8f8f5' }}>
            <span style={{ color: '#148f77' }}>📈</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.totalProfit)}</div>
            <div className="stat-label">Profit After Expenses</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#f5eef8' }}>
            <span style={{ color: '#7d3c98' }}>⚙️</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.profitPerHour)}</div>
            <div className="stat-label">Profit Per Hour</div>
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
                      {formatDate(row.work_date)} • {formatHours(row.total_hours)} hrs
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

        <div className="dashboard-section">
          <h3>Recent Expenses</h3>
          {stats.recentExpenses.length === 0 ? (
            <div className="empty-state-small">No expenses yet</div>
          ) : (
            <div className="list-items">
              {stats.recentExpenses.map((expense) => (
                <div key={expense.id} className="list-item">
                  <div className="list-item-main">
                    <div className="list-item-title">
                      {expense.estimate_number || 'Unknown Estimate'}
                    </div>
                    <div className="list-item-subtitle">
                      {expense.tech_name || 'Unknown Tech'} • {expense.category}
                    </div>
                    <div className="list-item-subtitle">
                      {formatDate(expense.expense_date)}
                    </div>
                  </div>
                  <div className="list-item-side">
                    <div className="list-item-amount">
                      {formatCurrency(expense.total_amount)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <h3>Top Job Profit Metrics</h3>
          {stats.jobMetrics.length === 0 ? (
            <div className="empty-state-small">No job metrics yet</div>
          ) : (
            <div className="list-items">
              {stats.jobMetrics.map((job) => (
                <div key={job.estimate_id} className="list-item">
                  <div className="list-item-main">
                    <div className="list-item-title">
                      {job.estimate_number}
                    </div>
                    <div className="list-item-subtitle">
                      Revenue: {formatCurrency(job.revenue)} • Expenses: {formatCurrency(job.expenses)}
                    </div>
                    <div className="list-item-subtitle">
                      Hours: {formatHours(job.hours)} • Profit/Hour: {formatCurrency(job.profitPerHour)}
                    </div>
                  </div>
                  <div className="list-item-side">
                    <div className="list-item-amount">
                      {formatCurrency(job.profit)}
                    </div>
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

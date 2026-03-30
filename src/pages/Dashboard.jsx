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
    jobMetrics: [],
    allInvoices: [],
    allEstimates: [],
    allHours: [],
    allExpenses: []
  });

  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState(null);
  const [selectedData, setSelectedData] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
  try {
    setLoading(true);

    const [
      customersCountRes,
      estimatesCountRes,
      invoicesTotalsRes,
      recentEstimatesRes,
      recentInvoicesRes,
      recentHoursRes,
      recentExpensesRes,
      allExpensesRes,
      allHoursRes,
      allEstimatesRes,
      allInvoicesDetailedRes,
      allCustomersRes
    ] = await Promise.all([
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true }),

      supabase
        .from('estimates')
        .select('id', { count: 'exact', head: true }),

      supabase
        .from('crm_invoices')
        .select('id, customer_id, estimate_id, estimate_number, total_amount, amount_paid, amount_due, invoice_number, status, created_at, invoice_date, due_date'),

      supabase
        .from('estimates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5),

      supabase
        .from('crm_invoices')
        .select('*')
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
        .select('*'),

      supabase
        .from('job_hours')
        .select('*')
        .neq('status', 'running'),

      supabase
        .from('estimates')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('crm_invoices')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('customers')
        .select('id, name')
    ]);

    if (customersCountRes.error) throw customersCountRes.error;
    if (estimatesCountRes.error) throw estimatesCountRes.error;
    if (invoicesTotalsRes.error) throw invoicesTotalsRes.error;
    if (recentEstimatesRes.error) throw recentEstimatesRes.error;
    if (recentInvoicesRes.error) throw recentInvoicesRes.error;
    if (recentHoursRes.error) throw recentHoursRes.error;
    if (recentExpensesRes.error) throw recentExpensesRes.error;
    if (allExpensesRes.error) throw allExpensesRes.error;
    if (allHoursRes.error) throw allHoursRes.error;
    if (allEstimatesRes.error) throw allEstimatesRes.error;
    if (allInvoicesDetailedRes.error) throw allInvoicesDetailedRes.error;
    if (allCustomersRes.error) throw allCustomersRes.error;

    const allInvoices = invoicesTotalsRes.data || [];
    const allExpenses = allExpensesRes.data || [];
    const allHours = allHoursRes.data || [];
    const allEstimates = allEstimatesRes.data || [];
    const allInvoicesDetailed = allInvoicesDetailedRes.data || [];
    const allCustomers = allCustomersRes.data || [];

    const customerMap = {};
    allCustomers.forEach((customer) => {
      customerMap[customer.id] = customer.name;
    });

    const attachCustomerName = (row) => ({
      ...row,
      customers: {
        name: customerMap[row.customer_id] || 'Unknown Customer'
      }
    });

    const recentEstimates = (recentEstimatesRes.data || []).map(attachCustomerName);
    const recentInvoices = (recentInvoicesRes.data || []).map(attachCustomerName);
    const allEstimatesWithCustomer = allEstimates.map(attachCustomerName);
    const allInvoicesWithCustomer = allInvoicesDetailed.map(attachCustomerName);

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
    const estimateNumbers = {};
    const customerNamesByEstimate = {};

    allInvoicesWithCustomer.forEach((inv) => {
      if (!inv.estimate_id) return;

      revenueByEstimate[inv.estimate_id] =
        (revenueByEstimate[inv.estimate_id] || 0) + Number(inv.total_amount || 0);

      estimateNumbers[inv.estimate_id] =
        inv.estimate_number || estimateNumbers[inv.estimate_id];

      if (inv.customers?.name) {
        customerNamesByEstimate[inv.estimate_id] = inv.customers.name;
      }
    });

    allExpenses.forEach((exp) => {
      if (!exp.estimate_id) return;

      expenseByEstimate[exp.estimate_id] =
        (expenseByEstimate[exp.estimate_id] || 0) + Number(exp.total_amount || 0);

      estimateNumbers[exp.estimate_id] =
        exp.estimate_number || estimateNumbers[exp.estimate_id];
    });

    allHours.forEach((row) => {
      if (!row.estimate_id) return;

      hoursByEstimate[row.estimate_id] =
        (hoursByEstimate[row.estimate_id] || 0) + Number(row.total_hours || 0);

      estimateNumbers[row.estimate_id] =
        row.estimate_number || estimateNumbers[row.estimate_id];
    });

    allEstimatesWithCustomer.forEach((est) => {
      if (!est.id) return;

      estimateNumbers[est.id] =
        est.estimate_number || estimateNumbers[est.id];

      if (est.customers?.name) {
        customerNamesByEstimate[est.id] = est.customers.name;
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
          customer_name: customerNamesByEstimate[estimateId] || 'Unknown Customer',
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
      totalCustomers: customersCountRes.count || 0,
      totalEstimates: estimatesCountRes.count || 0,
      totalInvoices: allInvoices.length || 0,
      totalRevenue,
      paidAmount,
      pendingAmount,
      totalExpenses,
      totalHours,
      totalProfit,
      profitPerHour,
      recentEstimates,
      recentInvoices,
      recentHours: recentHoursRes.data || [],
      recentExpenses: recentExpensesRes.data || [],
      jobMetrics,
      allInvoices: allInvoicesWithCustomer,
      allEstimates: allEstimatesWithCustomer,
      allHours,
      allExpenses
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

  const openMetricView = (view) => {
    if (view === 'customers') {
      setSelectedView('customers');
      setSelectedData([]);
      return;
    }

    if (view === 'estimates') {
      setSelectedView('estimates');
      setSelectedData(stats.allEstimates);
      return;
    }

    if (view === 'invoices') {
      setSelectedView('invoices');
      setSelectedData(stats.allInvoices);
      return;
    }

    if (view === 'paid') {
      setSelectedView('paid');
      setSelectedData(
        stats.allInvoices.filter((inv) => Number(inv.amount_paid || 0) > 0)
      );
      return;
    }

    if (view === 'pending') {
      setSelectedView('pending');
      setSelectedData(
        stats.allInvoices.filter((inv) => Number(inv.amount_due || 0) > 0)
      );
      return;
    }

    if (view === 'revenue') {
      setSelectedView('revenue');
      setSelectedData(stats.allInvoices);
      return;
    }

    if (view === 'expenses') {
      setSelectedView('expenses');
      setSelectedData(stats.allExpenses);
      return;
    }

    if (view === 'hours') {
      setSelectedView('hours');
      setSelectedData(stats.allHours);
      return;
    }

    if (view === 'profit') {
      setSelectedView('profit');
      setSelectedData(stats.jobMetrics);
      return;
    }

    if (view === 'profitPerHour') {
      setSelectedView('profitPerHour');
      setSelectedData(stats.jobMetrics);
      return;
    }
  };

  const openEstimateDetail = (estimate) => {
    setSelectedView('estimate_detail');
    setSelectedData(estimate);
  };

  const openInvoiceDetail = (invoice) => {
    setSelectedView('invoice_detail');
    setSelectedData(invoice);
  };

  const openExpenseDetail = (expense) => {
    setSelectedView('expense_detail');
    setSelectedData(expense);
  };

  const openJobHourDetail = (row) => {
    setSelectedView('job_hour_detail');
    setSelectedData(row);
  };

  const openJobMetricDetail = (job) => {
    const relatedInvoices = stats.allInvoices.filter(
      (inv) => inv.estimate_id === job.estimate_id
    );

    const relatedExpenses = stats.allExpenses.filter(
      (exp) => exp.estimate_id === job.estimate_id
    );

    const relatedHours = stats.allHours.filter(
      (row) => row.estimate_id === job.estimate_id
    );

    setSelectedView('job_metric_detail');
    setSelectedData({
      ...job,
      relatedInvoices,
      relatedExpenses,
      relatedHours
    });
  };

  const closeModal = () => {
    setSelectedView(null);
    setSelectedData(null);
  };

  const renderModalTitle = () => {
    switch (selectedView) {
      case 'customers':
        return 'Total Customers';
      case 'estimates':
        return 'All Estimates';
      case 'invoices':
        return 'All Invoices';
      case 'paid':
        return 'Paid Invoice Details';
      case 'pending':
        return 'Pending Invoice Details';
      case 'revenue':
        return 'Revenue Breakdown';
      case 'expenses':
        return 'Expense Breakdown';
      case 'hours':
        return 'Hours Breakdown';
      case 'profit':
        return 'Profit By Job';
      case 'profitPerHour':
        return 'Profit Per Hour By Job';
      case 'estimate_detail':
        return 'Estimate Details';
      case 'invoice_detail':
        return 'Invoice Details';
      case 'expense_detail':
        return 'Expense Details';
      case 'job_hour_detail':
        return 'Job Hour Details';
      case 'job_metric_detail':
        return 'Job Financial Details';
      default:
        return 'Details';
    }
  };

  const renderModalContent = () => {
    if (!selectedView) return null;

    if (selectedView === 'customers') {
      return (
        <div className="detail-stack">
          <div className="detail-card">
            <div className="detail-label">Total Customers</div>
            <div className="detail-value big">{stats.totalCustomers}</div>
          </div>
        </div>
      );
    }

    if (
      selectedView === 'revenue' ||
      selectedView === 'invoices' ||
      selectedView === 'paid' ||
      selectedView === 'pending'
    ) {
      if (!selectedData?.length) {
        return <div className="empty-state-small">No invoice data found</div>;
      }

      return (
        <div className="detail-list">
          {selectedData.map((inv) => (
            <div
              key={inv.id}
              className="detail-list-item clickable"
              onClick={() => openInvoiceDetail(inv)}
            >
              <div className="detail-list-main">
                <div className="detail-list-title">
                  {inv.invoice_number || 'Unknown Invoice'}
                </div>
                <div className="detail-list-subtitle">
                  {inv.customers?.name || 'Unknown Customer'}
                </div>
                <div className="detail-list-subtitle">
                  Estimate: {inv.estimate_number || 'N/A'} • Created: {formatDate(inv.created_at)}
                </div>
              </div>
              <div className="detail-list-side">
                <div className="detail-list-amount">
                  {formatCurrency(inv.total_amount)}
                </div>
                <div className="detail-list-subamount">
                  Paid: {formatCurrency(inv.amount_paid)}
                </div>
                <div className="detail-list-subamount">
                  Due: {formatCurrency(inv.amount_due)}
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (selectedView === 'estimates') {
      if (!selectedData?.length) {
        return <div className="empty-state-small">No estimate data found</div>;
      }

      return (
        <div className="detail-list">
          {selectedData.map((estimate) => (
            <div
              key={estimate.id}
              className="detail-list-item clickable"
              onClick={() => openEstimateDetail(estimate)}
            >
              <div className="detail-list-main">
                <div className="detail-list-title">
                  {estimate.estimate_number || 'Unknown Estimate'}
                </div>
                <div className="detail-list-subtitle">
                  {estimate.customers?.name || 'Unknown Customer'}
                </div>
                <div className="detail-list-subtitle">
                  Created: {formatDate(estimate.created_at)}
                </div>
              </div>
              <div className="detail-list-side">
                <div className="detail-list-amount">
                  {formatCurrency(estimate.total_amount)}
                </div>
                <span className={`status-badge status-${estimate.status}`}>
                  {estimate.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (selectedView === 'expenses') {
      if (!selectedData?.length) {
        return <div className="empty-state-small">No expense data found</div>;
      }

      return (
        <div className="detail-list">
          {selectedData.map((expense) => (
            <div
              key={expense.id}
              className="detail-list-item clickable"
              onClick={() => openExpenseDetail(expense)}
            >
              <div className="detail-list-main">
                <div className="detail-list-title">
                  {expense.estimate_number || 'Unknown Estimate'}
                </div>
                <div className="detail-list-subtitle">
                  {expense.tech_name || 'Unknown Tech'} • {expense.category || 'No Category'}
                </div>
                <div className="detail-list-subtitle">
                  {formatDate(expense.expense_date)} • Added: {formatDate(expense.created_at)}
                </div>
              </div>
              <div className="detail-list-side">
                <div className="detail-list-amount">
                  {formatCurrency(expense.total_amount)}
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (selectedView === 'hours') {
      if (!selectedData?.length) {
        return <div className="empty-state-small">No hours data found</div>;
      }

      return (
        <div className="detail-list">
          {selectedData.map((row) => (
            <div
              key={row.id}
              className="detail-list-item clickable"
              onClick={() => openJobHourDetail(row)}
            >
              <div className="detail-list-main">
                <div className="detail-list-title">
                  {row.estimate_number || 'Unknown Estimate'}
                </div>
                <div className="detail-list-subtitle">
                  {row.tech_name || 'Unknown Tech'}
                </div>
                <div className="detail-list-subtitle">
                  Work Date: {formatDate(row.work_date)} • Added: {formatDate(row.created_at)}
                </div>
              </div>
              <div className="detail-list-side">
                <div className="detail-list-amount">
                  {formatHours(row.total_hours)} hrs
                </div>
                <span className={`status-badge status-${row.status}`}>
                  {row.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (selectedView === 'profit' || selectedView === 'profitPerHour') {
      if (!selectedData?.length) {
        return <div className="empty-state-small">No job profit data found</div>;
      }

      return (
        <div className="detail-list">
          {selectedData.map((job) => (
            <div
              key={job.estimate_id}
              className="detail-list-item clickable"
              onClick={() => openJobMetricDetail(job)}
            >
              <div className="detail-list-main">
                <div className="detail-list-title">
                  {job.estimate_number}
                </div>
                <div className="detail-list-subtitle">
                  {job.customer_name || 'Unknown Customer'}
                </div>
                <div className="detail-list-subtitle">
                  Revenue: {formatCurrency(job.revenue)} • Expenses: {formatCurrency(job.expenses)}
                </div>
              </div>
              <div className="detail-list-side">
                <div className="detail-list-amount">
                  Profit: {formatCurrency(job.profit)}
                </div>
                <div className="detail-list-subamount">
                  {formatHours(job.hours)} hrs
                </div>
                <div className="detail-list-subamount">
                  {formatCurrency(job.profitPerHour)}/hr
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (selectedView === 'estimate_detail' && selectedData) {
      return (
        <div className="detail-stack">
          <div className="detail-card">
            <div className="detail-row"><strong>Estimate #:</strong> <span>{selectedData.estimate_number || '-'}</span></div>
            <div className="detail-row"><strong>Customer:</strong> <span>{selectedData.customers?.name || '-'}</span></div>
            <div className="detail-row"><strong>Status:</strong> <span>{selectedData.status || '-'}</span></div>
            <div className="detail-row"><strong>Total:</strong> <span>{formatCurrency(selectedData.total_amount)}</span></div>
            <div className="detail-row"><strong>Created:</strong> <span>{formatDate(selectedData.created_at)}</span></div>
            <div className="detail-row"><strong>Updated:</strong> <span>{formatDate(selectedData.updated_at)}</span></div>
            <div className="detail-row"><strong>Description:</strong> <span>{selectedData.description || '-'}</span></div>
          </div>
        </div>
      );
    }

    if (selectedView === 'invoice_detail' && selectedData) {
      return (
        <div className="detail-stack">
          <div className="detail-card">
            <div className="detail-row"><strong>Invoice #:</strong> <span>{selectedData.invoice_number || '-'}</span></div>
            <div className="detail-row"><strong>Estimate #:</strong> <span>{selectedData.estimate_number || '-'}</span></div>
            <div className="detail-row"><strong>Customer:</strong> <span>{selectedData.customers?.name || '-'}</span></div>
            <div className="detail-row"><strong>Status:</strong> <span>{selectedData.status || '-'}</span></div>
            <div className="detail-row"><strong>Total:</strong> <span>{formatCurrency(selectedData.total_amount)}</span></div>
            <div className="detail-row"><strong>Paid:</strong> <span>{formatCurrency(selectedData.amount_paid)}</span></div>
            <div className="detail-row"><strong>Due:</strong> <span>{formatCurrency(selectedData.amount_due)}</span></div>
            <div className="detail-row"><strong>Invoice Date:</strong> <span>{formatDate(selectedData.invoice_date)}</span></div>
            <div className="detail-row"><strong>Due Date:</strong> <span>{formatDate(selectedData.due_date)}</span></div>
            <div className="detail-row"><strong>Created:</strong> <span>{formatDate(selectedData.created_at)}</span></div>
          </div>
        </div>
      );
    }

    if (selectedView === 'expense_detail' && selectedData) {
      return (
        <div className="detail-stack">
          <div className="detail-card">
            <div className="detail-row"><strong>Estimate #:</strong> <span>{selectedData.estimate_number || '-'}</span></div>
            <div className="detail-row"><strong>Tech:</strong> <span>{selectedData.tech_name || '-'}</span></div>
            <div className="detail-row"><strong>Category:</strong> <span>{selectedData.category || '-'}</span></div>
            <div className="detail-row"><strong>Total Amount:</strong> <span>{formatCurrency(selectedData.total_amount)}</span></div>
            <div className="detail-row"><strong>Expense Date:</strong> <span>{formatDate(selectedData.expense_date)}</span></div>
            <div className="detail-row"><strong>Created:</strong> <span>{formatDate(selectedData.created_at)}</span></div>
            <div className="detail-row"><strong>Description:</strong> <span>{selectedData.description || '-'}</span></div>
          </div>
        </div>
      );
    }

    if (selectedView === 'job_hour_detail' && selectedData) {
      return (
        <div className="detail-stack">
          <div className="detail-card">
            <div className="detail-row"><strong>Estimate #:</strong> <span>{selectedData.estimate_number || '-'}</span></div>
            <div className="detail-row"><strong>Tech:</strong> <span>{selectedData.tech_name || '-'}</span></div>
            <div className="detail-row"><strong>Work Date:</strong> <span>{formatDate(selectedData.work_date)}</span></div>
            <div className="detail-row"><strong>Total Hours:</strong> <span>{formatHours(selectedData.total_hours)}</span></div>
            <div className="detail-row"><strong>Status:</strong> <span>{selectedData.status || '-'}</span></div>
            <div className="detail-row"><strong>Created:</strong> <span>{formatDate(selectedData.created_at)}</span></div>
            <div className="detail-row"><strong>Updated:</strong> <span>{formatDate(selectedData.updated_at)}</span></div>
            <div className="detail-row"><strong>Notes:</strong> <span>{selectedData.notes || '-'}</span></div>
          </div>
        </div>
      );
    }

    if (selectedView === 'job_metric_detail' && selectedData) {
      return (
        <div className="detail-stack">
          <div className="detail-card">
            <div className="detail-row"><strong>Estimate #:</strong> <span>{selectedData.estimate_number}</span></div>
            <div className="detail-row"><strong>Customer:</strong> <span>{selectedData.customer_name || '-'}</span></div>
            <div className="detail-row"><strong>Revenue:</strong> <span>{formatCurrency(selectedData.revenue)}</span></div>
            <div className="detail-row"><strong>Expenses:</strong> <span>{formatCurrency(selectedData.expenses)}</span></div>
            <div className="detail-row"><strong>Profit:</strong> <span>{formatCurrency(selectedData.profit)}</span></div>
            <div className="detail-row"><strong>Total Hours:</strong> <span>{formatHours(selectedData.hours)}</span></div>
            <div className="detail-row"><strong>Profit/Hour:</strong> <span>{formatCurrency(selectedData.profitPerHour)}</span></div>
          </div>

          <div className="detail-card">
            <h4>Related Invoices</h4>
            {selectedData.relatedInvoices?.length ? (
              selectedData.relatedInvoices.map((inv) => (
                <div key={inv.id} className="detail-row">
                  <span>{inv.invoice_number || 'Unknown Invoice'}</span>
                  <span>{formatCurrency(inv.total_amount)}</span>
                </div>
              ))
            ) : (
              <div className="empty-state-small">No invoices found</div>
            )}
          </div>

          <div className="detail-card">
            <h4>Related Expenses</h4>
            {selectedData.relatedExpenses?.length ? (
              selectedData.relatedExpenses.map((exp) => (
                <div key={exp.id} className="detail-row">
                  <span>
                    {exp.category || 'No Category'} • {exp.tech_name || 'Unknown Tech'}
                  </span>
                  <span>{formatCurrency(exp.total_amount)}</span>
                </div>
              ))
            ) : (
              <div className="empty-state-small">No expenses found</div>
            )}
          </div>

          <div className="detail-card">
            <h4>Related Hours</h4>
            {selectedData.relatedHours?.length ? (
              selectedData.relatedHours.map((row) => (
                <div key={row.id} className="detail-row">
                  <span>
                    {row.tech_name || 'Unknown Tech'} • {formatDate(row.work_date)}
                  </span>
                  <span>{formatHours(row.total_hours)} hrs</span>
                </div>
              ))
            ) : (
              <div className="empty-state-small">No hours found</div>
            )}
          </div>
        </div>
      );
    }

    return <div className="empty-state-small">No details available</div>;
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard">
      <h2 className="dashboard-title">Dashboard</h2>

      <div className="stats-grid">
        <div className="stat-card clickable" onClick={() => openMetricView('customers')}>
          <div className="stat-icon" style={{ backgroundColor: '#d4edff' }}>
            <span style={{ color: '#2980b9' }}>👥</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalCustomers}</div>
            <div className="stat-label">Total Customers</div>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => openMetricView('estimates')}>
          <div className="stat-icon" style={{ backgroundColor: '#fff3cd' }}>
            <span style={{ color: '#f39c12' }}>📄</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalEstimates}</div>
            <div className="stat-label">Total Estimates</div>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => openMetricView('invoices')}>
          <div className="stat-icon" style={{ backgroundColor: '#d5f4e6' }}>
            <span style={{ color: '#27ae60' }}>📋</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalInvoices}</div>
            <div className="stat-label">Total Invoices</div>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => openMetricView('paid')}>
          <div className="stat-icon" style={{ backgroundColor: '#d5f4e6' }}>
            <span style={{ color: '#27ae60' }}>💰</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.paidAmount)}</div>
            <div className="stat-label">Amount Paid</div>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => openMetricView('pending')}>
          <div className="stat-icon" style={{ backgroundColor: '#fadbd8' }}>
            <span style={{ color: '#e74c3c' }}>⏳</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.pendingAmount)}</div>
            <div className="stat-label">Amount Pending</div>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => openMetricView('revenue')}>
          <div className="stat-icon" style={{ backgroundColor: '#d4edff' }}>
            <span style={{ color: '#2980b9' }}>📊</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.totalRevenue)}</div>
            <div className="stat-label">Total Revenue</div>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => openMetricView('expenses')}>
          <div className="stat-icon" style={{ backgroundColor: '#fdebd0' }}>
            <span style={{ color: '#d35400' }}>🧾</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.totalExpenses)}</div>
            <div className="stat-label">Total Expenses</div>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => openMetricView('hours')}>
          <div className="stat-icon" style={{ backgroundColor: '#ebf5fb' }}>
            <span style={{ color: '#2471a3' }}>⏱️</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatHours(stats.totalHours)}</div>
            <div className="stat-label">Total Hours</div>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => openMetricView('profit')}>
          <div className="stat-icon" style={{ backgroundColor: '#e8f8f5' }}>
            <span style={{ color: '#148f77' }}>📈</span>
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.totalProfit)}</div>
            <div className="stat-label">Profit After Expenses</div>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => openMetricView('profitPerHour')}>
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
                <div
                  key={estimate.id}
                  className="list-item clickable"
                  onClick={() => openEstimateDetail(estimate)}
                >
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
                <div
                  key={invoice.id}
                  className="list-item clickable"
                  onClick={() => openInvoiceDetail(invoice)}
                >
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
                <div
                  key={row.id}
                  className="list-item clickable"
                  onClick={() => openJobHourDetail(row)}
                >
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
                <div
                  key={expense.id}
                  className="list-item clickable"
                  onClick={() => openExpenseDetail(expense)}
                >
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
                <div
                  key={job.estimate_id}
                  className="list-item clickable"
                  onClick={() => openJobMetricDetail(job)}
                >
                  <div className="list-item-main">
                    <div className="list-item-title">
                      {job.estimate_number}
                    </div>
                    <div className="list-item-subtitle">
                      {job.customer_name || 'Unknown Customer'}
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

      {selectedView && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{renderModalTitle()}</h3>
              <button className="modal-close" onClick={closeModal}>
                ×
              </button>
            </div>

            <div className="modal-body">
              {renderModalContent()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;

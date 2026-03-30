import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import './Expenses.css';

const CATEGORY_OPTIONS = [
  'Materials',
  'Equipment',
  'Fuel',
  'Subcontractor',
  'Other'
];

const OVERHEAD_OPTION_VALUE = 'OVERHEAD';
const OVERHEAD_LABEL = 'Overhead / No Job';

const emptyLineItem = (sortOrder = 0) => ({
  id: `tmp-${Date.now()}-${Math.random()}`,
  description: '',
  quantity: '1',
  unit_cost: '0',
  line_total: 0,
  sort_order: sortOrder
});

function Expenses() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [approvedEstimates, setApprovedEstimates] = useState([]);
  const [techs, setTechs] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const [form, setForm] = useState({
    estimate_id: '',
    tech_user_id: '',
    expense_date: new Date().toISOString().slice(0, 10),
    category: 'Materials',
    notes: ''
  });

  const [lineItems, setLineItems] = useState([emptyLineItem(0)]);

  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [expandedExpenseId, setExpandedExpenseId] = useState(null);
  const [expenseDetails, setExpenseDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    fetchExpensePageData();
  }, []);

  const estimateOptions = useMemo(() => {
    return approvedEstimates.map((estimate) => ({
      ...estimate,
      label: `${estimate.estimate_number} - ${estimate.customers?.name || 'Unknown Customer'}`
    }));
  }, [approvedEstimates]);

  const computedLineItems = useMemo(() => {
    return lineItems.map((item) => {
      const quantity = Number(item.quantity || 0);
      const unitCost = Number(item.unit_cost || 0);
      const lineTotal = Number((quantity * unitCost).toFixed(2));

      return {
        ...item,
        line_total: lineTotal
      };
    });
  }, [lineItems]);

  const totalAmount = useMemo(() => {
    return computedLineItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
  }, [computedLineItems]);

  async function fetchExpensePageData() {
    try {
      setLoading(true);

      const [estimatesRes, techsRes, expensesRes] = await Promise.all([
        supabase
          .from('estimates')
          .select('id, estimate_number, customer_id, status, customers(name)')
          .eq('status', 'approved')
          .order('created_at', { ascending: false }),

        supabase
          .from('tech_users')
          .select('user_id, name, email')
          .order('name', { ascending: true }),

        supabase
          .from('job_expenses')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20)
      ]);

      if (estimatesRes.error) throw estimatesRes.error;
      if (techsRes.error) throw techsRes.error;
      if (expensesRes.error) throw expensesRes.error;

      setApprovedEstimates(estimatesRes.data || []);
      setTechs(techsRes.data || []);
      setExpenses(expensesRes.data || []);
    } catch (error) {
      console.error('Error loading expenses page:', error);
      alert(error.message || 'Failed to load expenses page.');
    } finally {
      setLoading(false);
    }
  }

  async function loadExpenseDetails(expenseId) {
    try {
      setLoadingDetails(true);

      const { data, error } = await supabase
        .from('job_expense_line_items')
        .select('*')
        .eq('expense_id', expenseId)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      setExpenseDetails((prev) => ({
        ...prev,
        [expenseId]: data || []
      }));
    } catch (error) {
      console.error('Error loading expense details:', error);
      alert(error.message || 'Failed to load expense details.');
    } finally {
      setLoadingDetails(false);
    }
  }

  async function toggleExpenseDetails(expenseId) {
    if (expandedExpenseId === expenseId) {
      setExpandedExpenseId(null);
      return;
    }

    setExpandedExpenseId(expenseId);

    if (!expenseDetails[expenseId]) {
      await loadExpenseDetails(expenseId);
    }
  }

  function updateLineItem(index, field, value) {
    setLineItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, emptyLineItem(prev.length)]);
  }

  function removeLineItem(index) {
    setLineItems((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index).map((item, i) => ({
        ...item,
        sort_order: i
      }));
    });
  }

  function resetForm() {
    setForm({
      estimate_id: '',
      tech_user_id: '',
      expense_date: new Date().toISOString().slice(0, 10),
      category: 'Materials',
      notes: ''
    });
    setLineItems([emptyLineItem(0)]);
    setEditingExpenseId(null);
  }

  function getEstimateDisplayLabel(expense) {
    if (!expense.estimate_id || expense.estimate_number === OVERHEAD_OPTION_VALUE || expense.estimate_number === OVERHEAD_LABEL) {
      return OVERHEAD_LABEL;
    }

    return expense.estimate_number || 'Unknown Estimate';
  }

  async function handleSaveExpense(e) {
    e.preventDefault();

    if (!form.estimate_id || !form.tech_user_id || !form.expense_date || !form.category) {
      alert('Please complete all required expense fields.');
      return;
    }

    const validItems = computedLineItems.filter(
      (item) => item.description.trim() && Number(item.quantity) > 0
    );

    if (validItems.length === 0) {
      alert('Add at least one expense line item.');
      return;
    }

    try {
      setSaving(true);

      const isOverhead = form.estimate_id === OVERHEAD_OPTION_VALUE;
      const estimate = approvedEstimates.find((item) => item.id === form.estimate_id);
      const tech = techs.find((item) => item.user_id === form.tech_user_id);

      if (!isOverhead && !estimate) {
        throw new Error('Selected estimate was not found.');
      }

      if (!tech) {
        throw new Error('Selected tech was not found.');
      }

      const expenseHeaderPayload = {
        estimate_id: isOverhead ? null : estimate.id,
        estimate_number: isOverhead ? OVERHEAD_LABEL : estimate.estimate_number,
        customer_id: isOverhead ? null : estimate.customer_id,
        tech_user_id: tech.user_id,
        tech_name: tech.name || tech.email || 'Unknown Tech',
        expense_date: form.expense_date,
        category: form.category,
        notes: form.notes || null,
        total_amount: totalAmount
      };

      if (editingExpenseId) {
        const { error: updateHeaderError } = await supabase
          .from('job_expenses')
          .update(expenseHeaderPayload)
          .eq('id', editingExpenseId);

        if (updateHeaderError) throw updateHeaderError;

        const { error: deleteOldItemsError } = await supabase
          .from('job_expense_line_items')
          .delete()
          .eq('expense_id', editingExpenseId);

        if (deleteOldItemsError) throw deleteOldItemsError;

        const insertItemsPayload = validItems.map((item, index) => ({
          expense_id: editingExpenseId,
          description: item.description.trim(),
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost),
          line_total: Number(item.line_total),
          sort_order: index
        }));

        const { error: insertNewItemsError } = await supabase
          .from('job_expense_line_items')
          .insert(insertItemsPayload);

        if (insertNewItemsError) throw insertNewItemsError;
      } else {
        const { data: expenseInsertData, error: expenseInsertError } = await supabase
          .from('job_expenses')
          .insert(expenseHeaderPayload)
          .select()
          .single();

        if (expenseInsertError) throw expenseInsertError;

        const insertItemsPayload = validItems.map((item, index) => ({
          expense_id: expenseInsertData.id,
          description: item.description.trim(),
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost),
          line_total: Number(item.line_total),
          sort_order: index
        }));

        const { error: lineItemsInsertError } = await supabase
          .from('job_expense_line_items')
          .insert(insertItemsPayload);

        if (lineItemsInsertError) throw lineItemsInsertError;
      }

      resetForm();
      await fetchExpensePageData();
    } catch (error) {
      console.error('Error saving expense:', error);
      alert(error.message || 'Failed to save expense.');
    } finally {
      setSaving(false);
    }
  }

  async function startEditExpense(expense) {
    try {
      setSaving(true);

      const { data: items, error } = await supabase
        .from('job_expense_line_items')
        .select('*')
        .eq('expense_id', expense.id)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      const isOverhead =
        !expense.estimate_id ||
        expense.estimate_number === OVERHEAD_OPTION_VALUE ||
        expense.estimate_number === OVERHEAD_LABEL;

      setEditingExpenseId(expense.id);
      setForm({
        estimate_id: isOverhead ? OVERHEAD_OPTION_VALUE : expense.estimate_id || '',
        tech_user_id: expense.tech_user_id || '',
        expense_date: expense.expense_date || new Date().toISOString().slice(0, 10),
        category: expense.category || 'Materials',
        notes: expense.notes || ''
      });

      setLineItems(
        (items || []).length
          ? items.map((item, index) => ({
              id: item.id,
              description: item.description || '',
              quantity: String(item.quantity ?? 1),
              unit_cost: String(item.unit_cost ?? 0),
              line_total: Number(item.line_total || 0),
              sort_order: index
            }))
          : [emptyLineItem(0)]
      );
    } catch (error) {
      console.error('Error loading expense for edit:', error);
      alert(error.message || 'Failed to load expense for editing.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(expenseId) {
    const confirmed = window.confirm('Delete this expense and all its line items?');
    if (!confirmed) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from('job_expenses')
        .delete()
        .eq('id', expenseId);

      if (error) throw error;

      if (expandedExpenseId === expenseId) {
        setExpandedExpenseId(null);
      }

      await fetchExpensePageData();
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert(error.message || 'Failed to delete expense.');
    } finally {
      setSaving(false);
    }
  }

  function formatCurrency(amount) {
    return `$${Number(amount || 0).toFixed(2)}`;
  }

  function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  if (loading) {
    return <div className="loading">Loading expenses...</div>;
  }

  return (
    <div className="expenses-page">
      <h2 className="expenses-title">Expenses</h2>

      <div className="expenses-card">
        <h3>{editingExpenseId ? 'Edit Expense' : 'Add Expense'}</h3>

        <form onSubmit={handleSaveExpense} className="expenses-form">
          <div className="expenses-grid">
            <select
              value={form.estimate_id}
              onChange={(e) => setForm({ ...form, estimate_id: e.target.value })}
            >
              <option value="">Select approved estimate</option>
              <option value={OVERHEAD_OPTION_VALUE}>{OVERHEAD_LABEL}</option>
              {estimateOptions.map((estimate) => (
                <option key={estimate.id} value={estimate.id}>
                  {estimate.label}
                </option>
              ))}
            </select>

            <select
              value={form.tech_user_id}
              onChange={(e) => setForm({ ...form, tech_user_id: e.target.value })}
            >
              <option value="">Select tech</option>
              {techs.map((tech) => (
                <option key={tech.user_id} value={tech.user_id}>
                  {tech.name || tech.email || tech.user_id}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={form.expense_date}
              onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
            />

            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <textarea
            rows={3}
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />

          <div className="line-items-section">
            <div className="line-items-header">
              <h4>Expense Line Items</h4>
              <button type="button" onClick={addLineItem}>
                Add Line Item
              </button>
            </div>

            <div className="line-items-table">
              <div className="line-items-table-header">
                <div>Description</div>
                <div>Qty</div>
                <div>Unit Cost</div>
                <div>Total</div>
                <div>Action</div>
              </div>

              {computedLineItems.map((item, index) => (
                <div key={item.id} className="line-items-table-row">
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                  />

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                  />

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_cost}
                    onChange={(e) => updateLineItem(index, 'unit_cost', e.target.value)}
                  />

                  <div className="line-total-display">
                    {formatCurrency(item.line_total)}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    disabled={computedLineItems.length === 1}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="expense-total-row">
            <strong>Total Expense: {formatCurrency(totalAmount)}</strong>
          </div>

          <div className="expense-form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : editingExpenseId ? 'Update Expense' : 'Save Expense'}
            </button>

            {editingExpenseId ? (
              <button type="button" onClick={resetForm} disabled={saving}>
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="expenses-card">
        <h3>Recent Expenses</h3>

        {expenses.length === 0 ? (
          <div className="empty-state-small">No expenses yet</div>
        ) : (
          <div className="list-items">
            {expenses.map((expense) => (
              <div key={expense.id} className="expense-list-wrap">
                <div className="list-item">
                  <div className="list-item-main">
                    <div className="list-item-title">
                      {getEstimateDisplayLabel(expense)}
                    </div>
                    <div className="list-item-subtitle">
                      {expense.tech_name} • {expense.category}
                    </div>
                    <div className="list-item-subtitle">
                      {formatDate(expense.expense_date)}
                    </div>
                    {expense.notes ? (
                      <div className="list-item-subtitle">
                        Notes: {expense.notes}
                      </div>
                    ) : null}
                  </div>

                  <div className="list-item-side">
                    <div className="list-item-amount">
                      {formatCurrency(expense.total_amount)}
                    </div>

                    <button type="button" onClick={() => toggleExpenseDetails(expense.id)}>
                      {expandedExpenseId === expense.id ? 'Hide Items' : 'View Items'}
                    </button>

                    <button type="button" onClick={() => startEditExpense(expense)} disabled={saving}>
                      Edit
                    </button>

                    <button type="button" onClick={() => deleteExpense(expense.id)} disabled={saving}>
                      Delete
                    </button>
                  </div>
                </div>

                {expandedExpenseId === expense.id ? (
                  <div className="expense-items-panel">
                    {loadingDetails && !expenseDetails[expense.id] ? (
                      <div>Loading items...</div>
                    ) : expenseDetails[expense.id]?.length ? (
                      <div className="expense-items-list">
                        {expenseDetails[expense.id].map((item) => (
                          <div key={item.id} className="expense-item-row">
                            <div>{item.description}</div>
                            <div>Qty: {Number(item.quantity).toFixed(2)}</div>
                            <div>Unit: {formatCurrency(item.unit_cost)}</div>
                            <div>Total: {formatCurrency(item.line_total)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>No line items found.</div>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Expenses;

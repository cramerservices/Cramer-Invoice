import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './Customers.css';

function Payments() {
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    invoiceId: '',
    paymentDate: new Date().toISOString().split('T')[0],
    amount: '',
    paymentMethod: 'cash',
    referenceNumber: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [paymentsRes, invoicesRes] = await Promise.all([
        supabase
          .from('payments')
          .select('*, crm_invoices(invoice_number, customers(name))')
          .order('payment_date', { ascending: false }),
        supabase
          .from('crm_invoices')
          .select('*, customers(name)')
          .neq('status', 'paid')
          .neq('status', 'cancelled')
          .order('invoice_number')
      ]);

      setPayments(paymentsRes.data || []);
      setInvoices(invoicesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const paymentAmount = parseFloat(formData.amount);

      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          invoice_id: formData.invoiceId,
          payment_date: formData.paymentDate,
          amount: paymentAmount,
          payment_method: formData.paymentMethod,
          reference_number: formData.referenceNumber,
          notes: formData.notes
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      const { data: invoice } = await supabase
        .from('crm_invoices')
        .select('amount_paid, amount_due, total_amount')
        .eq('id', formData.invoiceId)
        .single();

      const newAmountPaid = parseFloat(invoice.amount_paid) + paymentAmount;
      const newAmountDue = parseFloat(invoice.total_amount) - newAmountPaid;
      const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';

      await supabase
        .from('crm_invoices')
        .update({
          amount_paid: newAmountPaid,
          amount_due: newAmountDue,
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', formData.invoiceId);

      setShowForm(false);
      resetForm();
      fetchData();
      alert('Payment recorded successfully!');
    } catch (error) {
      console.error('Error saving payment:', error);
      alert('Failed to record payment');
    }
  };

  const handleDelete = async (paymentId) => {
    if (!confirm('Are you sure you want to delete this payment? This will update the invoice balance.')) return;

    try {
      const { data: payment } = await supabase
        .from('payments')
        .select('invoice_id, amount')
        .eq('id', paymentId)
        .single();

      const { error: deleteError } = await supabase
        .from('payments')
        .delete()
        .eq('id', paymentId);

      if (deleteError) throw deleteError;

      const { data: invoice } = await supabase
        .from('crm_invoices')
        .select('amount_paid, amount_due, total_amount')
        .eq('id', payment.invoice_id)
        .single();

      const newAmountPaid = parseFloat(invoice.amount_paid) - parseFloat(payment.amount);
      const newAmountDue = parseFloat(invoice.total_amount) - newAmountPaid;
      const newStatus = newAmountDue <= 0 ? 'paid' : (newAmountPaid > 0 ? 'partial' : 'sent');

      await supabase
        .from('crm_invoices')
        .update({
          amount_paid: newAmountPaid,
          amount_due: newAmountDue,
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', payment.invoice_id);

      fetchData();
    } catch (error) {
      console.error('Error deleting payment:', error);
      alert('Failed to delete payment');
    }
  };

  const resetForm = () => {
    setFormData({
      invoiceId: '',
      paymentDate: new Date().toISOString().split('T')[0],
      amount: '',
      paymentMethod: 'cash',
      referenceNumber: '',
      notes: ''
    });
  };

  const calculateTotalPayments = () => {
    return payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
  };

  if (loading) {
    return <div className="loading">Loading payments...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Payments</h2>
          <p style={{ color: '#7f8c8d', marginTop: '8px' }}>
            Total Received: <strong style={{ color: '#27ae60', fontSize: '18px' }}>
              ${calculateTotalPayments().toFixed(2)}
            </strong>
          </p>
        </div>
        {!showForm && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Record Payment
          </button>
        )}
      </div>

      {showForm && (
        <div className="form-card">
          <h3>Record New Payment</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Invoice *</label>
              <select
                name="invoiceId"
                value={formData.invoiceId}
                onChange={handleInputChange}
                required
              >
                <option value="">Select Invoice</option>
                {invoices.map(invoice => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoice_number} - {invoice.customers?.name} - Balance: ${parseFloat(invoice.amount_due).toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Payment Date *</label>
                <input
                  type="date"
                  name="paymentDate"
                  value={formData.paymentDate}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  name="amount"
                  value={formData.amount}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="form-group">
                <label>Payment Method *</label>
                <select
                  name="paymentMethod"
                  value={formData.paymentMethod}
                  onChange={handleInputChange}
                  required
                >
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="card">Card</option>
                  <option value="transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Reference Number</label>
              <input
                type="text"
                name="referenceNumber"
                value={formData.referenceNumber}
                onChange={handleInputChange}
                placeholder="Check number, transaction ID, etc."
              />
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows="3"
                placeholder="Additional notes about this payment..."
              />
            </div>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Record Payment
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        {payments.length === 0 ? (
          <div className="empty-state">
            <p>No payments recorded yet. Record your first payment to get started!</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                  <td><strong>{payment.crm_invoices?.invoice_number || 'N/A'}</strong></td>
                  <td>{payment.crm_invoices?.customers?.name || 'Unknown'}</td>
                  <td>
                    <strong style={{ color: '#27ae60' }}>
                      ${parseFloat(payment.amount).toFixed(2)}
                    </strong>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      backgroundColor: '#ecf0f1',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500',
                      textTransform: 'capitalize'
                    }}>
                      {payment.payment_method}
                    </span>
                  </td>
                  <td>{payment.reference_number || '-'}</td>
                  <td>
                    <button
                      className="btn-small btn-delete"
                      onClick={() => handleDelete(payment.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Payments;

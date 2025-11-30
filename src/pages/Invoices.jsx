import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import './Customers.css';

function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    invoiceNumber: '',
    customerId: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    workCompletedDate: '',
    techName: '',
    notes: '',
    status: 'draft'
  });
  const [lineItems, setLineItems] = useState([
    { description: '', materialCost: '', laborCost: '' }
  ]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [invoicesRes, customersRes] = await Promise.all([
        supabase
          .from('crm_invoices')
          .select('*, customers(name)')
          .order('created_at', { ascending: false }),
        supabase
          .from('customers')
          .select('*')
          .order('name')
      ]);

      setInvoices(invoicesRes.data || []);
      setCustomers(customersRes.data || []);
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

  const handleLineItemChange = (index, field, value) => {
    const updated = [...lineItems];
    updated[index][field] = value;
    setLineItems(updated);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', materialCost: '', laborCost: '' }]);
  };

  const removeLineItem = (index) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const calculateLineTotal = (item) => {
    return (parseFloat(item.materialCost) || 0) + (parseFloat(item.laborCost) || 0);
  };

  const calculateGrandTotal = () => {
    return lineItems.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const totalAmount = calculateGrandTotal();

      const { data: invoice, error: invoiceError } = await supabase
        .from('crm_invoices')
        .insert({
          invoice_number: formData.invoiceNumber,
          customer_id: formData.customerId,
          invoice_date: formData.invoiceDate,
          due_date: formData.dueDate,
          work_completed_date: formData.workCompletedDate,
          tech_name: formData.techName,
          notes: formData.notes,
          status: formData.status,
          total_amount: totalAmount,
          amount_paid: 0,
          amount_due: totalAmount
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      const lineItemsToInsert = lineItems.map((item, index) => ({
        invoice_id: invoice.id,
        description: item.description,
        material_cost: parseFloat(item.materialCost) || 0,
        labor_cost: parseFloat(item.laborCost) || 0,
        total_cost: calculateLineTotal(item),
        sort_order: index
      }));

      const { error: lineItemsError } = await supabase
        .from('crm_invoice_line_items')
        .insert(lineItemsToInsert);

      if (lineItemsError) throw lineItemsError;

      setShowForm(false);
      resetForm();
      fetchData();
      alert('Invoice created successfully!');
    } catch (error) {
      console.error('Error saving invoice:', error);
      alert('Failed to create invoice');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;

    try {
      const { error } = await supabase
        .from('crm_invoices')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error deleting invoice:', error);
      alert('Failed to delete invoice');
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const { error } = await supabase
        .from('crm_invoices')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  };

  const downloadPDF = async (invoiceId) => {
    try {
      const { data: invoice } = await supabase
        .from('crm_invoices')
        .select('*, customers(*)')
        .eq('id', invoiceId)
        .single();

      const { data: items } = await supabase
        .from('crm_invoice_line_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('sort_order');

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      let yPosition = 20;

      doc.setFontSize(24);
      doc.setFont(undefined, 'bold');
      doc.text('INVOICE', pageWidth / 2, yPosition, { align: 'center' });

      yPosition += 15;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Invoice #: ${invoice.invoice_number}`, 20, yPosition);
      yPosition += 6;
      doc.text(`Date: ${new Date(invoice.invoice_date).toLocaleDateString()}`, 20, yPosition);
      yPosition += 6;
      doc.text(`Due Date: ${new Date(invoice.due_date).toLocaleDateString()}`, 20, yPosition);
      yPosition += 6;
      doc.text(`Work Completed: ${new Date(invoice.work_completed_date).toLocaleDateString()}`, 20, yPosition);

      yPosition += 15;
      doc.setFont(undefined, 'bold');
      doc.text('BILL TO:', 20, yPosition);
      yPosition += 6;
      doc.setFont(undefined, 'normal');
      doc.text(invoice.customers.name, 20, yPosition);
      if (invoice.customers.address) {
        yPosition += 6;
        const addressLines = doc.splitTextToSize(invoice.customers.address, 80);
        addressLines.forEach(line => {
          doc.text(line, 20, yPosition);
          yPosition += 6;
        });
      }

      yPosition += 10;
      doc.setFont(undefined, 'bold');
      doc.text('TECHNICIAN:', 20, yPosition);
      yPosition += 6;
      doc.setFont(undefined, 'normal');
      doc.text(invoice.tech_name, 20, yPosition);

      yPosition += 15;
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('LINE ITEMS', 20, yPosition);
      yPosition += 8;

      doc.setFontSize(9);
      doc.text('Description', 20, yPosition);
      doc.text('Material', 120, yPosition);
      doc.text('Labor', 145, yPosition);
      doc.text('Total', 170, yPosition);
      yPosition += 5;
      doc.line(20, yPosition, pageWidth - 20, yPosition);
      yPosition += 6;

      doc.setFont(undefined, 'normal');
      items.forEach((item) => {
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 20;
        }

        const descLines = doc.splitTextToSize(item.description, 95);
        descLines.forEach((line, i) => {
          doc.text(line, 20, yPosition + (i * 5));
        });

        doc.text(`$${parseFloat(item.material_cost).toFixed(2)}`, 120, yPosition);
        doc.text(`$${parseFloat(item.labor_cost).toFixed(2)}`, 145, yPosition);
        doc.text(`$${parseFloat(item.total_cost).toFixed(2)}`, 170, yPosition);

        yPosition += Math.max(descLines.length * 5, 6) + 4;
      });

      yPosition += 5;
      doc.line(20, yPosition, pageWidth - 20, yPosition);
      yPosition += 8;

      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('TOTAL:', 145, yPosition);
      doc.text(`$${parseFloat(invoice.total_amount).toFixed(2)}`, 170, yPosition);
      yPosition += 8;
      doc.text('PAID:', 145, yPosition);
      doc.text(`$${parseFloat(invoice.amount_paid).toFixed(2)}`, 170, yPosition);
      yPosition += 8;
      doc.text('BALANCE DUE:', 145, yPosition);
      doc.text(`$${parseFloat(invoice.amount_due).toFixed(2)}`, 170, yPosition);

      if (invoice.notes) {
        yPosition += 15;
        doc.setFontSize(10);
        doc.text('NOTES:', 20, yPosition);
        yPosition += 6;
        doc.setFont(undefined, 'normal');
        const notesLines = doc.splitTextToSize(invoice.notes, pageWidth - 40);
        notesLines.forEach(line => {
          if (yPosition > 270) {
            doc.addPage();
            yPosition = 20;
          }
          doc.text(line, 20, yPosition);
          yPosition += 5;
        });
      }

      doc.save(`invoice-${invoice.invoice_number}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF');
    }
  };

  const resetForm = () => {
    setFormData({
      invoiceNumber: '',
      customerId: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: '',
      workCompletedDate: '',
      techName: '',
      notes: '',
      status: 'draft'
    });
    setLineItems([{ description: '', materialCost: '', laborCost: '' }]);
  };

  if (loading) {
    return <div className="loading">Loading invoices...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Invoices</h2>
        {!showForm && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Create Invoice
          </button>
        )}
      </div>

      {showForm && (
        <div className="form-card">
          <h3>New Invoice</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Invoice Number *</label>
                <input
                  type="text"
                  name="invoiceNumber"
                  value={formData.invoiceNumber}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Customer *</label>
                <select
                  name="customerId"
                  value={formData.customerId}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Select Customer</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Technician Name *</label>
                <input
                  type="text"
                  name="techName"
                  value={formData.techName}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Invoice Date *</label>
                <input
                  type="date"
                  name="invoiceDate"
                  value={formData.invoiceDate}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Due Date *</label>
                <input
                  type="date"
                  name="dueDate"
                  value={formData.dueDate}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Work Completed Date *</label>
                <input
                  type="date"
                  name="workCompletedDate"
                  value={formData.workCompletedDate}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Status *</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                required
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="form-section" style={{ marginTop: '24px' }}>
              <h4 style={{ marginBottom: '16px' }}>Line Items</h4>
              {lineItems.map((item, index) => (
                <div key={index} style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e5e5',
                  borderRadius: '6px',
                  padding: '16px',
                  marginBottom: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <strong>Item {index + 1}</strong>
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
                        className="btn-small btn-delete"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Description *</label>
                    <textarea
                      value={item.description}
                      onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                      rows="2"
                      required
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Material Cost</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.materialCost}
                        onChange={(e) => handleLineItemChange(index, 'materialCost', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="form-group">
                      <label>Labor Cost</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.laborCost}
                        onChange={(e) => handleLineItemChange(index, 'laborCost', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="form-group">
                      <label>Total</label>
                      <div style={{
                        padding: '10px 12px',
                        backgroundColor: '#ecf0f1',
                        borderRadius: '4px',
                        fontWeight: '600'
                      }}>
                        ${calculateLineTotal(item).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addLineItem} className="btn-primary" style={{ width: '100%' }}>
                + Add Line Item
              </button>
            </div>

            <div className="form-group" style={{ marginTop: '24px' }}>
              <label>Notes</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows="3"
                placeholder="Additional notes or terms..."
              />
            </div>

            <div style={{
              marginTop: '24px',
              padding: '16px',
              backgroundColor: '#f8f9fa',
              borderRadius: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <strong style={{ fontSize: '18px' }}>Grand Total:</strong>
              <span style={{ fontSize: '24px', fontWeight: '700', color: '#27ae60' }}>
                ${calculateGrandTotal().toFixed(2)}
              </span>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Create Invoice
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        {invoices.length === 0 ? (
          <div className="empty-state">
            <p>No invoices yet. Create your first invoice to get started!</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Due Date</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td><strong>{invoice.invoice_number}</strong></td>
                  <td>{invoice.customers?.name || 'Unknown'}</td>
                  <td>{new Date(invoice.invoice_date).toLocaleDateString()}</td>
                  <td>{new Date(invoice.due_date).toLocaleDateString()}</td>
                  <td><strong>${parseFloat(invoice.total_amount).toFixed(2)}</strong></td>
                  <td style={{ color: '#27ae60' }}>${parseFloat(invoice.amount_paid).toFixed(2)}</td>
                  <td style={{ color: '#e74c3c' }}>${parseFloat(invoice.amount_due).toFixed(2)}</td>
                  <td>
                    <select
                      value={invoice.status}
                      onChange={(e) => handleStatusChange(invoice.id, e.target.value)}
                      className={`status-badge status-${invoice.status}`}
                      style={{ border: 'none', cursor: 'pointer' }}
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="partial">Partial</option>
                      <option value="paid">Paid</option>
                      <option value="overdue">Overdue</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-small btn-view"
                        onClick={() => downloadPDF(invoice.id)}
                      >
                        PDF
                      </button>
                      <button
                        className="btn-small btn-delete"
                        onClick={() => handleDelete(invoice.id)}
                      >
                        Delete
                      </button>
                    </div>
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

export default Invoices;

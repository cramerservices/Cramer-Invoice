import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import './Customers.css';

function Estimates() {
  const [estimates, setEstimates] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    estimateNumber: '',
    customerId: '',
    estimateDate: new Date().toISOString().split('T')[0],
    expiryDate: '',
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

  useEffect(() => {
    if (showForm) {
      generateEstimateNumber();
    }
  }, [showForm]);

  const generateEstimateNumber = async () => {
    try {
      const { data, error } = await supabase
        .from('estimates')
        .select('estimate_number')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      let newNumber = 'EST-0001';
      if (data && data.length > 0) {
        const lastNumber = data[0].estimate_number;
        const match = lastNumber.match(/EST-(\d+)/);
        if (match) {
          const nextNum = parseInt(match[1]) + 1;
          newNumber = `EST-${String(nextNum).padStart(4, '0')}`;
        }
      }

      setFormData(prev => ({ ...prev, estimateNumber: newNumber }));
    } catch (error) {
      console.error('Error generating estimate number:', error);
    }
  };

  const fetchData = async () => {
    try {
      const [estimatesRes, customersRes] = await Promise.all([
        supabase
          .from('estimates')
          .select('*, customers(name)')
          .order('created_at', { ascending: false }),
        supabase
          .from('customers')
          .select('*')
          .order('name')
      ]);

      setEstimates(estimatesRes.data || []);
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

      const { data: estimate, error: estimateError } = await supabase
        .from('estimates')
        .insert({
          estimate_number: formData.estimateNumber,
          customer_id: formData.customerId,
          estimate_date: formData.estimateDate,
          expiry_date: formData.expiryDate || null,
          tech_name: formData.techName,
          notes: formData.notes,
          status: formData.status,
          total_amount: totalAmount
        })
        .select()
        .single();

      if (estimateError) throw estimateError;

      const lineItemsToInsert = lineItems.map((item, index) => ({
        estimate_id: estimate.id,
        description: item.description,
        material_cost: parseFloat(item.materialCost) || 0,
        labor_cost: parseFloat(item.laborCost) || 0,
        total_cost: calculateLineTotal(item),
        sort_order: index
      }));

      const { error: lineItemsError } = await supabase
        .from('estimate_line_items')
        .insert(lineItemsToInsert);

      if (lineItemsError) throw lineItemsError;

      setShowForm(false);
      resetForm();
      fetchData();
      alert('Estimate created successfully!');
    } catch (error) {
      console.error('Error saving estimate:', error);
      alert('Failed to create estimate');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this estimate?')) return;

    try {
      const { error } = await supabase
        .from('estimates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error deleting estimate:', error);
      alert('Failed to delete estimate');
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const { error } = await supabase
        .from('estimates')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  };

  const downloadPDF = async (estimateId) => {
    try {
      const { data: estimate } = await supabase
        .from('estimates')
        .select('*, customers(*)')
        .eq('id', estimateId)
        .single();

      const { data: items } = await supabase
        .from('estimate_line_items')
        .select('*')
        .eq('estimate_id', estimateId)
        .order('sort_order');

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      let yPosition = 20;

      doc.setFontSize(24);
      doc.setFont(undefined, 'bold');
      doc.text('ESTIMATE', pageWidth / 2, yPosition, { align: 'center' });

      yPosition += 15;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Estimate #: ${estimate.estimate_number}`, 20, yPosition);
      yPosition += 6;
      doc.text(`Date: ${new Date(estimate.estimate_date).toLocaleDateString()}`, 20, yPosition);
      if (estimate.expiry_date) {
        yPosition += 6;
        doc.text(`Expires: ${new Date(estimate.expiry_date).toLocaleDateString()}`, 20, yPosition);
      }

      yPosition += 15;
      doc.setFont(undefined, 'bold');
      doc.text('CUSTOMER:', 20, yPosition);
      yPosition += 6;
      doc.setFont(undefined, 'normal');
      doc.text(estimate.customers.name, 20, yPosition);
      if (estimate.customers.address) {
        yPosition += 6;
        doc.text(estimate.customers.address, 20, yPosition);
      }

      yPosition += 15;
      doc.setFont(undefined, 'bold');
      doc.text('TECHNICIAN:', 20, yPosition);
      yPosition += 6;
      doc.setFont(undefined, 'normal');
      doc.text(estimate.tech_name, 20, yPosition);

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
      doc.text(`$${parseFloat(estimate.total_amount).toFixed(2)}`, 170, yPosition);

      if (estimate.notes) {
        yPosition += 15;
        doc.setFontSize(10);
        doc.text('NOTES:', 20, yPosition);
        yPosition += 6;
        doc.setFont(undefined, 'normal');
        const notesLines = doc.splitTextToSize(estimate.notes, pageWidth - 40);
        notesLines.forEach(line => {
          if (yPosition > 270) {
            doc.addPage();
            yPosition = 20;
          }
          doc.text(line, 20, yPosition);
          yPosition += 5;
        });
      }

      doc.save(`estimate-${estimate.estimate_number}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF');
    }
  };

  const resetForm = () => {
    setFormData({
      estimateNumber: '',
      customerId: '',
      estimateDate: new Date().toISOString().split('T')[0],
      expiryDate: '',
      techName: '',
      notes: '',
      status: 'draft'
    });
    setLineItems([{ description: '', materialCost: '', laborCost: '' }]);
  };

  if (loading) {
    return <div className="loading">Loading estimates...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Estimates</h2>
        {!showForm && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Create Estimate
          </button>
        )}
      </div>

      {showForm && (
        <div className="form-card">
          <h3>New Estimate</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Estimate Number *</label>
                <input
                  type="text"
                  name="estimateNumber"
                  value={formData.estimateNumber}
                  onChange={handleInputChange}
                  required
                  readOnly
                  style={{ backgroundColor: '#ecf0f1', cursor: 'not-allowed' }}
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
                <label>Estimate Date *</label>
                <input
                  type="date"
                  name="estimateDate"
                  value={formData.estimateDate}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Expiry Date</label>
                <input
                  type="date"
                  name="expiryDate"
                  value={formData.expiryDate}
                  onChange={handleInputChange}
                />
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
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
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
                Create Estimate
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        {estimates.length === 0 ? (
          <div className="empty-state">
            <p>No estimates yet. Create your first estimate to get started!</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Estimate #</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {estimates.map((estimate) => (
                <tr key={estimate.id}>
                  <td><strong>{estimate.estimate_number}</strong></td>
                  <td>{estimate.customers?.name || 'Unknown'}</td>
                  <td>{new Date(estimate.estimate_date).toLocaleDateString()}</td>
                  <td><strong>${parseFloat(estimate.total_amount).toFixed(2)}</strong></td>
                  <td>
                    <select
                      value={estimate.status}
                      onChange={(e) => handleStatusChange(estimate.id, e.target.value)}
                      className={`status-badge status-${estimate.status}`}
                      style={{ border: 'none', cursor: 'pointer' }}
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="expired">Expired</option>
                    </select>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-small btn-view"
                        onClick={() => downloadPDF(estimate.id)}
                      >
                        PDF
                      </button>
                      <button
                        className="btn-small btn-delete"
                        onClick={() => handleDelete(estimate.id)}
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

export default Estimates;

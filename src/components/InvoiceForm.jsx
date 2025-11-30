import { useState } from 'react';
import { supabase } from '../lib/supabase';
import './InvoiceForm.css';

function InvoiceForm({ onSubmit }) {
  const [formData, setFormData] = useState({
    invoiceNumber: '',
    workCompletedDate: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    customerName: '',
    customerAddress: '',
    techName: '',
    notes: '',
  });

  const [lineItems, setLineItems] = useState([
    { description: '', materialCost: '', laborCost: '' }
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
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
    const material = parseFloat(item.materialCost) || 0;
    const labor = parseFloat(item.laborCost) || 0;
    return material + labor;
  };

  const calculateGrandTotal = () => {
    return lineItems.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const totalAmount = calculateGrandTotal();

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          invoice_number: formData.invoiceNumber,
          work_completed_date: formData.workCompletedDate,
          invoice_date: formData.invoiceDate,
          customer_name: formData.customerName,
          customer_address: formData.customerAddress,
          tech_name: formData.techName,
          notes: formData.notes,
          total_amount: totalAmount,
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
        sort_order: index,
      }));

      const { error: lineItemsError } = await supabase
        .from('invoice_line_items')
        .insert(lineItemsToInsert);

      if (lineItemsError) throw lineItemsError;

      onSubmit({
        ...formData,
        id: invoice.id,
        lineItems: lineItemsToInsert,
        totalAmount,
      });
    } catch (err) {
      setError(err.message || 'Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="invoice-form-container">
      <form onSubmit={handleSubmit} className="invoice-form">
        <div className="form-section">
          <h2>Invoice Information</h2>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="invoiceNumber">Invoice Number *</label>
              <input
                type="text"
                id="invoiceNumber"
                name="invoiceNumber"
                value={formData.invoiceNumber}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="invoiceDate">Invoice Date *</label>
              <input
                type="date"
                id="invoiceDate"
                name="invoiceDate"
                value={formData.invoiceDate}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="workCompletedDate">Work Completed Date *</label>
              <input
                type="date"
                id="workCompletedDate"
                name="workCompletedDate"
                value={formData.workCompletedDate}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Customer Information</h2>
          <div className="form-group">
            <label htmlFor="customerName">Customer Name *</label>
            <input
              type="text"
              id="customerName"
              name="customerName"
              value={formData.customerName}
              onChange={handleInputChange}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="customerAddress">Customer Address *</label>
            <textarea
              id="customerAddress"
              name="customerAddress"
              value={formData.customerAddress}
              onChange={handleInputChange}
              rows="3"
              required
            />
          </div>
        </div>

        <div className="form-section">
          <h2>Technician Information</h2>
          <div className="form-group">
            <label htmlFor="techName">Technician Name *</label>
            <input
              type="text"
              id="techName"
              name="techName"
              value={formData.techName}
              onChange={handleInputChange}
              required
            />
          </div>
        </div>

        <div className="form-section">
          <h2>Line Items</h2>
          {lineItems.map((item, index) => (
            <div key={index} className="line-item">
              <div className="line-item-header">
                <h3>Item {index + 1}</h3>
                {lineItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    className="btn-remove"
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
                  <div className="calculated-total">
                    ${calculateLineTotal(item).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={addLineItem} className="btn-add">
            + Add Line Item
          </button>
        </div>

        <div className="form-section">
          <h2>Additional Notes</h2>
          <div className="form-group">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows="4"
              placeholder="Any additional notes or terms..."
            />
          </div>
        </div>

        <div className="form-footer">
          <div className="grand-total">
            <strong>Grand Total:</strong>
            <span className="total-amount">${calculateGrandTotal().toFixed(2)}</span>
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? 'Creating Invoice...' : 'Create Invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default InvoiceForm;

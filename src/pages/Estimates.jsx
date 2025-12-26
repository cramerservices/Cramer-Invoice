import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import './Customers.css';
async function fetchAsDataURL(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load image: ${url}`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
const COMPANY = {
  name: 'Cramer Services LLC',
  phone: '314-267-8594',
  email: 'cramerservicesllc@gmail.com',
  website: 'www.cramerservicesllc.com'
};

// Works on GitHub Pages + custom domain
const LOGO_URL = `${import.meta.env.BASE_URL}CramerLogoText.png`;

async function fetchImageAsDataURL(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Logo fetch failed: ${res.status}`);
  const blob = await res.blob();

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

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
    const { data: estimate, error: estErr } = await supabase
      .from('estimates')
      .select('*, customers(*)')
      .eq('id', estimateId)
      .single();

    if (estErr) throw estErr;

    const { data: items, error: itemsErr } = await supabase
      .from('estimate_line_items')
      .select('*')
      .eq('estimate_id', estimateId)
      .order('sort_order');

    if (itemsErr) throw itemsErr;

    // Letter size in points: 612 x 792
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const M = 40;
    const BLUE = [30, 80, 160];
    const LIGHT_GRAY = [240, 240, 240];

    const fmtMoney = (n) => `$${(Number(n) || 0).toFixed(2)}`;

    const safeText = (val) => (val ? String(val) : '');

    // Try to load logo
    let logoDataUrl = null;
    try {
      logoDataUrl = await fetchImageAsDataURL(LOGO_URL);
    } catch (e) {
      console.warn('Logo not loaded:', e);
    }

    // ===== Header =====
    let y = M;

    if (logoDataUrl) {
      // Fit logo nicely in header
      doc.addImage(logoDataUrl, 'PNG', M, y - 8, 210, 55);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(COMPANY.name, M, y + 20);
    }

    // Company info under logo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const companyInfoX = M;
    const companyInfoY = y + 60;
    doc.text(`Phone: ${COMPANY.phone}`, companyInfoX, companyInfoY);
    doc.text(`Email: ${COMPANY.email}`, companyInfoX, companyInfoY + 12);
    doc.text(`Website: ${COMPANY.website}`, companyInfoX, companyInfoY + 24);

    // Right box: ESTIMATE
    const rightBoxW = 220;
    const rightBoxX = pageW - M - rightBoxW;
    const rightBoxY = y;

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('ESTIMATE', rightBoxX + rightBoxW / 2, rightBoxY + 18, { align: 'center' });

    // Blue bar + Estimate #
    doc.setFillColor(...BLUE);
    doc.rect(rightBoxX, rightBoxY + 26, rightBoxW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text(`ESTIMATE #`, rightBoxX + 10, rightBoxY + 39);
    doc.text(safeText(estimate.estimate_number), rightBoxX + rightBoxW - 10, rightBoxY + 39, { align: 'right' });

    // Date row
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(...LIGHT_GRAY);
    doc.rect(rightBoxX, rightBoxY + 44, rightBoxW, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('DATE', rightBoxX + 10, rightBoxY + 57);
    doc.setFont('helvetica', 'normal');
    doc.text(
      new Date(estimate.estimate_date).toLocaleDateString(),
      rightBoxX + rightBoxW - 10,
      rightBoxY + 57,
      { align: 'right' }
    );

    y = companyInfoY + 45;

    // ===== Requested By / Customer ID row =====
    const rowH = 30;
    const leftW = (pageW - 2 * M) * 0.65;
    const rightW2 = (pageW - 2 * M) - leftW;

    // Row background header strip
    doc.setFillColor(...LIGHT_GRAY);
    doc.rect(M, y, pageW - 2 * M, rowH, 'F');
    doc.setDrawColor(200);
    doc.rect(M, y, pageW - 2 * M, rowH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('REQUESTED BY', M + 10, y + 12);
    doc.text('CUSTOMER ID', M + leftW + 10, y + 12);

    doc.setFont('helvetica', 'normal');
    doc.text(safeText(estimate.customers?.name), M + 10, y + 25);

    // customer id = short UUID chunk (if you want something there)
    const custId = safeText(estimate.customer_id).slice(0, 8).toUpperCase();
    doc.text(custId ? custId : '-', M + leftW + 10, y + 25);

    y += rowH + 12;

    // ===== Two column boxes: BILL TO + JOB DETAILS =====
    const boxH = 110;
    const gap = 12;
    const boxW = (pageW - 2 * M - gap) / 2;

    const billX = M;
    const jobX = M + boxW + gap;

    const headerH = 18;

    // BILL TO box
    doc.setDrawColor(180);
    doc.rect(billX, y, boxW, boxH);
    doc.setFillColor(...BLUE);
    doc.rect(billX, y, boxW, headerH, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('BILL TO', billX + 10, y + 13);

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    let by = y + headerH + 16;
    doc.text(safeText(estimate.customers?.name), billX + 10, by);
    by += 12;

    const addr = safeText(estimate.customers?.address);
    if (addr) {
      const addrLines = doc.splitTextToSize(addr, boxW - 20);
      addrLines.forEach((line) => {
        doc.text(line, billX + 10, by);
        by += 12;
      });
    }

    const custEmail = safeText(estimate.customers?.email);
    const custPhone = safeText(estimate.customers?.phone);
    if (custEmail) {
      doc.text(custEmail, billX + 10, y + boxH - 28);
    }
    if (custPhone) {
      doc.text(custPhone, billX + 10, y + boxH - 14);
    }

    // JOB DETAILS box
    doc.rect(jobX, y, boxW, boxH);
    doc.setFillColor(...BLUE);
    doc.rect(jobX, y, boxW, headerH, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('JOB DETAILS', jobX + 10, y + 13);

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const tech = safeText(estimate.tech_name);
    doc.text(`Technician: ${tech || '-'}`, jobX + 10, y + headerH + 18);

    const expires = estimate.expiry_date ? new Date(estimate.expiry_date).toLocaleDateString() : '';
    doc.text(`Expires: ${expires || '-'}`, jobX + 10, y + headerH + 34);

    // Small placeholder line like the sample form
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('[Enter general description of work]', jobX + 10, y + headerH + 55);
    doc.setTextColor(0, 0, 0);

    y += boxH + 14;

    // ===== Line items table =====
    const tableX = M;
    const tableW = pageW - 2 * M;

    const col = {
      qty: tableX + 10,
      desc: tableX + 55,
      taxed: tableX + tableW - 170,
      unit: tableX + tableW - 115,
      total: tableX + tableW - 55
    };

    // Header bar
    doc.setFillColor(...BLUE);
    doc.rect(tableX, y, tableW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('QTY', col.qty, y + 13);
    doc.text('DESCRIPTION', col.desc, y + 13);
    doc.text('TAXED', col.taxed, y + 13);
    doc.text('UNIT PRICE', col.unit, y + 13, { align: 'right' });
    doc.text('TOTAL', col.total, y + 13, { align: 'right' });

    doc.setTextColor(0, 0, 0);

    y += 24;

    doc.setDrawColor(200);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const lineHeight = 14;

    const ensureSpace = (needed) => {
      if (y + needed > pageH - 140) {
        doc.addPage();
        y = M;
      }
    };

    items.forEach((item) => {
      ensureSpace(40);

      const qty = 1;
      const unitPrice = Number(item.total_cost) || 0;
      const total = Number(item.total_cost) || 0;

      const descLines = doc.splitTextToSize(safeText(item.description), (col.taxed - 10) - col.desc);
      const rowH2 = Math.max(descLines.length * lineHeight, lineHeight) + 10;

      // Row border
      doc.rect(tableX, y - 10, tableW, rowH2);

      doc.text(String(qty), col.qty, y);

      descLines.forEach((line, i) => {
        doc.text(line, col.desc, y + i * lineHeight);
      });

      // Taxed column (blank like sample)
      doc.text('', col.taxed, y);

      doc.text(fmtMoney(unitPrice), col.unit, y, { align: 'right' });
      doc.text(fmtMoney(total), col.total, y, { align: 'right' });

      y += rowH2;
    });

    // Totals box right
    ensureSpace(120);

    const subtotal = Number(estimate.total_amount) || 0;
    const taxRate = 0;
    const tax = subtotal * taxRate;
    const grandTotal = subtotal + tax;

    const totalsW = 200;
    const totalsX = tableX + tableW - totalsW;
    const totalsY = y + 10;

    doc.setDrawColor(180);
    doc.rect(totalsX, totalsY, totalsW, 90);

    const tRow = (label, value, rowIndex, bold = false) => {
      const yy = totalsY + 18 + rowIndex * 16;
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(9);
      doc.text(label, totalsX + 10, yy);
      doc.text(value, totalsX + totalsW - 10, yy, { align: 'right' });
    };

    tRow('SUBTOTAL', fmtMoney(subtotal), 0);
    tRow('TAX RATE', `${(taxRate * 100).toFixed(0)}%`, 1);
    tRow('TAX', fmtMoney(tax), 2);

    // Total bar
    doc.setFillColor(...BLUE);
    doc.rect(totalsX, totalsY + 58, totalsW, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('TOTAL', totalsX + 10, totalsY + 73);
    doc.text(fmtMoney(grandTotal), totalsX + totalsW - 10, totalsY + 73, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    y = totalsY + 110;

    // ===== Scope of Work =====
    ensureSpace(120);

    doc.setFillColor(...BLUE);
    doc.rect(M, y, tableW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('SCOPE OF WORK', M + 10, y + 13);
    doc.setTextColor(0, 0, 0);

    y += 28;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const scope = safeText(estimate.notes);
    const scopeLines = doc.splitTextToSize(scope || '—', tableW - 20);
    const scopeBoxH = Math.max(70, scopeLines.length * 12 + 20);

    doc.setDrawColor(180);
    doc.rect(M, y - 10, tableW, scopeBoxH);

    let sy = y + 10;
    scopeLines.forEach((line) => {
      doc.text(line, M + 10, sy);
      sy += 12;
    });

    y = y - 10 + scopeBoxH + 20;

    // ===== Footer / signature =====
    ensureSpace(120);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    doc.text('Please reference this estimate number in all correspondence.', M, y);
    y += 12;
    doc.text(`Questions? ${COMPANY.phone} | ${COMPANY.email}`, M, y);
    y += 24;

    doc.setDrawColor(0);
    doc.line(M, y, M + 260, y);
    doc.text('Signature', M, y + 12);

    doc.line(pageW - M - 180, y, pageW - M, y);
    doc.text('Date', pageW - M - 180, y + 12);

    // Save
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
       <label>Scope of Work</label>
<textarea
  name="notes"
  value={formData.notes}
  onChange={handleInputChange}
  rows="3"
  placeholder="Enter scope of work..."
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

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import './Customers.css';

const COMPANY = {
  name: 'Cramer Services LLC',
  phone: '314-267-8594',
  email: 'cramerservicesllc@gmail.com',
  website: 'www.cramerservicesllc.com'
};

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

  useEffect(() => {
    if (showForm) {
      generateInvoiceNumber();
    }
  }, [showForm]);

  const generateInvoiceNumber = async () => {
    try {
      const { data, error } = await supabase
        .from('crm_invoices')
        .select('invoice_number')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      let newNumber = 'INV-0001';
      if (data && data.length > 0) {
        const lastNumber = data[0].invoice_number;
        const match = lastNumber.match(/INV-(\d+)/);
        if (match) {
          const nextNum = parseInt(match[1]) + 1;
          newNumber = `INV-${String(nextNum).padStart(4, '0')}`;
        }
      }

      setFormData(prev => ({ ...prev, invoiceNumber: newNumber }));
    } catch (error) {
      console.error('Error generating invoice number:', error);
    }
  };

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
      const { data: invoice, error: invErr } = await supabase
        .from('crm_invoices')
        .select('*, customers(*)')
        .eq('id', invoiceId)
        .single();

      if (invErr) throw invErr;

      const { data: items, error: itemsErr } = await supabase
        .from('crm_invoice_line_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('sort_order');

      if (itemsErr) throw itemsErr;

      const { data: payments, error: paymentsErr } = await supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('payment_date');

      if (paymentsErr) throw paymentsErr;

      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      const M = 40;
      const BLUE = [30, 80, 160];
      const LIGHT_GRAY = [240, 240, 240];

      const fmtMoney = (n) => `$${(Number(n) || 0).toFixed(2)}`;
      const safeText = (val) => (val ? String(val) : '');

      let logoDataUrl = null;
      try {
        logoDataUrl = await fetchImageAsDataURL(LOGO_URL);
      } catch (e) {
        console.warn('Logo not loaded:', e);
      }

      let y = M;

      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', M, y - 8, 210, 55);
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text(COMPANY.name, M, y + 20);
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const companyInfoX = M;
      const companyInfoY = y + 60;
      doc.text(`Phone: ${COMPANY.phone}`, companyInfoX, companyInfoY);
      doc.text(`Email: ${COMPANY.email}`, companyInfoX, companyInfoY + 12);
      doc.text(`Website: ${COMPANY.website}`, companyInfoX, companyInfoY + 24);

      const rightBoxW = 220;
      const rightBoxX = pageW - M - rightBoxW;
      const rightBoxY = y;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('INVOICE', rightBoxX + rightBoxW / 2, rightBoxY + 18, { align: 'center' });

      doc.setFillColor(...BLUE);
      doc.rect(rightBoxX, rightBoxY + 26, rightBoxW, 18, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text(`INVOICE #`, rightBoxX + 10, rightBoxY + 39);
      doc.text(safeText(invoice.invoice_number), rightBoxX + rightBoxW - 10, rightBoxY + 39, { align: 'right' });

      doc.setTextColor(0, 0, 0);
      doc.setFillColor(...LIGHT_GRAY);
      doc.rect(rightBoxX, rightBoxY + 44, rightBoxW, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('DATE', rightBoxX + 10, rightBoxY + 57);
      doc.setFont('helvetica', 'normal');
      doc.text(
        new Date(invoice.invoice_date).toLocaleDateString(),
        rightBoxX + rightBoxW - 10,
        rightBoxY + 57,
        { align: 'right' }
      );

      doc.setFillColor(...BLUE);
      doc.rect(rightBoxX, rightBoxY + 62, rightBoxW, 18, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('DUE DATE', rightBoxX + 10, rightBoxY + 75);
      doc.setFont('helvetica', 'normal');
      doc.text(
        invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '-',
        rightBoxX + rightBoxW - 10,
        rightBoxY + 75,
        { align: 'right' }
      );

      y = companyInfoY + 45;

      const boxH = 110;
      const gap = 12;
      const boxW = (pageW - 2 * M - gap) / 2;

      const billX = M;
      const jobX = M + boxW + gap;
      const headerH = 18;

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
      doc.text(safeText(invoice.customers?.name), billX + 10, by);
      by += 12;

      const addr = safeText(invoice.customers?.address);
      if (addr) {
        const addrLines = doc.splitTextToSize(addr, boxW - 20);
        addrLines.forEach((line) => {
          doc.text(line, billX + 10, by);
          by += 12;
        });
      }

      const custEmail = safeText(invoice.customers?.email);
      const custPhone = safeText(invoice.customers?.phone);
      if (custEmail) doc.text(custEmail, billX + 10, y + boxH - 28);
      if (custPhone) doc.text(custPhone, billX + 10, y + boxH - 14);

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

      const tech = safeText(invoice.tech_name);
      doc.text(`Technician: ${tech || '-'}`, jobX + 10, y + headerH + 18);

      const workDate = invoice.work_completed_date ? new Date(invoice.work_completed_date).toLocaleDateString() : '';
      doc.text(`Work Completed: ${workDate || '-'}`, jobX + 10, y + headerH + 34);

      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text('[Work completed description]', jobX + 10, y + headerH + 55);
      doc.setTextColor(0, 0, 0);

      y += boxH + 14;

      const tableX = M;
      const tableW = pageW - 2 * M;

      const col = {
        qty: tableX + 10,
        desc: tableX + 55,
        material: tableX + tableW - 170,
        labor: tableX + tableW - 115,
        total: tableX + tableW - 55
      };

      doc.setFillColor(...BLUE);
      doc.rect(tableX, y, tableW, 18, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('QTY', col.qty, y + 13);
      doc.text('DESCRIPTION', col.desc, y + 13);
      doc.text('MATERIAL', col.material, y + 13, { align: 'right' });
      doc.text('LABOR', col.labor, y + 13, { align: 'right' });
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
        ensureSpace(50);

        const qty = 1;

        const material = Number(item.material_cost) || 0;
        const labor = Number(item.labor_cost) || 0;
        const total = Number(item.total_cost) || (material + labor);

        const descLines = doc.splitTextToSize(
          safeText(item.description),
          (col.material - 10) - col.desc
        );
        const rowH2 = Math.max(descLines.length * lineHeight, lineHeight) + 10;

        doc.rect(tableX, y - 10, tableW, rowH2);

        doc.text(String(qty), col.qty, y);

        descLines.forEach((line, i) => {
          doc.text(line, col.desc, y + i * lineHeight);
        });

        doc.text(fmtMoney(material), col.material, y, { align: 'right' });
        doc.text(fmtMoney(labor), col.labor, y, { align: 'right' });
        doc.text(fmtMoney(total), col.total, y, { align: 'right' });

        y += rowH2;
      });

      ensureSpace(160);

      const totalsW = 200;
      const totalsX = tableX + tableW - totalsW;
      const totalsY = y + 10;

      const totalBoxHeight = 88;
      doc.setDrawColor(180);
      doc.rect(totalsX, totalsY, totalsW, totalBoxHeight);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);

      doc.setFillColor(...BLUE);
      doc.rect(totalsX, totalsY, totalsW, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text('TOTAL', totalsX + 10, totalsY + 15);
      doc.text(fmtMoney(Number(invoice.total_amount) || 0), totalsX + totalsW - 10, totalsY + 15, { align: 'right' });

      doc.setTextColor(0, 0, 0);
      doc.setFillColor(...LIGHT_GRAY);
      doc.rect(totalsX, totalsY + 22, totalsW, 22, 'F');
      doc.text('PAID', totalsX + 10, totalsY + 37);
      doc.setFont('helvetica', 'normal');
      doc.text(fmtMoney(Number(invoice.amount_paid) || 0), totalsX + totalsW - 10, totalsY + 37, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.setFillColor(...BLUE);
      doc.rect(totalsX, totalsY + 44, totalsW, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text('BALANCE DUE', totalsX + 10, totalsY + 59);
      doc.text(fmtMoney(Number(invoice.amount_due) || 0), totalsX + totalsW - 10, totalsY + 59, { align: 'right' });

      doc.setTextColor(0, 0, 0);

      y = totalsY + totalBoxHeight + 20;

      if (payments && payments.length > 0) {
        ensureSpace(120);

        doc.setFillColor(...BLUE);
        doc.rect(M, y, tableW, 18, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('PAYMENT HISTORY', M + 10, y + 13);
        doc.setTextColor(0, 0, 0);

        y += 24;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('DATE', M + 10, y);
        doc.text('AMOUNT', M + 120, y);
        doc.text('METHOD', M + 200, y);
        doc.text('REFERENCE', M + 300, y);

        y += 6;
        doc.setDrawColor(200);
        doc.line(M, y, pageW - M, y);
        y += 12;

        doc.setFont('helvetica', 'normal');
        payments.forEach((payment) => {
          ensureSpace(30);

          doc.text(new Date(payment.payment_date).toLocaleDateString(), M + 10, y);
          doc.text(fmtMoney(Number(payment.amount)), M + 120, y);
          doc.text(safeText(payment.payment_method).toUpperCase(), M + 200, y);
          doc.text(safeText(payment.reference_number) || '-', M + 300, y);

          y += 16;
        });

        y += 10;
      }

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

      const scope = safeText(invoice.notes);
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

      ensureSpace(120);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);

      doc.text('Please reference this invoice number in all correspondence.', M, y);
      y += 12;
      doc.text(`Questions? ${COMPANY.phone} | ${COMPANY.email}`, M, y);
      y += 24;

      doc.setDrawColor(0);
      doc.line(M, y, M + 260, y);
      doc.text('Signature', M, y + 12);

      doc.line(pageW - M - 180, y, pageW - M, y);
      doc.text('Date', pageW - M - 180, y + 12);

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

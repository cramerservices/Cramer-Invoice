import React, { useState, useEffect } from 'react';
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
const PDF_BUCKET = 'service-docs'; 

async function fetchImageAsDataURL(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Logo fetch failed: ${res.status}`);
  const blob = await res.blob();

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function uploadPdfToStorage({
  fileName,
  pdfBlob
}: {
  fileName: string;
  pdfBlob: Blob;
}) {
  const storagePath = `crm/${Date.now()}-${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(storagePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage
    .from(PDF_BUCKET)
    .getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: publicUrlData?.publicUrl || null
  };
}

type InvoiceRow = {
  id: string;
  invoice_number: string;
  customer_id: string;
  estimate_id?: string | null;
  invoice_date: string;
  due_date: string | null;
  work_completed_date: string | null;
  tech_name: string | null;
  notes: string | null;
  status: string;
  total_amount: number | string;
  amount_paid: number | string;
  amount_due: number | string;
  customers?: {
    name?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

type InvoiceLineItem = {
  invoice_id: string;
  description: string;
  material_cost: number | string;
  labor_cost: number | string;
  total_cost: number | string;
  sort_order?: number;
};

type PaymentRow = {
  payment_date: string;
  amount: number | string;
  payment_method?: string | null;
  reference_number?: string | null;
};

function Invoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
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
      let newNumber = '';
      let isUnique = false;

      while (!isUnique) {
        const randomNum = Math.floor(Math.random() * 9000) + 1000;
        newNumber = `INV-${randomNum}`;

        const { data, error } = await supabase
          .from('crm_invoices')
          .select('invoice_number')
          .eq('invoice_number', newNumber)
          .limit(1);

        if (error) throw error;

        if (!data || data.length === 0) {
          isUnique = true;
        }
      }

      setFormData((prev) => ({ ...prev, invoiceNumber: newNumber }));
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

      if (invoicesRes.error) throw invoicesRes.error;
      if (customersRes.error) throw customersRes.error;

      setInvoices(invoicesRes.data || []);
      setCustomers(customersRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLineItemChange = (index: number, field: string, value: string) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', materialCost: '', laborCost: '' }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const calculateLineTotal = (item: { materialCost: string; laborCost: string }) => {
    return (parseFloat(item.materialCost) || 0) + (parseFloat(item.laborCost) || 0);
  };

  const calculateGrandTotal = () => {
    return lineItems.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  };

const syncInvoiceToServicesCompleted = async (
  invoiceId: string,
  pdfUrl: string | null = null
) => {
  const { data: invoiceRow, error: invoiceError } = await supabase
    .from('crm_invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (invoiceError) throw invoiceError;

  const invoice = invoiceRow as any;

  const { data: paymentRows, error: paymentsError } = await supabase
    .from('payments')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('payment_date', { ascending: true });

  if (paymentsError) throw paymentsError;

  const { data: existingRows, error: existingError } = await supabase
    .from('services_completed')
    .select('id, payload, pdf_path')
    .eq('invoice_id', invoice.id)
    .limit(1);

  if (existingError) throw existingError;

  const existing = existingRows?.[0] ?? null;
  const existingPayload = (existing?.payload ?? {}) as any;

  const finalPdfUrl =
    pdfUrl ||
    existingPayload?.pdf_url ||
    existing?.pdf_path ||
    null;

const payload = {
  kind: 'invoice',
  invoice_id: invoice.id,
  invoice_number: invoice.invoice_number,
  estimate_id: invoice.estimate_id || null,
  status: invoice.status,
  total_amount: Number(invoice.total_amount || 0),
  amount_paid: Number(invoice.amount_paid || 0),
  amount_due: Number(invoice.amount_due || 0),
  approved:
    typeof existingPayload?.approved === 'boolean'
      ? existingPayload.approved
      : null,
  payments: paymentRows || [],
  pdf_url: finalPdfUrl
};

  const summary = `Invoice ${invoice.invoice_number} ${invoice.status}. Balance due: $${Number(
    invoice.amount_due || 0
  ).toFixed(2)}`;

  const mirrorRow = {
  customer_id: invoice.customer_id,
  estimate_id: null,
  invoice_id: invoice.id,
  service_type: 'invoice',
  service_date: invoice.invoice_date,
  technician_name: invoice.tech_name,
  summary,
  pdf_path: finalPdfUrl,
  payload,
  completed_at: new Date().toISOString()
};

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from('services_completed')
      .update(mirrorRow)
      .eq('id', existing.id);

    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabase
      .from('services_completed')
      .insert(mirrorRow);

    if (insertError) throw insertError;
  }
};
  const generateAndUploadInvoicePdf = async (invoiceId: string, shouldDownload = false) => {
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

    const typedInvoice = invoice as InvoiceRow;
    const typedItems = (items || []) as InvoiceLineItem[];
    const typedPayments = (payments || []) as PaymentRow[];

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const M = 40;
    const BLUE: [number, number, number] = [30, 80, 160];
    const LIGHT_GRAY: [number, number, number] = [240, 240, 240];

    const fmtMoney = (n: number | string) => `$${(Number(n) || 0).toFixed(2)}`;
    const safeText = (val: unknown) => (val ? String(val) : '');

    let logoDataUrl: string | null = null;
    try {
      logoDataUrl = await fetchImageAsDataURL(LOGO_URL);
    } catch (e) {
      console.warn('Logo not loaded:', e);
    }

    let y = M;

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', M, y - 8, 180, 47);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(COMPANY.name, M, y + 20);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const companyInfoX = M;
    const companyInfoY = y + 50;
    doc.text(`Phone: ${COMPANY.phone}`, companyInfoX, companyInfoY);
    doc.text(`Email: ${COMPANY.email}`, companyInfoX, companyInfoY + 10);
    doc.text(`Website: ${COMPANY.website}`, companyInfoX, companyInfoY + 20);

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
    doc.text('INVOICE #', rightBoxX + 10, rightBoxY + 39);
    doc.text(safeText(typedInvoice.invoice_number), rightBoxX + rightBoxW - 10, rightBoxY + 39, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    doc.setFillColor(...LIGHT_GRAY);
    doc.rect(rightBoxX, rightBoxY + 44, rightBoxW, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('DATE', rightBoxX + 10, rightBoxY + 57);
    doc.setFont('helvetica', 'normal');
    doc.text(
      new Date(typedInvoice.invoice_date).toLocaleDateString(),
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
      typedInvoice.due_date ? new Date(typedInvoice.due_date).toLocaleDateString() : '-',
      rightBoxX + rightBoxW - 10,
      rightBoxY + 75,
      { align: 'right' }
    );

    y = companyInfoY + 35;

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
    doc.text(safeText(typedInvoice.customers?.name), billX + 10, by);
    by += 12;

    const addr = safeText(typedInvoice.customers?.address);
    if (addr) {
      const addrLines = doc.splitTextToSize(addr, boxW - 20);
      addrLines.forEach((line: string) => {
        doc.text(line, billX + 10, by);
        by += 12;
      });
    }

    const custEmail = safeText(typedInvoice.customers?.email);
    const custPhone = safeText(typedInvoice.customers?.phone);
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

    const tech = safeText(typedInvoice.tech_name);
    doc.text(`Technician: ${tech || '-'}`, jobX + 10, y + headerH + 18);

    const workDate = typedInvoice.work_completed_date
      ? new Date(typedInvoice.work_completed_date).toLocaleDateString()
      : '';
    doc.text(`Work Completed: ${workDate || '-'}`, jobX + 10, y + headerH + 34);

    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('[Work completed description]', jobX + 10, y + headerH + 55);
    doc.setTextColor(0, 0, 0);

    y += boxH + 10;

    const tableX = M;
    const tableW = pageW - 2 * M;

    const col = {
      qty: tableX + 10,
      desc: tableX + 55,
      material: tableX + tableW - 180,
      labor: tableX + tableW - 120,
      total: tableX + tableW - 55
    };

    doc.setFillColor(...BLUE);
    doc.rect(tableX, y, tableW, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('QTY', col.qty, y + 11);
    doc.text('DESCRIPTION', col.desc, y + 11);
    doc.text('MATERIAL', col.material, y + 11, { align: 'right' });
    doc.text('LABOR', col.labor, y + 11, { align: 'right' });
    doc.text('TOTAL', col.total, y + 11, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    y += 22;

    doc.setDrawColor(200);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    const lineHeight = 12;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageH - 140) {
        doc.addPage();
        y = M;
      }
    };

    typedItems.forEach((item) => {
      ensureSpace(50);

      const qty = 1;
      const material = Number(item.material_cost) || 0;
      const labor = Number(item.labor_cost) || 0;
      const total = Number(item.total_cost) || material + labor;

      const descLines = doc.splitTextToSize(
        safeText(item.description),
        col.material - 15 - col.desc
      );
      const rowH2 = Math.max(descLines.length * lineHeight, lineHeight) + 10;

      doc.rect(tableX, y - 10, tableW, rowH2);

      doc.text(String(qty), col.qty, y);

      descLines.forEach((line: string, i: number) => {
        doc.text(line, col.desc, y + i * lineHeight);
      });

      doc.text(fmtMoney(material), col.material, y, { align: 'right' });
      doc.text(fmtMoney(labor), col.labor, y, { align: 'right' });
      doc.text(fmtMoney(total), col.total, y, { align: 'right' });

      y += rowH2;
    });

    ensureSpace(140);

    const totalsW = 200;
    const totalsX = tableX + tableW - totalsW;
    const totalsY = y + 8;

    const totalBoxHeight = 72;
    doc.setDrawColor(180);
    doc.rect(totalsX, totalsY, totalsW, totalBoxHeight);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);

    doc.setFillColor(...BLUE);
    doc.rect(totalsX, totalsY, totalsW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('TOTAL', totalsX + 10, totalsY + 12);
    doc.text(fmtMoney(Number(typedInvoice.total_amount) || 0), totalsX + totalsW - 10, totalsY + 12, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    doc.setFillColor(...LIGHT_GRAY);
    doc.rect(totalsX, totalsY + 18, totalsW, 18, 'F');
    doc.text('PAID', totalsX + 10, totalsY + 30);
    doc.setFont('helvetica', 'normal');
    doc.text(fmtMoney(Number(typedInvoice.amount_paid) || 0), totalsX + totalsW - 10, totalsY + 30, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFillColor(...BLUE);
    doc.rect(totalsX, totalsY + 36, totalsW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('BALANCE DUE', totalsX + 10, totalsY + 48);
    doc.text(fmtMoney(Number(typedInvoice.amount_due) || 0), totalsX + totalsW - 10, totalsY + 48, { align: 'right' });

    doc.setTextColor(0, 0, 0);

    y = totalsY + totalBoxHeight + 12;

    if (typedPayments && typedPayments.length > 0) {
      ensureSpace(100);

      doc.setFillColor(...BLUE);
      doc.rect(M, y, tableW, 14, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('PAYMENT HISTORY', M + 10, y + 10);
      doc.setTextColor(0, 0, 0);

      y += 22;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('DATE', M + 10, y);
      doc.text('AMOUNT', M + 120, y);
      doc.text('METHOD', M + 200, y);
      doc.text('REFERENCE', M + 300, y);

      y += 5;
      doc.setDrawColor(200);
      doc.line(M, y, pageW - M, y);
      y += 10;

      doc.setFont('helvetica', 'normal');
      typedPayments.forEach((payment) => {
        ensureSpace(25);

        doc.text(new Date(payment.payment_date).toLocaleDateString(), M + 10, y);
        doc.text(fmtMoney(Number(payment.amount)), M + 120, y);
        doc.text(safeText(payment.payment_method).toUpperCase(), M + 200, y);
        doc.text(safeText(payment.reference_number) || '-', M + 300, y);

        y += 13;
      });

      y += 8;
    }

    ensureSpace(100);

    doc.setFillColor(...BLUE);
    doc.rect(M, y, tableW, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('SCOPE OF WORK', M + 10, y + 10);
    doc.setTextColor(0, 0, 0);

    y += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    const scope = safeText(typedInvoice.notes);
    const scopeLines = doc.splitTextToSize(scope || '—', tableW - 20);
    const scopeBoxH = Math.max(60, scopeLines.length * 10 + 16);

    doc.setDrawColor(180);
    doc.rect(M, y - 10, tableW, scopeBoxH);

    let sy = y + 8;
    scopeLines.forEach((line: string) => {
      doc.text(line, M + 10, sy);
      sy += 10;
    });

    y = y - 10 + scopeBoxH + 15;

    ensureSpace(80);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);

    doc.text('Please reference this invoice number in all correspondence.', M, y);
    y += 10;
    doc.text(`Questions? ${COMPANY.phone} | ${COMPANY.email}`, M, y);
    y += 24;

    doc.setDrawColor(0);
    doc.line(M, y, M + 260, y);
    doc.text('Signature', M, y + 12);

    doc.line(pageW - M - 180, y, pageW - M, y);
    doc.text('Date', pageW - M - 180, y + 12);

    const fileName = `invoice-${typedInvoice.invoice_number}.pdf`;
    const pdfBlob = doc.output('blob');

    const { publicUrl } = await uploadPdfToStorage({
      fileName,
      pdfBlob
    });

    await syncInvoiceToServicesCompleted(typedInvoice.id, publicUrl);

    if (shouldDownload) {
      doc.save(fileName);
    }

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

      await syncInvoiceToServicesCompleted(invoice.id, null);
      await generateAndUploadInvoicePdf(invoice.id, false);

      setShowForm(false);
      resetForm();
      await fetchData();
      alert('Invoice created successfully!');
    } catch (error: any) {
      console.error('Error saving invoice:', error);
      alert(`Failed to create invoice: ${error?.message || 'Unknown error'}`);
    }
  };

const handleDelete = async (id: string) => {
  if (!window.confirm('Are you sure you want to delete this invoice?')) return;

  try {
    const { error: mirrorDeleteError } = await supabase
      .from('services_completed')
      .delete()
      .eq('invoice_id', id);

    if (mirrorDeleteError) throw mirrorDeleteError;

    const { error } = await supabase
      .from('crm_invoices')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await fetchData();
  } catch (error) {
    console.error('Error deleting invoice:', error);
    alert('Failed to delete invoice');
  }
};
  const handleStatusChange = async (id: string, newStatus: string) => {
    try { 
      const { error } = await supabase
        .from('crm_invoices')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      await syncInvoiceToServicesCompleted(id, null);
      await fetchData();
    } catch (error: any) {
      console.error('Error updating status:', error);
      alert(`Failed to update status: ${error?.message || 'Unknown error'}`);
    }
  };

  const downloadPDF = async (invoiceId: string) => {
    try {
      setPdfBusyId(invoiceId);
      await generateAndUploadInvoicePdf(invoiceId, true);
      await fetchData();
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      alert(`Failed to generate PDF: ${error?.message || 'Unknown error'}`);
    } finally {
      setPdfBusyId(null);
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
                  {customers.map((customer) => (
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
                <div
                  key={index}
                  style={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e5e5',
                    borderRadius: '6px',
                    padding: '16px',
                    marginBottom: '12px'
                  }}
                >
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
                      rows={2}
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
                      <div
                        style={{
                          padding: '10px 12px',
                          backgroundColor: '#ecf0f1',
                          borderRadius: '4px',
                          fontWeight: '600'
                        }}
                      >
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
                rows={3}
                placeholder="Additional notes or terms..."
              />
            </div>

            <div
              style={{
                marginTop: '24px',
                padding: '16px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <strong style={{ fontSize: '18px' }}>Grand Total:</strong>
              <span style={{ fontSize: '24px', fontWeight: '700', color: '#27ae60' }}>
                ${calculateGrandTotal().toFixed(2)}
              </span>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
              >
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
                        disabled={pdfBusyId === invoice.id}
                      >
                        {pdfBusyId === invoice.id ? 'Working...' : 'PDF'}
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

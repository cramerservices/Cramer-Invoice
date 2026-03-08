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

type EstimateRow = {
  id: string;
  estimate_number: string;
  customer_id: string;
  estimate_date: string;
  expiry_date: string | null;
  tech_name: string | null;
  notes: string | null;
  status: string;
  total_amount: number | string;
  customers?: {
    name?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

type EstimateLineItem = {
  estimate_id: string;
  description: string;
  material_cost: number | string;
  labor_cost: number | string;
  total_cost: number | string;
  sort_order?: number;
};

function Estimates() {
  const [estimates, setEstimates] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
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
      let newNumber = '';
      let isUnique = false;

      while (!isUnique) {
        const randomNum = Math.floor(Math.random() * 900000) + 100000;
        newNumber = `EST-${randomNum}`;

        const { data, error } = await supabase
          .from('estimates')
          .select('id')
          .eq('estimate_number', newNumber)
          .limit(1);

        if (error) throw error;

        if (!data || data.length === 0) {
          isUnique = true;
        }
      }

      setFormData((prev) => ({ ...prev, estimateNumber: newNumber }));
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

      if (estimatesRes.error) throw estimatesRes.error;
      if (customersRes.error) throw customersRes.error;

      setEstimates(estimatesRes.data || []);
      setCustomers(customersRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Failed to load estimates');
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

  const addDays = (dateString: string, days: number) => {
    const date = new Date(dateString);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  };

  const generateUniqueInvoiceNumber = async () => {
    let isUnique = false;
    let newNumber = '';

    while (!isUnique) {
      const randomNum = Math.floor(Math.random() * 900000) + 100000;
      newNumber = `INV-${randomNum}`;

      const { data, error } = await supabase
        .from('crm_invoices')
        .select('id')
        .eq('invoice_number', newNumber)
        .limit(1);

      if (error) throw error;

      if (!data || data.length === 0) {
        isUnique = true;
      }
    }

    return newNumber;
  };

  const syncEstimateToServicesCompleted = async (
    estimateId: string,
    pdfUrl: string | null = null
  ) => {
    const { data: estimateRow, error: estimateError } = await supabase
      .from('estimates')
      .select('*')
      .eq('id', estimateId)
      .single();

    if (estimateError) throw estimateError;

    const estimate = estimateRow as any;

    const payload = {
      kind: 'estimate',
      estimate_id: estimate.id,
      estimate_number: estimate.estimate_number,
      status: estimate.status,
      total_amount: Number(estimate.total_amount || 0),
      approved: estimate.status === 'approved',
      pdf_url: pdfUrl
    };

    const summary = `Estimate ${estimate.estimate_number} created for $${Number(
      estimate.total_amount || 0
    ).toFixed(2)}`;

    const { data: existingRows, error: existingError } = await supabase
      .from('services_completed')
      .select('id')
      .contains('payload', { kind: 'estimate', estimate_id: estimate.id });

    if (existingError) throw existingError;

    if (existingRows && existingRows.length > 0) {
      const { error: updateError } = await supabase
        .from('services_completed')
        .update({
          customer_id: estimate.customer_id,
          service_type: 'estimate',
          service_date: estimate.estimate_date,
          technician_name: estimate.tech_name,
          summary,
          pdf_path: pdfUrl,
          payload,
          completed_at: new Date().toISOString()
        })
        .eq('id', existingRows[0].id);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('services_completed')
        .insert({
          customer_id: estimate.customer_id,
          service_type: 'estimate',
          service_date: estimate.estimate_date,
          technician_name: estimate.tech_name,
          summary,
          pdf_path: pdfUrl,
          payload,
          completed_at: new Date().toISOString()
        });

      if (insertError) throw insertError;
    }
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

    const payload = {
      kind: 'invoice',
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      estimate_id: invoice.estimate_id || null,
      status: invoice.status,
      total_amount: Number(invoice.total_amount || 0),
      amount_paid: Number(invoice.amount_paid || 0),
      amount_due: Number(invoice.amount_due || 0),
      approved: null,
      payments: [],
      pdf_url: pdfUrl
    };

    const summary = `Invoice ${invoice.invoice_number} created. Amount due: $${Number(
      invoice.total_amount || 0
    ).toFixed(2)}`;

    const { data: existingRows, error: existingError } = await supabase
      .from('services_completed')
      .select('id')
      .contains('payload', { kind: 'invoice', invoice_id: invoice.id });

    if (existingError) throw existingError;

    if (existingRows && existingRows.length > 0) {
      const { error: updateError } = await supabase
        .from('services_completed')
        .update({
          customer_id: invoice.customer_id,
          service_type: 'invoice',
          service_date: invoice.invoice_date,
          technician_name: invoice.tech_name,
          summary,
          pdf_path: pdfUrl,
          payload,
          completed_at: new Date().toISOString()
        })
        .eq('id', existingRows[0].id);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('services_completed')
        .insert({
          customer_id: invoice.customer_id,
          service_type: 'invoice',
          service_date: invoice.invoice_date,
          technician_name: invoice.tech_name,
          summary,
          pdf_path: pdfUrl,
          payload,
          completed_at: new Date().toISOString()
        });

      if (insertError) throw insertError;
    }
  };

  const generateAndUploadEstimatePdf = async (estimateId: string, shouldDownload = false) => {
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

    const typedEstimate = estimate as EstimateRow;
    const typedItems = (items || []) as EstimateLineItem[];

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
    doc.text('ESTIMATE', rightBoxX + rightBoxW / 2, rightBoxY + 18, { align: 'center' });

    doc.setFillColor(...BLUE);
    doc.rect(rightBoxX, rightBoxY + 26, rightBoxW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('ESTIMATE #', rightBoxX + 10, rightBoxY + 39);
    doc.text(safeText(typedEstimate.estimate_number), rightBoxX + rightBoxW - 10, rightBoxY + 39, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    doc.setFillColor(...LIGHT_GRAY);
    doc.rect(rightBoxX, rightBoxY + 44, rightBoxW, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('DATE', rightBoxX + 10, rightBoxY + 57);
    doc.setFont('helvetica', 'normal');
    doc.text(
      new Date(typedEstimate.estimate_date).toLocaleDateString(),
      rightBoxX + rightBoxW - 10,
      rightBoxY + 57,
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
    doc.text(safeText(typedEstimate.customers?.name), billX + 10, by);
    by += 12;

    const addr = safeText(typedEstimate.customers?.address);
    if (addr) {
      const addrLines = doc.splitTextToSize(addr, boxW - 20);
      addrLines.forEach((line: string) => {
        doc.text(line, billX + 10, by);
        by += 12;
      });
    }

    const custEmail = safeText(typedEstimate.customers?.email);
    const custPhone = safeText(typedEstimate.customers?.phone);
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

    const tech = safeText(typedEstimate.tech_name);
    doc.text(`Technician: ${tech || '-'}`, jobX + 10, y + headerH + 18);

    const expires = typedEstimate.expiry_date
      ? new Date(typedEstimate.expiry_date).toLocaleDateString()
      : '';
    doc.text(`Expires: ${expires || '-'}`, jobX + 10, y + headerH + 34);

    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('[Enter general description of work]', jobX + 10, y + headerH + 55);
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
        col.material - 10 - col.desc
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

    ensureSpace(120);

    const totalsW = 200;
    const totalsX = tableX + tableW - totalsW;
    const totalsY = y + 10;

    doc.setDrawColor(180);
    doc.rect(totalsX, totalsY, totalsW, 50);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);

    doc.setFillColor(...BLUE);
    doc.rect(totalsX, totalsY, totalsW, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('TOTAL', totalsX + 10, totalsY + 15);
    doc.text(fmtMoney(Number(typedEstimate.total_amount) || 0), totalsX + totalsW - 10, totalsY + 15, { align: 'right' });

    doc.setTextColor(0, 0, 0);

    y = totalsY + 70;

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

    const scope = safeText(typedEstimate.notes);
    const scopeLines = doc.splitTextToSize(scope || '—', tableW - 20);
    const scopeBoxH = Math.max(70, scopeLines.length * 12 + 20);

    doc.setDrawColor(180);
    doc.rect(M, y - 10, tableW, scopeBoxH);

    let sy = y + 10;
    scopeLines.forEach((line: string) => {
      doc.text(line, M + 10, sy);
      sy += 12;
    });

    y = y - 10 + scopeBoxH + 20;

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

    const fileName = `estimate-${typedEstimate.estimate_number}.pdf`;
    const pdfBlob = doc.output('blob');

    const { publicUrl } = await uploadPdfToStorage({
      fileName,
      pdfBlob
    });

    await syncEstimateToServicesCompleted(typedEstimate.id, publicUrl);

    if (shouldDownload) {
      doc.save(fileName);
    }

    return publicUrl;
  };

  const generateAndUploadInvoicePdfFromEstimate = async (invoiceId: string, shouldDownload = false) => {
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
    doc.text(safeText((invoice as any).invoice_number), rightBoxX + rightBoxW - 10, rightBoxY + 39, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    doc.setFillColor(...LIGHT_GRAY);
    doc.rect(rightBoxX, rightBoxY + 44, rightBoxW, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('DATE', rightBoxX + 10, rightBoxY + 57);
    doc.setFont('helvetica', 'normal');
    doc.text(
      new Date((invoice as any).invoice_date).toLocaleDateString(),
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
      (invoice as any).due_date ? new Date((invoice as any).due_date).toLocaleDateString() : '-',
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
    doc.text(safeText((invoice as any).customers?.name), billX + 10, by);
    by += 12;

    const addr = safeText((invoice as any).customers?.address);
    if (addr) {
      const addrLines = doc.splitTextToSize(addr, boxW - 20);
      addrLines.forEach((line: string) => {
        doc.text(line, billX + 10, by);
        by += 12;
      });
    }

    const custEmail = safeText((invoice as any).customers?.email);
    const custPhone = safeText((invoice as any).customers?.phone);
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

    const tech = safeText((invoice as any).tech_name);
    doc.text(`Technician: ${tech || '-'}`, jobX + 10, y + headerH + 18);

    const workDate = (invoice as any).work_completed_date
      ? new Date((invoice as any).work_completed_date).toLocaleDateString()
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

    (items || []).forEach((item: any) => {
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
    doc.text(fmtMoney(Number((invoice as any).total_amount) || 0), totalsX + totalsW - 10, totalsY + 12, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    doc.setFillColor(...LIGHT_GRAY);
    doc.rect(totalsX, totalsY + 18, totalsW, 18, 'F');
    doc.text('PAID', totalsX + 10, totalsY + 30);
    doc.setFont('helvetica', 'normal');
    doc.text(fmtMoney(Number((invoice as any).amount_paid) || 0), totalsX + totalsW - 10, totalsY + 30, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFillColor(...BLUE);
    doc.rect(totalsX, totalsY + 36, totalsW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('BALANCE DUE', totalsX + 10, totalsY + 48);
    doc.text(fmtMoney(Number((invoice as any).amount_due) || 0), totalsX + totalsW - 10, totalsY + 48, { align: 'right' });

    doc.setTextColor(0, 0, 0);

    y = totalsY + totalBoxHeight + 12;

    if (payments && payments.length > 0) {
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
      (payments || []).forEach((payment: any) => {
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

    const scope = safeText((invoice as any).notes);
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

    const fileName = `invoice-${(invoice as any).invoice_number}.pdf`;
    const pdfBlob = doc.output('blob');

    const { publicUrl } = await uploadPdfToStorage({
      fileName,
      pdfBlob
    });

    await syncInvoiceToServicesCompleted((invoice as any).id, publicUrl);

    if (shouldDownload) {
      doc.save(fileName);
    }

    return publicUrl;
  };

  const createInvoiceFromEstimate = async (estimateId: string) => {
    const { data: existingInvoice, error: existingInvoiceError } = await supabase
      .from('crm_invoices')
      .select('id, invoice_number')
      .eq('estimate_id', estimateId)
      .maybeSingle();

    if (existingInvoiceError) throw existingInvoiceError;

    if (existingInvoice) {
      return existingInvoice;
    }

    const { data: estimate, error: estimateError } = await supabase
      .from('estimates')
      .select('*')
      .eq('id', estimateId)
      .single();

    if (estimateError) throw estimateError;

    const { data: estimateItems, error: estimateItemsError } = await supabase
      .from('estimate_line_items')
      .select('*')
      .eq('estimate_id', estimateId)
      .order('sort_order', { ascending: true });

    if (estimateItemsError) throw estimateItemsError;

    const invoiceNumber = await generateUniqueInvoiceNumber();

    const today = new Date().toISOString().split('T')[0];
    const dueDate = addDays(today, 7);

    const totalAmount = Number((estimate as any).total_amount || 0);

    const invoiceInsert = {
      invoice_number: invoiceNumber,
      customer_id: (estimate as any).customer_id,
      estimate_id: (estimate as any).id,
      invoice_date: today,
      due_date: dueDate,
      work_completed_date: today,
      tech_name: (estimate as any).tech_name || '',
      notes: (estimate as any).notes || '',
      status: 'draft',
      total_amount: totalAmount,
      amount_paid: 0,
      amount_due: totalAmount
    };

    const { data: invoice, error: invoiceError } = await supabase
      .from('crm_invoices')
      .insert(invoiceInsert)
      .select()
      .single();

    if (invoiceError) throw invoiceError;

    if (estimateItems && estimateItems.length > 0) {
      const invoiceLineItems = estimateItems.map((item: any, index: number) => ({
        invoice_id: (invoice as any).id,
        description: item.description || '',
        material_cost: Number(item.material_cost || 0),
        labor_cost: Number(item.labor_cost || 0),
        total_cost: Number(item.total_cost || 0),
        sort_order: item.sort_order ?? index
      }));

      const { error: invoiceLineItemsError } = await supabase
        .from('crm_invoice_line_items')
        .insert(invoiceLineItems);

      if (invoiceLineItemsError) throw invoiceLineItemsError;
    }

    await syncInvoiceToServicesCompleted((invoice as any).id, null);
    await generateAndUploadInvoicePdfFromEstimate((invoice as any).id, false);

    return invoice;
  };

  const handleSubmit = async (e: React.FormEvent) => {
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
        estimate_id: (estimate as any).id,
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

      await syncEstimateToServicesCompleted((estimate as any).id, null);
      await generateAndUploadEstimatePdf((estimate as any).id, false);

      if ((estimate as any).status === 'approved') {
        await createInvoiceFromEstimate((estimate as any).id);
      }

      setShowForm(false);
      resetForm();
      await fetchData();
      alert('Estimate created successfully!');
    } catch (error: any) {
      console.error('Error saving estimate:', error);
      alert(`Failed to create estimate: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this estimate?')) return;

    try {
      const { error } = await supabase
        .from('estimates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchData();
    } catch (error) {
      console.error('Error deleting estimate:', error);
      alert('Failed to delete estimate');
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { data: currentEstimate, error: currentEstimateError } = await supabase
        .from('estimates')
        .select('*')
        .eq('id', id)
        .single();

      if (currentEstimateError) throw currentEstimateError;

      const oldStatus = (currentEstimate as any).status;

      const { error: updateError } = await supabase
        .from('estimates')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (updateError) throw updateError;

      await syncEstimateToServicesCompleted(id, null);

      if (newStatus === 'approved' && oldStatus !== 'approved') {
        await createInvoiceFromEstimate(id);
      }

      await fetchData();
    } catch (error: any) {
      console.error('Error updating status:', error);
      alert(`Failed to update status: ${error?.message || 'Unknown error'}`);
    }
  };

  const downloadPDF = async (estimateId: string) => {
    try {
      setPdfBusyId(estimateId);
      await generateAndUploadEstimatePdf(estimateId, true);
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

              <button
                type="button"
                onClick={addLineItem}
                className="btn-primary"
                style={{ width: '100%' }}
              >
                + Add Line Item
              </button>
            </div>

            <div className="form-group" style={{ marginTop: '24px' }}>
              <label>Scope of Work</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows={3}
                placeholder="Enter scope of work..."
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
                        disabled={pdfBusyId === estimate.id}
                      >
                        {pdfBusyId === estimate.id ? 'Working...' : 'PDF'}
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

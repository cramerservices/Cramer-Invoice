import { useRef } from 'react';
import { jsPDF } from 'jspdf';
import './InvoicePreview.css';

function InvoicePreview({ invoiceData, onBack }) {
  const printRef = useRef();

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return `$${parseFloat(amount).toFixed(2)}`;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    let yPosition = 20;

    doc.setFontSize(24);
    doc.setFont(undefined, 'bold');
    doc.text('INVOICE', pageWidth / 2, yPosition, { align: 'center' });

    yPosition += 15;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');

    doc.text(`Invoice #: ${invoiceData.invoiceNumber}`, 20, yPosition);
    yPosition += 6;
    doc.text(`Invoice Date: ${formatDate(invoiceData.invoiceDate)}`, 20, yPosition);
    yPosition += 6;
    doc.text(`Work Completed: ${formatDate(invoiceData.workCompletedDate)}`, 20, yPosition);

    yPosition += 15;
    doc.setFont(undefined, 'bold');
    doc.text('BILL TO:', 20, yPosition);
    yPosition += 6;
    doc.setFont(undefined, 'normal');
    doc.text(invoiceData.customerName, 20, yPosition);
    yPosition += 6;

    const addressLines = doc.splitTextToSize(invoiceData.customerAddress, 80);
    addressLines.forEach(line => {
      doc.text(line, 20, yPosition);
      yPosition += 6;
    });

    yPosition += 10;
    doc.setFont(undefined, 'bold');
    doc.text('TECHNICIAN:', 20, yPosition);
    yPosition += 6;
    doc.setFont(undefined, 'normal');
    doc.text(invoiceData.techName, 20, yPosition);

    yPosition += 15;
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('LINE ITEMS', 20, yPosition);
    yPosition += 8;

    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('Description', 20, yPosition);
    doc.text('Material', 120, yPosition);
    doc.text('Labor', 145, yPosition);
    doc.text('Total', 170, yPosition);
    yPosition += 5;

    doc.line(20, yPosition, pageWidth - 20, yPosition);
    yPosition += 6;

    doc.setFont(undefined, 'normal');
    invoiceData.lineItems.forEach((item, index) => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }

      const descLines = doc.splitTextToSize(item.description, 95);
      const lineHeight = descLines.length * 5;

      descLines.forEach((line, i) => {
        doc.text(line, 20, yPosition + (i * 5));
      });

      doc.text(formatCurrency(item.material_cost), 120, yPosition);
      doc.text(formatCurrency(item.labor_cost), 145, yPosition);
      doc.text(formatCurrency(item.total_cost), 170, yPosition);

      yPosition += Math.max(lineHeight, 6) + 4;
    });

    yPosition += 5;
    doc.line(20, yPosition, pageWidth - 20, yPosition);
    yPosition += 8;

    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('TOTAL:', 145, yPosition);
    doc.text(formatCurrency(invoiceData.totalAmount), 170, yPosition);

    if (invoiceData.notes) {
      yPosition += 15;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('NOTES:', 20, yPosition);
      yPosition += 6;
      doc.setFont(undefined, 'normal');
      const notesLines = doc.splitTextToSize(invoiceData.notes, pageWidth - 40);
      notesLines.forEach(line => {
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 20;
        }
        doc.text(line, 20, yPosition);
        yPosition += 5;
      });
    }

    doc.save(`invoice-${invoiceData.invoiceNumber}.pdf`);
  };

  return (
    <div className="invoice-preview-container">
      <div className="preview-actions no-print">
        <button onClick={onBack} className="btn-back">
          ← Back to Form
        </button>
        <div className="action-buttons">
          <button onClick={handlePrint} className="btn-print">
            Print Invoice
          </button>
          <button onClick={handleDownloadPDF} className="btn-pdf">
            Download PDF
          </button>
        </div>
      </div>

      <div className="invoice-preview" ref={printRef}>
        <div className="invoice-header">
          <h1>INVOICE</h1>
          <div className="invoice-meta">
            <div className="meta-item">
              <span className="meta-label">Invoice #:</span>
              <span className="meta-value">{invoiceData.invoiceNumber}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Invoice Date:</span>
              <span className="meta-value">{formatDate(invoiceData.invoiceDate)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Work Completed:</span>
              <span className="meta-value">{formatDate(invoiceData.workCompletedDate)}</span>
            </div>
          </div>
        </div>

        <div className="invoice-parties">
          <div className="party-section">
            <h3>BILL TO</h3>
            <div className="party-info">
              <strong>{invoiceData.customerName}</strong>
              <p>{invoiceData.customerAddress}</p>
            </div>
          </div>
          <div className="party-section">
            <h3>TECHNICIAN</h3>
            <div className="party-info">
              <strong>{invoiceData.techName}</strong>
            </div>
          </div>
        </div>

        <div className="invoice-items">
          <h3>LINE ITEMS</h3>
          <table className="items-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Material Cost</th>
                <th>Labor Cost</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {invoiceData.lineItems.map((item, index) => (
                <tr key={index}>
                  <td className="description-cell">{item.description}</td>
                  <td className="cost-cell">{formatCurrency(item.material_cost)}</td>
                  <td className="cost-cell">{formatCurrency(item.labor_cost)}</td>
                  <td className="total-cell">{formatCurrency(item.total_cost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan="3" className="total-label">TOTAL</td>
                <td className="grand-total">{formatCurrency(invoiceData.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {invoiceData.notes && (
          <div className="invoice-notes">
            <h3>NOTES</h3>
            <p>{invoiceData.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default InvoicePreview;

import { useState } from 'react';
import InvoiceForm from './components/InvoiceForm';
import InvoicePreview from './components/InvoicePreview';
import './App.css';

function App() {
  const [invoiceData, setInvoiceData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleCreateInvoice = (data) => {
    setInvoiceData(data);
    setShowPreview(true);
  };

  const handleBackToForm = () => {
    setShowPreview(false);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Invoice Generator</h1>
      </header>
      <main className="app-main">
        {!showPreview ? (
          <InvoiceForm onSubmit={handleCreateInvoice} />
        ) : (
          <InvoicePreview
            invoiceData={invoiceData}
            onBack={handleBackToForm}
          />
        )}
      </main>
    </div>
  );
}

export default App;

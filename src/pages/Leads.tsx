import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import './Customers.css';

function Leads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const { data, error } = await supabase
        .from('crm_leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error) {
      console.error('Error fetching leads:', error);
      alert(`Failed to load leads: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const getPaymentStatus = (lead) => {
    const value = String(lead.payment_status || '').toLowerCase();

    if (value === 'paid') return 'paid';
    if (value === 'failed') return 'failed';
    if (value === 'refunded') return 'refunded';
    if (value === 'unpaid') return 'unpaid';

    // Old leads created before payment tracking columns were added.
    return 'not_started';
  };

  const getCheckoutStatus = (lead) => {
    const value = String(lead.checkout_status || '').toLowerCase();

    if (value === 'paid') return 'paid';
    if (value === 'checkout_started') return 'checkout_started';
    if (value === 'cancelled') return 'cancelled';
    if (value === 'failed') return 'failed';
    if (value === 'not_started') return 'not_started';

    return 'not_started';
  };

  const formatStatusLabel = (value) => {
    return String(value || 'not_started')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  };

  const getBadgeStyle = (type, value) => {
    const normalized = String(value || '').toLowerCase();

    const base = {
      display: 'inline-block',
      padding: '0.25rem 0.55rem',
      borderRadius: '999px',
      fontSize: '0.78rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
      border: '1px solid transparent'
    };

    if (normalized === 'paid') {
      return {
        ...base,
        background: '#d1e7dd',
        color: '#0f5132',
        borderColor: '#badbcc'
      };
    }

    if (normalized === 'unpaid' || normalized === 'checkout_started') {
      return {
        ...base,
        background: '#fff3cd',
        color: '#664d03',
        borderColor: '#ffecb5'
      };
    }

    if (normalized === 'failed' || normalized === 'cancelled' || normalized === 'rejected') {
      return {
        ...base,
        background: '#f8d7da',
        color: '#842029',
        borderColor: '#f5c2c7'
      };
    }

    if (type === 'leadStatus' && normalized === 'accepted') {
      return {
        ...base,
        background: '#d1e7dd',
        color: '#0f5132',
        borderColor: '#badbcc'
      };
    }

    return {
      ...base,
      background: '#e2e3e5',
      color: '#41464b',
      borderColor: '#d3d6d8'
    };
  };

  const getPaymentSummary = (lead) => {
    const paymentStatus = getPaymentStatus(lead);
    const checkoutStatus = getCheckoutStatus(lead);

    if (paymentStatus === 'paid') {
      return 'Paid';
    }

    if (checkoutStatus === 'checkout_started') {
      return 'Checkout Started';
    }

    if (checkoutStatus === 'cancelled') {
      return 'Checkout Cancelled';
    }

    if (checkoutStatus === 'failed' || paymentStatus === 'failed') {
      return 'Payment Failed';
    }

    return 'Unpaid';
  };

  const handleAccept = async (lead) => {
    if (!window.confirm(`Accept ${lead.full_name} and create a customer?`)) return;

    try {
      setProcessingId(lead.id);

      const { data, error } = await supabase.rpc('accept_crm_lead', {
        p_lead_id: lead.id
      });

      if (error) throw error;

      console.log('Lead accepted, customer created:', data);
      await fetchLeads();
    } catch (error) {
      console.error('Error accepting lead:', error);
      alert(`Failed to accept lead: ${error.message || 'Unknown error'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (lead) => {
    if (!window.confirm(`Reject ${lead.full_name}?`)) return;

    try {
      setProcessingId(lead.id);

      const { error } = await supabase
        .from('crm_leads')
        .update({
          status: 'rejected',
          rejected_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.id);

      if (error) throw error;

      await fetchLeads();
    } catch (error) {
      console.error('Error rejecting lead:', error);
      alert(`Failed to reject lead: ${error.message || 'Unknown error'}`);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return <div className="loading">Loading leads...</div>;
  }

  const pendingLeads = leads.filter((lead) => lead.status === 'pending');
  const historyLeads = leads.filter((lead) => lead.status !== 'pending');

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Leads</h2>
      </div>

      <div className="table-container" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Pending Leads</h3>

        {pendingLeads.length === 0 ? (
          <div className="empty-state">
            <p>No pending leads right now.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Payment</th>
                <th>Checkout</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Service</th>
                <th>Details</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingLeads.map((lead) => {
                const paymentStatus = getPaymentStatus(lead);
                const checkoutStatus = getCheckoutStatus(lead);

                return (
                  <tr key={lead.id}>
                    <td>
                      <strong>{lead.full_name}</strong>
                      {lead.source && (
                        <div style={{ color: '#6c757d', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                          {lead.source}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={getBadgeStyle('payment', paymentStatus)}>
                        {getPaymentSummary(lead)}
                      </span>
                      {lead.paid_at && (
                        <div style={{ color: '#6c757d', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                          {new Date(lead.paid_at).toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={getBadgeStyle('checkout', checkoutStatus)}>
                        {formatStatusLabel(checkoutStatus)}
                      </span>
                    </td>
                    <td>{lead.email || '-'}</td>
                    <td>{lead.phone || '-'}</td>
                    <td>{lead.service_type || '-'}</td>
                    <td style={{ maxWidth: '280px', whiteSpace: 'pre-wrap' }}>{lead.details || '-'}</td>
                    <td>{lead.created_at ? new Date(lead.created_at).toLocaleString() : '-'}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-small btn-edit"
                          onClick={() => handleAccept(lead)}
                          disabled={processingId === lead.id}
                        >
                          {processingId === lead.id ? 'Working...' : 'Accept'}
                        </button>
                        <button
                          className="btn-small btn-delete"
                          onClick={() => handleReject(lead)}
                          disabled={processingId === lead.id}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="table-container">
        <h3 style={{ marginBottom: '1rem' }}>Lead History</h3>

        {historyLeads.length === 0 ? (
          <div className="empty-state">
            <p>No lead history yet.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Payment</th>
                <th>Checkout</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Lead Status</th>
                <th>Accepted Customer ID</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {historyLeads.map((lead) => {
                const paymentStatus = getPaymentStatus(lead);
                const checkoutStatus = getCheckoutStatus(lead);

                return (
                  <tr key={lead.id}>
                    <td>
                      <strong>{lead.full_name}</strong>
                      {lead.source && (
                        <div style={{ color: '#6c757d', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                          {lead.source}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={getBadgeStyle('payment', paymentStatus)}>
                        {getPaymentSummary(lead)}
                      </span>
                      {lead.paid_at && (
                        <div style={{ color: '#6c757d', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                          {new Date(lead.paid_at).toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={getBadgeStyle('checkout', checkoutStatus)}>
                        {formatStatusLabel(checkoutStatus)}
                      </span>
                    </td>
                    <td>{lead.email || '-'}</td>
                    <td>{lead.phone || '-'}</td>
                    <td>
                      <span style={getBadgeStyle('leadStatus', lead.status)}>
                        {formatStatusLabel(lead.status)}
                      </span>
                    </td>
                    <td>{lead.accepted_customer_id || '-'}</td>
                    <td>{lead.updated_at ? new Date(lead.updated_at).toLocaleString() : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Leads;

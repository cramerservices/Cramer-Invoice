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
                <th>Email</th>
                <th>Phone</th>
                <th>Service</th>
                <th>Details</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingLeads.map((lead) => (
                <tr key={lead.id}>
                  <td><strong>{lead.full_name}</strong></td>
                  <td>{lead.email || '-'}</td>
                  <td>{lead.phone || '-'}</td>
                  <td>{lead.service_type || '-'}</td>
                  <td style={{ maxWidth: '280px' }}>{lead.details || '-'}</td>
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
              ))}
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
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Accepted Customer ID</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {historyLeads.map((lead) => (
                <tr key={lead.id}>
                  <td><strong>{lead.full_name}</strong></td>
                  <td>{lead.email || '-'}</td>
                  <td>{lead.phone || '-'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{lead.status}</td>
                  <td>{lead.accepted_customer_id || '-'}</td>
                  <td>{lead.updated_at ? new Date(lead.updated_at).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Leads;

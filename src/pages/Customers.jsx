import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './Customers.css';

function Customers() {
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: ''
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const normalizeEmail = (email) => {
    return (email || '').trim().toLowerCase();
  };

  const findPortalCustomerIdByEmail = async (email) => {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) return null;

    const { data, error } = await supabase
      .from('portal_customers')
      .select('id, email')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (error) throw error;

    return data?.id || null;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const normalizedEmail = normalizeEmail(formData.email);
      const portalCustomerId = await findPortalCustomerIdByEmail(normalizedEmail);

      const payload = {
        name: formData.name.trim(),
        email: normalizedEmail || null,
        phone: formData.phone.trim() || null,
        address: formData.address.trim() || null,
        notes: formData.notes.trim() || null,
        portal_customer_id: portalCustomerId
      };

      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update({
            ...payload,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingCustomer.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('customers')
          .insert([payload]);

        if (error) throw error;
      }

      setShowForm(false);
      setEditingCustomer(null);
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        notes: ''
      });

      await fetchCustomers();
    } catch (error) {
      console.error('Error saving customer:', error);
      alert(`Failed to save customer: ${error.message || 'Unknown error'}`);
    }
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      notes: customer.notes || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) return;

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      alert('Failed to delete customer');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingCustomer(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      notes: ''
    });
  };

  if (loading) {
    return <div className="loading">Loading customers...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Customers</h2>
        {!showForm && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Add Customer
          </button>
        )}
      </div>

      {showForm && (
        <div className="form-card">
          <h3>{editingCustomer ? 'Edit Customer' : 'New Customer'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Address</label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                rows="3"
              />
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows="3"
              />
            </div>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                {editingCustomer ? 'Update' : 'Create'} Customer
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        {customers.length === 0 ? (
          <div className="empty-state">
            <p>No customers yet. Add your first customer to get started!</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Linked Portal ID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td><strong>{customer.name}</strong></td>
                  <td>{customer.email || '-'}</td>
                  <td>{customer.phone || '-'}</td>
                  <td>{customer.address || '-'}</td>
                  <td>{customer.portal_customer_id || '-'}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-small btn-edit"
                        onClick={() => handleEdit(customer)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-small btn-delete"
                        onClick={() => handleDelete(customer.id)}
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

export default Customers;

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import './Customers.css';

const emptyCustomer = { name: '', email: '', phone: '', address: '', notes: '' };
const emptyEquipment = { equipment_type: 'Air Conditioner', location: '', manufacturer: '', model_number: '', serial_number: '', installed_on: '', warranty_expires_on: '', filter_size: '', refrigerant_type: '', next_service_due: '', notes: '' };
const emptyService = { appointment_id: '', equipment_id: '', service_date: new Date().toISOString().slice(0, 10), service_type: 'Tune-Up', technician_name: '', summary: '', recommendations: '' };

function Customers() {
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState(emptyCustomer);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [equipmentForm, setEquipmentForm] = useState(emptyEquipment);
  const [serviceForm, setServiceForm] = useState(emptyService);
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const rows = data || [];
      const ids = rows.map((row) => row.id);
      let profileMap = new Map();
      if (ids.length) {
        const { data: profiles, error: profileError } = await supabase.from('profiles').select('id, customer_id, customer_membership_id').in('customer_id', ids);
        if (profileError) throw profileError;
        profileMap = new Map((profiles || []).map((profile) => [profile.customer_id, profile]));
      }
      setCustomers(rows.map((row) => ({ ...row, linked_profile_id: profileMap.get(row.id)?.id || null, linked_customer_membership_id: profileMap.get(row.id)?.customer_membership_id || null })));
    } catch (error) { console.error('Error fetching customers:', error); }
    finally { setLoading(false); }
  };

  const loadCustomerProfile = async (customer) => {
    setSelectedCustomer(customer); setProfileLoading(true);
    try {
      const [equipmentResult, serviceResult, appointmentResult] = await Promise.all([
        supabase.from('customer_equipment').select('*').eq('customer_id', customer.id).order('created_at'),
        supabase.from('customer_service_records').select('*, service_record_photos(*)').eq('customer_id', customer.id).order('service_date', { ascending: false }),
        supabase.from('appointments').select('id, appointment_date, service_type, status').eq('customer_id', customer.id).order('appointment_date', { ascending: false }).limit(30)
      ]);
      if (equipmentResult.error) throw equipmentResult.error;
      if (serviceResult.error) throw serviceResult.error;
      if (appointmentResult.error) throw appointmentResult.error;
      setEquipment(equipmentResult.data || []); setServiceRecords(serviceResult.data || []); setAppointments(appointmentResult.data || []);
    } catch (error) {
      console.error('Error loading customer profile:', error);
      alert(`Could not load equipment/service records. Apply the new CRM database migration first. ${error.message || ''}`);
    } finally { setProfileLoading(false); }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = { name: formData.name.trim(), email: formData.email.trim().toLowerCase() || null, phone: formData.phone.trim() || null, address: formData.address.trim() || null, notes: formData.notes.trim() || null };
      const query = editingCustomer ? supabase.from('customers').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingCustomer.id) : supabase.from('customers').insert([payload]);
      const { error } = await query;
      if (error) throw error;
      setShowForm(false); setEditingCustomer(null); setFormData(emptyCustomer); await fetchCustomers();
    } catch (error) { alert(`Failed to save customer: ${error.message || 'Unknown error'}`); }
  };

  const saveEquipment = async (event) => {
    event.preventDefault(); if (!selectedCustomer) return; setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(equipmentForm).map(([key, value]) => [key, value || null]));
      const { error } = await supabase.from('customer_equipment').insert([{ ...payload, customer_id: selectedCustomer.id }]);
      if (error) throw error;
      setEquipmentForm(emptyEquipment); await loadCustomerProfile(selectedCustomer);
    } catch (error) { alert(`Failed to add equipment: ${error.message}`); }
    finally { setSaving(false); }
  };

  const saveServiceRecord = async (event) => {
    event.preventDefault(); if (!selectedCustomer) return; setSaving(true);
    try {
      const { data: record, error } = await supabase.from('customer_service_records').insert([{ ...serviceForm, appointment_id: serviceForm.appointment_id || null, equipment_id: serviceForm.equipment_id || null, customer_id: selectedCustomer.id, summary: serviceForm.summary.trim() || null, recommendations: serviceForm.recommendations.trim() || null }]).select('*').single();
      if (error) throw error;
      for (const file of photos) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        const path = `${selectedCustomer.id}/${record.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('customer-service-photos').upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        const { error: photoError } = await supabase.from('service_record_photos').insert([{ service_record_id: record.id, customer_id: selectedCustomer.id, storage_path: path }]);
        if (photoError) throw photoError;
      }
      if (serviceForm.equipment_id) {
        const nextDue = new Date(`${serviceForm.service_date}T12:00:00`); nextDue.setFullYear(nextDue.getFullYear() + 1);
        await supabase.from('customer_equipment').update({ last_service_date: serviceForm.service_date, next_service_due: nextDue.toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq('id', serviceForm.equipment_id);
      }
      if (serviceForm.appointment_id) {
        await supabase.from('appointments').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', serviceForm.appointment_id);
      }
      setServiceForm(emptyService); setPhotos([]); await loadCustomerProfile(selectedCustomer);
    } catch (error) { alert(`Failed to save service record: ${error.message}`); }
    finally { setSaving(false); }
  };

  const photoUrl = (path) => supabase.storage.from('customer-service-photos').getPublicUrl(path).data.publicUrl;
  const openEquipmentProfile = async () => {
    if (!editingCustomer) return;
    setShowForm(false);
    await loadCustomerProfile(editingCustomer);
    window.setTimeout(() => {
      document.querySelector('.customer-profile-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };
  if (loading) return <div className="loading">Loading customers...</div>;

  return <div className="page-container">
    <div className="page-header"><h2>Customers</h2>{!showForm && <button className="btn-primary" onClick={() => setShowForm(true)}>+ Add Customer</button>}</div>
    {showForm && <div className="form-card"><h3>{editingCustomer ? 'Edit Customer' : 'New Customer'}</h3><form onSubmit={handleSubmit}>
      <div className="form-row"><Field label="Name *" value={formData.name} onChange={(value) => setFormData({ ...formData, name: value })} required /><Field label="Email" type="email" value={formData.email} onChange={(value) => setFormData({ ...formData, email: value })} /><Field label="Phone" value={formData.phone} onChange={(value) => setFormData({ ...formData, phone: value })} /></div>
      <Area label="Address" value={formData.address} onChange={(value) => setFormData({ ...formData, address: value })} /><Area label="Notes" value={formData.notes} onChange={(value) => setFormData({ ...formData, notes: value })} />
      {editingCustomer && <div className="equipment-profile-callout"><div><strong>Equipment & Service History</strong><p>Add model and serial numbers, system details, completed tune-ups, recommendations, and service photos for this customer.</p></div><button type="button" className="btn-view equipment-profile-button" onClick={openEquipmentProfile}>Manage Equipment & Service History</button></div>}
      <div className="form-actions"><button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditingCustomer(null); setFormData(emptyCustomer); }}>Cancel</button><button className="btn-primary">Save Customer</button></div>
    </form></div>}
    <div className="table-container"><table className="data-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Address</th><th>Portal</th><th>Actions</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong></td><td>{customer.email || '-'}</td><td>{customer.phone || '-'}</td><td>{customer.address || '-'}</td><td>{customer.linked_profile_id ? 'Linked' : '-'}</td><td><div className="action-buttons"><button className="btn-small btn-view" onClick={() => loadCustomerProfile(customer)}>Profile</button><button className="btn-small btn-edit" onClick={() => { setEditingCustomer(customer); setFormData({ name: customer.name || '', email: customer.email || '', phone: customer.phone || '', address: customer.address || '', notes: customer.notes || '' }); setShowForm(true); }}>Edit</button></div></td></tr>)}</tbody></table>{!customers.length && <div className="empty-state">No customers yet.</div>}</div>
    {selectedCustomer && <div className="customer-profile-panel"><div className="profile-heading"><div><h2>{selectedCustomer.name}</h2><p>{selectedCustomer.email || 'No email'} · {selectedCustomer.phone || 'No phone'}</p></div><button className="btn-secondary" onClick={() => setSelectedCustomer(null)}>Close Profile</button></div>
      {profileLoading ? <div className="loading">Loading profile…</div> : <><section className="profile-section"><h3>Equipment</h3><div className="equipment-grid">{equipment.map((item) => <article className="equipment-card" key={item.id}><h4>{item.equipment_type}</h4><p><strong>{item.manufacturer || 'Brand not entered'}</strong></p><p>Model: {item.model_number || '-'}</p><p>Serial: {item.serial_number || '-'}</p><p>Location: {item.location || '-'}</p><p>Filter: {item.filter_size || '-'}</p><p>Next service: {item.next_service_due || 'Not scheduled'}</p></article>)}</div>
        <form className="profile-form" onSubmit={saveEquipment}><h4>Add Equipment</h4><div className="form-row"><div className="form-group"><label>Type *</label><select value={equipmentForm.equipment_type} onChange={(e) => setEquipmentForm({ ...equipmentForm, equipment_type: e.target.value })}>{['Air Conditioner','Furnace','Heat Pump','Air Handler','Evaporator Coil','Mini Split','Other'].map((x) => <option key={x}>{x}</option>)}</select></div>{['location','manufacturer','model_number','serial_number','filter_size','refrigerant_type'].map((field) => <Field key={field} label={field.replaceAll('_', ' ')} value={equipmentForm[field]} onChange={(value) => setEquipmentForm({ ...equipmentForm, [field]: value })} />)}<Field label="Installed" type="date" value={equipmentForm.installed_on} onChange={(value) => setEquipmentForm({ ...equipmentForm, installed_on: value })} /><Field label="Warranty expires" type="date" value={equipmentForm.warranty_expires_on} onChange={(value) => setEquipmentForm({ ...equipmentForm, warranty_expires_on: value })} /><Field label="Next service due" type="date" value={equipmentForm.next_service_due} onChange={(value) => setEquipmentForm({ ...equipmentForm, next_service_due: value })} /></div><Area label="Notes" value={equipmentForm.notes} onChange={(value) => setEquipmentForm({ ...equipmentForm, notes: value })} /><button className="btn-primary" disabled={saving}>Add Equipment</button></form>
      </section><section className="profile-section"><h3>Tune-Ups & Service History</h3><form className="profile-form" onSubmit={saveServiceRecord}><h4>Add Completed Service</h4><div className="form-row"><div className="form-group"><label>Appointment</label><select value={serviceForm.appointment_id} onChange={(e) => setServiceForm({ ...serviceForm, appointment_id: e.target.value })}><option value="">No linked appointment</option>{appointments.map((a) => <option key={a.id} value={a.id}>{a.appointment_date} — {a.service_type} ({a.status})</option>)}</select></div><div className="form-group"><label>Equipment</label><select value={serviceForm.equipment_id} onChange={(e) => setServiceForm({ ...serviceForm, equipment_id: e.target.value })}><option value="">Not specified</option>{equipment.map((item) => <option key={item.id} value={item.id}>{item.equipment_type} — {item.manufacturer || item.location || 'Equipment'}</option>)}</select></div><Field label="Date *" type="date" value={serviceForm.service_date} onChange={(value) => setServiceForm({ ...serviceForm, service_date: value })} required /><Field label="Technician" value={serviceForm.technician_name} onChange={(value) => setServiceForm({ ...serviceForm, technician_name: value })} /></div><Area label="Work completed / summary" value={serviceForm.summary} onChange={(value) => setServiceForm({ ...serviceForm, summary: value })} /><Area label="Recommendations" value={serviceForm.recommendations} onChange={(value) => setServiceForm({ ...serviceForm, recommendations: value })} /><div className="form-group"><label>Photos</label><input type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files || []))} /><small>{photos.length ? `${photos.length} photo(s) selected` : 'Add equipment, condition, readings, or completed-work photos.'}</small></div><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Completed Service'}</button></form>
        <div className="service-history-list">{serviceRecords.map((record) => <article className="service-record-card" key={record.id}><div><h4>{record.service_type} — {record.service_date}</h4><p>{record.technician_name ? `Technician: ${record.technician_name}` : ''}</p><p>{record.summary || 'No summary entered.'}</p>{record.recommendations && <p><strong>Recommendations:</strong> {record.recommendations}</p>}</div><div className="service-photo-grid">{(record.service_record_photos || []).map((photo) => <a key={photo.id} href={photoUrl(photo.storage_path)} target="_blank" rel="noreferrer"><img src={photoUrl(photo.storage_path)} alt={photo.caption || 'Service'} /></a>)}</div></article>)}</div>
      </section></>}
    </div>}
  </div>;
}

function Field({ label, value, onChange, type = 'text', required = false }) { return <div className="form-group"><label>{label}</label><input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} /></div>; }
function Area({ label, value, onChange }) { return <div className="form-group"><label>{label}</label><textarea rows="3" value={value} onChange={(e) => onChange(e.target.value)} /></div>; }

export default Customers;

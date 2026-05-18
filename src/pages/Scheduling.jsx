import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import './Scheduling.css';

function Scheduling() {
  const [appointments, setAppointments] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(true);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);

  const [appointmentForm, setAppointmentForm] = useState({
    customer_id: '',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    service_address: '',
    service_type: 'Diagnostic',
    appointment_date: '',
    start_time: '08:00',
    duration_minutes: 60,
    notes: '',
    status: 'confirmed'
  });

  const [blockForm, setBlockForm] = useState({
    block_date: '',
    start_time: '08:00',
    end_time: '09:00',
    block_type: 'busy',
    reason: ''
  });

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const businessHours = useMemo(() => {
    const day = new Date(`${selectedDate}T12:00:00`).getDay();

    if (day >= 1 && day <= 5) {
      return { open: '08:00', close: '16:00' };
    }

    return { open: '08:00', close: '20:00' };
  }, [selectedDate]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [appointmentsRes, blocksRes, customersRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('*')
          .eq('appointment_date', selectedDate)
          .order('start_time', { ascending: true }),

        supabase
          .from('schedule_blocks')
          .select('*')
          .eq('block_date', selectedDate)
          .order('start_time', { ascending: true }),

        supabase
          .from('customers')
          .select('id, name, email, phone, address')
          .order('name', { ascending: true })
      ]);

      if (appointmentsRes.error) throw appointmentsRes.error;
      if (blocksRes.error) throw blocksRes.error;
      if (customersRes.error) throw customersRes.error;

      setAppointments(appointmentsRes.data || []);
      setBlocks(blocksRes.data || []);
      setCustomers(customersRes.data || []);
    } catch (error) {
      console.error('Error loading schedule:', error);
      alert(`Failed to load schedule: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time) => {
    if (!time) return '-';

    return new Date(`${selectedDate}T${time}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const formatDate = (date) => {
    if (!date) return '-';

    return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const minutesToTime = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  };

  const timeToMinutes = (time) => {
    const [h, m] = String(time || '00:00').split(':').map(Number);
    return h * 60 + m;
  };

  const getEndTime = (startTime, durationMinutes) => {
    return minutesToTime(timeToMinutes(startTime) + Number(durationMinutes || 60));
  };

  const getDurationForService = (serviceType) => {
    const value = String(serviceType || '').toLowerCase();

    if (value.includes('tune')) return 90;
    if (value.includes('diagnostic')) return 60;
    if (value.includes('estimate')) return 60;
    if (value.includes('repair')) return 60;
    if (value.includes('install')) return 120;

    return 60;
  };

  const resetAppointmentForm = () => {
    setEditingAppointment(null);
    setAppointmentForm({
      customer_id: '',
      customer_name: '',
      customer_email: '',
      customer_phone: '',
      service_address: '',
      service_type: 'Diagnostic',
      appointment_date: selectedDate,
      start_time: businessHours.open,
      duration_minutes: 60,
      notes: '',
      status: 'confirmed'
    });
  };

  const resetBlockForm = () => {
    setBlockForm({
      block_date: selectedDate,
      start_time: businessHours.open,
      end_time: '09:00',
      block_type: 'busy',
      reason: ''
    });
  };

  const openNewAppointmentForm = () => {
    resetAppointmentForm();
    setShowAppointmentForm(true);
    setShowBlockForm(false);
  };

  const openNewBlockForm = () => {
    resetBlockForm();
    setShowBlockForm(true);
    setShowAppointmentForm(false);
  };

  const handleAppointmentInput = (e) => {
    const { name, value } = e.target;

    setAppointmentForm((prev) => {
      const next = { ...prev, [name]: value };

      if (name === 'service_type') {
        next.duration_minutes = getDurationForService(value);
      }

      return next;
    });
  };

  const handleBlockInput = (e) => {
    const { name, value } = e.target;
    setBlockForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCustomerPick = (e) => {
    const customerId = e.target.value;
    const customer = customers.find((row) => row.id === customerId);

    setAppointmentForm((prev) => ({
      ...prev,
      customer_id: customerId,
      customer_name: customer?.name || '',
      customer_email: customer?.email || '',
      customer_phone: customer?.phone || '',
      service_address: customer?.address || ''
    }));
  };

  const saveAppointment = async (e) => {
    e.preventDefault();

    try {
      const payload = {
        customer_id: appointmentForm.customer_id || null,
        customer_name: appointmentForm.customer_name.trim(),
        customer_email: appointmentForm.customer_email.trim().toLowerCase(),
        customer_phone: appointmentForm.customer_phone.trim(),
        service_address: appointmentForm.service_address.trim() || null,
        service_type: appointmentForm.service_type,
        appointment_date: appointmentForm.appointment_date,
        start_time: appointmentForm.start_time,
        end_time: getEndTime(
          appointmentForm.start_time,
          appointmentForm.duration_minutes
        ),
        duration_minutes: Number(appointmentForm.duration_minutes || 60),
        buffer_minutes: 15,
        notes: appointmentForm.notes.trim() || null,
        status: appointmentForm.status,
        source: 'crm_manual',
        updated_at: new Date().toISOString()
      };

      if (!payload.customer_name || !payload.customer_email || !payload.customer_phone) {
        alert('Customer name, email, and phone are required.');
        return;
      }

      if (editingAppointment) {
        const { error } = await supabase
          .from('appointments')
          .update(payload)
          .eq('id', editingAppointment.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('appointments')
          .insert([payload]);

        if (error) throw error;
      }

     const saveAppointment = async (e) => {
  e.preventDefault();

  try {
    const payload = {
      customer_id: appointmentForm.customer_id || null,
      customer_name: appointmentForm.customer_name.trim(),
      customer_email: appointmentForm.customer_email.trim().toLowerCase(),
      customer_phone: appointmentForm.customer_phone.trim(),
      service_address: appointmentForm.service_address.trim() || null,
      service_type: appointmentForm.service_type,
      appointment_date: appointmentForm.appointment_date,
      start_time: appointmentForm.start_time,
      end_time: getEndTime(
        appointmentForm.start_time,
        appointmentForm.duration_minutes
      ),
      duration_minutes: Number(appointmentForm.duration_minutes || 60),
      buffer_minutes: 15,
      notes: appointmentForm.notes.trim() || null,
      status: appointmentForm.status,
      source: 'crm_manual',
      updated_at: new Date().toISOString()
    };

    if (!payload.customer_name || !payload.customer_email || !payload.customer_phone) {
      alert('Customer name, email, and phone are required.');
      return;
    }

    let savedAppointment = null;

    if (editingAppointment) {
      const { data, error } = await supabase
        .from('appointments')
        .update(payload)
        .eq('id', editingAppointment.id)
        .select('*')
        .single();

      if (error) throw error;
      savedAppointment = data;
    } else {
      const { data, error } = await supabase
        .from('appointments')
        .insert([payload])
        .select('*')
        .single();

      if (error) throw error;
      savedAppointment = data;
    }

    if (savedAppointment?.id && savedAppointment.customer_email) {
      const { data: emailData, error: emailError } = await supabase.functions.invoke(
        'send-appointment-email',
        {
          body: {
            appointmentId: savedAppointment.id,
            type: 'confirmation'
          }
        }
      );

      if (emailError || !emailData?.success) {
        console.error('Confirmation email failed', emailError || emailData);
        alert('Appointment saved, but the confirmation email did not send.');
      }
    }

    setShowAppointmentForm(false);
    resetAppointmentForm();
    await fetchData();
  } catch (error) {
    console.error('Error saving appointment:', error);
    alert(`Failed to save appointment: ${error.message || 'Unknown error'}`);
  }
};
    } catch (error) {
      console.error('Error saving appointment:', error);
      alert(`Failed to save appointment: ${error.message || 'Unknown error'}`);
    }
  };

  const saveBlock = async (e) => {
    e.preventDefault();

    try {
      const payload = {
        block_date: blockForm.block_date,
        start_time: blockForm.start_time,
        end_time: blockForm.end_time,
        block_type: blockForm.block_type,
        reason: blockForm.reason.trim() || null,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('schedule_blocks')
        .insert([payload]);

      if (error) throw error;

      setShowBlockForm(false);
      resetBlockForm();
      await fetchData();
    } catch (error) {
      console.error('Error saving block:', error);
      alert(`Failed to save block: ${error.message || 'Unknown error'}`);
    }
  };

  const editAppointment = (appointment) => {
    setEditingAppointment(appointment);
    setAppointmentForm({
      customer_id: appointment.customer_id || '',
      customer_name: appointment.customer_name || '',
      customer_email: appointment.customer_email || '',
      customer_phone: appointment.customer_phone || '',
      service_address: appointment.service_address || '',
      service_type: appointment.service_type || 'Diagnostic',
      appointment_date: appointment.appointment_date || selectedDate,
      start_time: String(appointment.start_time || '08:00').slice(0, 5),
      duration_minutes: appointment.duration_minutes || 60,
      notes: appointment.notes || '',
      status: appointment.status || 'confirmed'
    });
    setShowAppointmentForm(true);
    setShowBlockForm(false);
  };

  const cancelAppointment = async (appointment) => {
    if (!window.confirm('Cancel this appointment?')) return;

    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', appointment.id);

      if (error) throw error;

      await supabase.functions.invoke('send-appointment-email', {
        body: {
          appointmentId: appointment.id,
          type: 'cancelled'
        }
      });

      await fetchData();
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      alert(`Failed to cancel appointment: ${error.message || 'Unknown error'}`);
    }
  };

  const markCompleted = async (appointment) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', appointment.id);

      if (error) throw error;
      await fetchData();
    } catch (error) {
      console.error('Error completing appointment:', error);
      alert(`Failed to complete appointment: ${error.message || 'Unknown error'}`);
    }
  };

  const sendRescheduleEmail = async (appointment) => {
    if (!window.confirm('Send reschedule email to this customer?')) return;

    try {
      const { data, error } = await supabase.functions.invoke(
        'send-appointment-email',
        {
          body: {
            appointmentId: appointment.id,
            type: 'reschedule'
          }
        }
      );

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Email failed');

      alert('Reschedule email sent.');
      await fetchData();
    } catch (error) {
      console.error('Error sending reschedule email:', error);
      alert(`Failed to send reschedule email: ${error.message || 'Unknown error'}`);
    }
  };

  const deleteBlock = async (block) => {
    if (!window.confirm('Delete this blocked time?')) return;

    try {
      const { error } = await supabase
        .from('schedule_blocks')
        .delete()
        .eq('id', block.id);

      if (error) throw error;
      await fetchData();
    } catch (error) {
      console.error('Error deleting block:', error);
      alert(`Failed to delete block: ${error.message || 'Unknown error'}`);
    }
  };

  const activeAppointments = appointments.filter(
    (row) => row.status !== 'cancelled'
  );

  if (loading) {
    return <div className="loading">Loading schedule...</div>;
  }

  return (
    <div className="page-container scheduling-page">
      <div className="page-header">
        <div>
          <h2>Scheduling</h2>
          <p className="schedule-muted">
            Manage appointments, blocked times, and reschedule requests.
          </p>
        </div>

        <div className="schedule-actions">
          <button className="btn-secondary" onClick={openNewBlockForm}>
            + Block Time
          </button>
          <button className="btn-primary" onClick={openNewAppointmentForm}>
            + Add Appointment
          </button>
        </div>
      </div>

      <div className="schedule-toolbar">
        <div className="form-group">
          <label>Schedule Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>

        <div className="schedule-day-card">
          <strong>{formatDate(selectedDate)}</strong>
          <span>
            Hours: {businessHours.open} - {businessHours.close}
          </span>
        </div>
      </div>

      {showAppointmentForm && (
        <div className="form-card">
          <h3>{editingAppointment ? 'Edit Appointment' : 'New Appointment'}</h3>

          <form onSubmit={saveAppointment}>
            <div className="form-group">
              <label>Pick Existing Customer</label>
              <select
                value={appointmentForm.customer_id}
                onChange={handleCustomerPick}
              >
                <option value="">Manual / New Customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} {customer.phone ? `- ${customer.phone}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Customer Name *</label>
                <input
                  name="customer_name"
                  value={appointmentForm.customer_name}
                  onChange={handleAppointmentInput}
                  required
                />
              </div>

              <div className="form-group">
                <label>Phone *</label>
                <input
                  name="customer_phone"
                  value={appointmentForm.customer_phone}
                  onChange={handleAppointmentInput}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  name="customer_email"
                  value={appointmentForm.customer_email}
                  onChange={handleAppointmentInput}
                  required
                />
              </div>

              <div className="form-group">
                <label>Service Type</label>
                <select
                  name="service_type"
                  value={appointmentForm.service_type}
                  onChange={handleAppointmentInput}
                >
                  <option value="Diagnostic">Diagnostic</option>
                  <option value="Tune-Up">Tune-Up</option>
                  <option value="Estimate">Estimate</option>
                  <option value="Repair">Repair</option>
                  <option value="Install">Install</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Service Address</label>
              <input
                name="service_address"
                value={appointmentForm.service_address}
                onChange={handleAppointmentInput}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  name="appointment_date"
                  value={appointmentForm.appointment_date}
                  onChange={handleAppointmentInput}
                  required
                />
              </div>

              <div className="form-group">
                <label>Start Time</label>
                <input
                  type="time"
                  name="start_time"
                  step="1800"
                  value={appointmentForm.start_time}
                  onChange={handleAppointmentInput}
                  required
                />
              </div>

              <div className="form-group">
                <label>Duration</label>
                <select
                  name="duration_minutes"
                  value={appointmentForm.duration_minutes}
                  onChange={handleAppointmentInput}
                >
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="90">1.5 hours</option>
                  <option value="120">2 hours</option>
                  <option value="180">3 hours</option>
                  <option value="240">4 hours</option>
                </select>
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  name="status"
                  value={appointmentForm.status}
                  onChange={handleAppointmentInput}
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="reschedule_requested">Reschedule Requested</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no_show">No Show</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                name="notes"
                rows="3"
                value={appointmentForm.notes}
                onChange={handleAppointmentInput}
              />
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowAppointmentForm(false);
                  resetAppointmentForm();
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                {editingAppointment ? 'Update Appointment' : 'Create Appointment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showBlockForm && (
        <div className="form-card">
          <h3>Block Time</h3>

          <form onSubmit={saveBlock}>
            <div className="form-row">
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  name="block_date"
                  value={blockForm.block_date}
                  onChange={handleBlockInput}
                  required
                />
              </div>

              <div className="form-group">
                <label>Start Time</label>
                <input
                  type="time"
                  name="start_time"
                  step="1800"
                  value={blockForm.start_time}
                  onChange={handleBlockInput}
                  required
                />
              </div>

              <div className="form-group">
                <label>End Time</label>
                <input
                  type="time"
                  name="end_time"
                  step="1800"
                  value={blockForm.end_time}
                  onChange={handleBlockInput}
                  required
                />
              </div>

              <div className="form-group">
                <label>Block Type</label>
                <select
                  name="block_type"
                  value={blockForm.block_type}
                  onChange={handleBlockInput}
                >
                  <option value="busy">Busy</option>
                  <option value="lunch">Lunch</option>
                  <option value="personal">Personal</option>
                  <option value="vacation">Vacation</option>
                  <option value="parts_pickup">Parts Pickup</option>
                  <option value="emergency_job">Emergency Job</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Reason</label>
              <input
                name="reason"
                value={blockForm.reason}
                onChange={handleBlockInput}
                placeholder="Example: Lunch, parts pickup, personal appointment"
              />
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowBlockForm(false);
                  resetBlockForm();
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save Block
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="schedule-grid">
        <div className="schedule-section">
          <h3>Appointments</h3>

          {activeAppointments.length === 0 ? (
            <div className="empty-state-small">No appointments for this date.</div>
          ) : (
            <div className="schedule-list">
              {activeAppointments.map((appointment) => (
                <div key={appointment.id} className="schedule-card">
                  <div className="schedule-card-main">
                    <div className="schedule-time">
                      {formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}
                    </div>

                    <div className="schedule-title">
                      {appointment.customer_name}
                    </div>

                    <div className="schedule-subtitle">
                      {appointment.service_type} • {appointment.customer_phone}
                    </div>

                    <div className="schedule-subtitle">
                      {appointment.customer_email}
                    </div>

                    {appointment.service_address && (
                      <div className="schedule-subtitle">
                        📍 {appointment.service_address}
                      </div>
                    )}

                    {appointment.notes && (
                      <div className="schedule-notes">
                        {appointment.notes}
                      </div>
                    )}
                  </div>

                  <div className="schedule-card-side">
                    <span className={`status-badge status-${appointment.status}`}>
                      {appointment.status}
                    </span>

                    <button
                      className="btn-small btn-edit"
                      onClick={() => editAppointment(appointment)}
                    >
                      Edit
                    </button>

                    <button
                      className="btn-small btn-warning"
                      onClick={() => sendRescheduleEmail(appointment)}
                    >
                      Send Reschedule
                    </button>

                    <button
                      className="btn-small btn-complete"
                      onClick={() => markCompleted(appointment)}
                    >
                      Complete
                    </button>

                    <button
                      className="btn-small btn-delete"
                      onClick={() => cancelAppointment(appointment)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="schedule-section">
          <h3>Blocked Times</h3>

          {blocks.length === 0 ? (
            <div className="empty-state-small">No blocked times for this date.</div>
          ) : (
            <div className="schedule-list">
              {blocks.map((block) => (
                <div key={block.id} className="block-card">
                  <div>
                    <div className="schedule-time">
                      {formatTime(block.start_time)} - {formatTime(block.end_time)}
                    </div>

                    <div className="schedule-title">
                      {block.block_type}
                    </div>

                    <div className="schedule-subtitle">
                      {block.reason || 'No reason added'}
                    </div>
                  </div>

                  <button
                    className="btn-small btn-delete"
                    onClick={() => deleteBlock(block)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Scheduling;

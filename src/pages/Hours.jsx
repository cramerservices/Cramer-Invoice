import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import './Hours.css';

function Hours() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [approvedEstimates, setApprovedEstimates] = useState([]);
  const [techs, setTechs] = useState([]);
  const [runningJobs, setRunningJobs] = useState([]);
  const [recentHours, setRecentHours] = useState([]);

  const [startForm, setStartForm] = useState({
    estimate_id: '',
    tech_user_id: '',
    notes: ''
  });

  const [manualForm, setManualForm] = useState({
    estimate_id: '',
    tech_user_id: '',
    work_date: new Date().toISOString().slice(0, 10),
    total_hours: '',
    notes: ''
  });

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    work_date: '',
    total_hours: '',
    notes: '',
    status: 'manual'
  });

  useEffect(() => {
    fetchHoursData();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setRunningJobs(prev => [...prev]);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  async function fetchHoursData() {
    try {
      setLoading(true);

      const [
        estimatesRes,
        techsRes,
        runningRes,
        recentRes
      ] = await Promise.all([
        supabase
          .from('estimates')
          .select('id, estimate_number, customer_id, status, customers(name)')
          .eq('status', 'approved')
          .order('created_at', { ascending: false }),

        supabase
          .from('tech_users')
          .select('user_id, name, email')
          .order('name', { ascending: true }),

        supabase
          .from('job_hours')
          .select('*')
          .eq('status', 'running')
          .order('start_time', { ascending: false }),

        supabase
          .from('job_hours')
          .select('*')
          .neq('status', 'running')
          .order('created_at', { ascending: false })
          .limit(20)
      ]);

      if (estimatesRes.error) throw estimatesRes.error;
      if (techsRes.error) throw techsRes.error;
      if (runningRes.error) throw runningRes.error;
      if (recentRes.error) throw recentRes.error;

      setApprovedEstimates(estimatesRes.data || []);
      setTechs(techsRes.data || []);
      setRunningJobs(runningRes.data || []);
      setRecentHours(recentRes.data || []);
    } catch (error) {
      console.error('Error fetching hours data:', error);
      alert(error.message || 'Failed to load hours data.');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatDateTime(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function getElapsedHours(startTime) {
    if (!startTime) return '0.00';
    const start = new Date(startTime).getTime();
    const now = Date.now();
    return ((now - start) / 1000 / 60 / 60).toFixed(2);
  }

  const estimateOptions = useMemo(() => {
    return approvedEstimates.map((estimate) => ({
      ...estimate,
      label: `${estimate.estimate_number} - ${estimate.customers?.name || 'Unknown Customer'}`
    }));
  }, [approvedEstimates]);

  async function handleStartWork(e) {
    e.preventDefault();

    if (!startForm.estimate_id || !startForm.tech_user_id) {
      alert('Please select a job and a tech.');
      return;
    }

    try {
      setSaving(true);

      const estimate = approvedEstimates.find(
        (item) => item.id === startForm.estimate_id
      );
      const tech = techs.find(
        (item) => item.user_id === startForm.tech_user_id
      );

      const { error } = await supabase
        .from('job_hours')
        .insert({
          estimate_id: estimate.id,
          estimate_number: estimate.estimate_number,
          customer_id: estimate.customer_id,
          tech_user_id: tech.user_id,
          tech_name: tech.name || tech.email || 'Unknown Tech',
          work_date: new Date().toISOString().slice(0, 10),
          start_time: new Date().toISOString(),
          status: 'running',
          notes: startForm.notes || null
        });

      if (error) {
        if (error.message?.toLowerCase().includes('duplicate')) {
          throw new Error('That tech already has a timer running.');
        }
        throw error;
      }

      setStartForm({
        estimate_id: '',
        tech_user_id: '',
        notes: ''
      });

      await fetchHoursData();
    } catch (error) {
      console.error('Error starting work:', error);
      alert(error.message || 'Failed to start work timer.');
    } finally {
      setSaving(false);
    }
  }

  async function handleFinishWork(job) {
    try {
      setSaving(true);

      const start = new Date(job.start_time).getTime();
      const end = Date.now();
      const totalHours = Number(((end - start) / 1000 / 60 / 60).toFixed(2));

      const { error } = await supabase
        .from('job_hours')
        .update({
          end_time: new Date().toISOString(),
          total_hours: totalHours,
          status: 'completed'
        })
        .eq('id', job.id);

      if (error) throw error;

      await fetchHoursData();
    } catch (error) {
      console.error('Error finishing work:', error);
      alert(error.message || 'Failed to finish work.');
    } finally {
      setSaving(false);
    }
  }

  async function handleManualSave(e) {
    e.preventDefault();

    if (!manualForm.estimate_id || !manualForm.tech_user_id || !manualForm.total_hours) {
      alert('Please complete all required manual hour fields.');
      return;
    }

    const hours = Number(manualForm.total_hours);
    if (Number.isNaN(hours) || hours <= 0) {
      alert('Please enter a valid number of hours.');
      return;
    }

    try {
      setSaving(true);

      const estimate = approvedEstimates.find(
        (item) => item.id === manualForm.estimate_id
      );
      const tech = techs.find(
        (item) => item.user_id === manualForm.tech_user_id
      );

      const { error } = await supabase
        .from('job_hours')
        .insert({
          estimate_id: estimate.id,
          estimate_number: estimate.estimate_number,
          customer_id: estimate.customer_id,
          tech_user_id: tech.user_id,
          tech_name: tech.name || tech.email || 'Unknown Tech',
          work_date: manualForm.work_date,
          total_hours: hours,
          status: 'manual',
          notes: manualForm.notes || null
        });

      if (error) throw error;

      setManualForm({
        estimate_id: '',
        tech_user_id: '',
        work_date: new Date().toISOString().slice(0, 10),
        total_hours: '',
        notes: ''
      });

      await fetchHoursData();
    } catch (error) {
      console.error('Error saving manual hours:', error);
      alert(error.message || 'Failed to save manual hours.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setEditForm({
      work_date: row.work_date || '',
      total_hours: row.total_hours ?? '',
      notes: row.notes || '',
      status: row.status || 'manual'
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({
      work_date: '',
      total_hours: '',
      notes: '',
      status: 'manual'
    });
  }

  async function saveEdit(id) {
    const hours = Number(editForm.total_hours);
    if (Number.isNaN(hours) || hours < 0) {
      alert('Please enter a valid number of hours.');
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from('job_hours')
        .update({
          work_date: editForm.work_date,
          total_hours: hours,
          notes: editForm.notes || null,
          status: editForm.status
        })
        .eq('id', id);

      if (error) throw error;

      cancelEdit();
      await fetchHoursData();
    } catch (error) {
      console.error('Error updating hours:', error);
      alert(error.message || 'Failed to update hours.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id) {
    const confirmed = window.confirm('Delete this hour entry?');
    if (!confirmed) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from('job_hours')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchHoursData();
    } catch (error) {
      console.error('Error deleting hour entry:', error);
      alert(error.message || 'Failed to delete hour entry.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="loading">Loading hours...</div>;
  }

  return (
    <div className="hours-page">
      <h2 className="hours-title">Hours</h2>

      <div className="hours-grid">
        <div className="hours-card">
          <h3>Start Job Timer</h3>
          <form onSubmit={handleStartWork} className="hours-form">
            <select
              value={startForm.estimate_id}
              onChange={(e) =>
                setStartForm({ ...startForm, estimate_id: e.target.value })
              }
            >
              <option value="">Select approved estimate</option>
              {estimateOptions.map((estimate) => (
                <option key={estimate.id} value={estimate.id}>
                  {estimate.label}
                </option>
              ))}
            </select>

            <select
              value={startForm.tech_user_id}
              onChange={(e) =>
                setStartForm({ ...startForm, tech_user_id: e.target.value })
              }
            >
              <option value="">Select tech</option>
              {techs.map((tech) => (
                <option key={tech.user_id} value={tech.user_id}>
                  {tech.name || tech.email || tech.user_id}
                </option>
              ))}
            </select>

            <textarea
              placeholder="Notes (optional)"
              value={startForm.notes}
              onChange={(e) =>
                setStartForm({ ...startForm, notes: e.target.value })
              }
              rows={3}
            />

            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Start Work'}
            </button>
          </form>
        </div>

        <div className="hours-card">
          <h3>Manual Hours</h3>
          <form onSubmit={handleManualSave} className="hours-form">
            <select
              value={manualForm.estimate_id}
              onChange={(e) =>
                setManualForm({ ...manualForm, estimate_id: e.target.value })
              }
            >
              <option value="">Select approved estimate</option>
              {estimateOptions.map((estimate) => (
                <option key={estimate.id} value={estimate.id}>
                  {estimate.label}
                </option>
              ))}
            </select>

            <select
              value={manualForm.tech_user_id}
              onChange={(e) =>
                setManualForm({ ...manualForm, tech_user_id: e.target.value })
              }
            >
              <option value="">Select tech</option>
              {techs.map((tech) => (
                <option key={tech.user_id} value={tech.user_id}>
                  {tech.name || tech.email || tech.user_id}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={manualForm.work_date}
              onChange={(e) =>
                setManualForm({ ...manualForm, work_date: e.target.value })
              }
            />

            <input
              type="number"
              step="0.25"
              min="0"
              placeholder="Hours"
              value={manualForm.total_hours}
              onChange={(e) =>
                setManualForm({ ...manualForm, total_hours: e.target.value })
              }
            />

            <textarea
              placeholder="Notes (optional)"
              value={manualForm.notes}
              onChange={(e) =>
                setManualForm({ ...manualForm, notes: e.target.value })
              }
              rows={3}
            />

            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Manual Hours'}
            </button>
          </form>
        </div>
      </div>

      <div className="hours-card">
        <h3>Running Jobs</h3>
        {runningJobs.length === 0 ? (
          <div className="empty-state-small">No jobs currently running</div>
        ) : (
          <div className="list-items">
            {runningJobs.map((job) => (
              <div key={job.id} className="list-item">
                <div className="list-item-main">
                  <div className="list-item-title">
                    {job.estimate_number}
                  </div>
                  <div className="list-item-subtitle">
                    {job.tech_name} • Started {formatDateTime(job.start_time)}
                  </div>
                  <div className="list-item-subtitle">
                    Elapsed: {getElapsedHours(job.start_time)} hrs
                  </div>
                  {job.notes ? (
                    <div className="list-item-subtitle">
                      Notes: {job.notes}
                    </div>
                  ) : null}
                </div>

                <div className="list-item-side">
                  <button
                    type="button"
                    className="finish-btn"
                    onClick={() => handleFinishWork(job)}
                    disabled={saving}
                  >
                    Finish Work
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="hours-card">
        <h3>Recent Hour Entries</h3>
        {recentHours.length === 0 ? (
          <div className="empty-state-small">No hour entries yet</div>
        ) : (
          <div className="list-items">
            {recentHours.map((row) => (
              <div key={row.id} className="list-item">
                {editingId === row.id ? (
                  <div className="hours-edit-block">
                    <input
                      type="date"
                      value={editForm.work_date}
                      onChange={(e) =>
                        setEditForm({ ...editForm, work_date: e.target.value })
                      }
                    />

                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={editForm.total_hours}
                      onChange={(e) =>
                        setEditForm({ ...editForm, total_hours: e.target.value })
                      }
                    />

                    <select
                      value={editForm.status}
                      onChange={(e) =>
                        setEditForm({ ...editForm, status: e.target.value })
                      }
                    >
                      <option value="manual">manual</option>
                      <option value="completed">completed</option>
                    </select>

                    <textarea
                      rows={2}
                      value={editForm.notes}
                      onChange={(e) =>
                        setEditForm({ ...editForm, notes: e.target.value })
                      }
                    />

                    <div className="hours-edit-actions">
                      <button type="button" onClick={() => saveEdit(row.id)} disabled={saving}>
                        Save
                      </button>
                      <button type="button" onClick={cancelEdit} disabled={saving}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="list-item-main">
                      <div className="list-item-title">
                        {row.estimate_number}
                      </div>
                      <div className="list-item-subtitle">
                        {row.tech_name}
                      </div>
                      <div className="list-item-subtitle">
                        {formatDate(row.work_date)} • {Number(row.total_hours).toFixed(2)} hrs
                      </div>
                      {row.notes ? (
                        <div className="list-item-subtitle">
                          Notes: {row.notes}
                        </div>
                      ) : null}
                    </div>

                    <div className="list-item-side">
                      <span className={`status-badge status-${row.status}`}>
                        {row.status}
                      </span>
                      <button type="button" onClick={() => startEdit(row)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => deleteEntry(row.id)}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Hours;

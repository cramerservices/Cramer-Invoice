import { useState } from 'react';
import { supabase } from '../lib/supabase';
import './CrmLogin.css';

export default function CrmLogin({ accessError = '' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(accessError);
  const [loading, setLoading] = useState(false);

  const signIn = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (signInError) setError(signInError.message);
    setLoading(false);
  };

  return <div className="crm-login-page">
    <form className="crm-login-card" onSubmit={signIn}>
      <div className="crm-login-brand">Cramer Services</div>
      <h1>Staff CRM Login</h1>
      <p>Sign in with an approved administrator or technician account.</p>
      {error && <div className="crm-login-error">{error}</div>}
      <label>Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <button type="submit" disabled={loading}>{loading ? 'Signing In…' : 'Sign In'}</button>
    </form>
  </div>;
}

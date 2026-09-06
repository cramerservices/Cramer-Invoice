import { useState } from 'react';
import { supabase } from '../lib/supabase';
import './AiAssistant.css';

const examples = [
  'What equipment is installed at 123 Main Street?',
  'When was the last tune-up for this customer?',
  'Show overdue invoices for Silver Test Customer.',
  'What recommendations were left at the last service?',
];

export default function AiAssistant() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const ask = async (event) => {
    event?.preventDefault();
    if (!question.trim() || loading) return;
    setLoading(true); setError(''); setAnswer('');
    const { data, error: invokeError } = await supabase.functions.invoke('crm-assistant', {
      body: { question: question.trim() },
    });
    if (invokeError || !data?.success) setError(data?.error || invokeError?.message || 'The assistant could not answer.');
    else setAnswer(data.answer);
    setLoading(false);
  };

  return <div className="page-container ai-page">
    <div className="page-header"><div><h2>CRM Assistant</h2><p className="ai-subtitle">Ask questions about customers, addresses, equipment, service history, appointments, estimates, and invoices.</p></div></div>
    <div className="ai-layout"><section className="ai-chat-card">
      <form onSubmit={ask}><label htmlFor="crm-ai-question">What do you need to find?</label><textarea id="crm-ai-question" rows="4" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Example: What equipment is at 123 Main Street?" autoFocus /><button className="btn-primary" disabled={loading || !question.trim()}>{loading ? 'Searching CRM…' : 'Ask CRM Assistant'}</button></form>
      {error && <div className="ai-error">{error}</div>}
      {answer && <div className="ai-answer"><div className="ai-answer-label">Answer</div><div>{answer}</div><small>Verify model numbers, pricing, and safety-critical details before relying on them in the field.</small></div>}
    </section><aside className="ai-example-card"><h3>Try asking</h3>{examples.map((example) => <button key={example} onClick={() => setQuestion(example)}>{example}</button>)}<p>The assistant only uses information stored in this CRM. It will say when a record cannot be found.</p></aside></div>
  </div>;
}

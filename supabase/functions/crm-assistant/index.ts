import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': 'https://www.cramer.services', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const staffRoles = new Set(['admin', 'staff', 'technician', 'tech']);
const ownerEmail = 'cramerservicesllc@gmail.com';
const stopWords = new Set(['what','when','where','which','show','find','give','tell','does','have','with','from','this','that','customer','equipment','installed','address','service','invoice','estimate','please','about','their','there','last','for','the','and','are','was']);

function searchableTerms(question: string) {
  return [...new Set(question.toLowerCase().replace(/[^a-z0-9@.+-]+/g, ' ').split(/\s+/).filter((term) => term.length > 2 && !stopWords.has(term)))];
}

function responseText(payload: any) {
  if (payload.output_text) return payload.output_text;
  for (const output of payload.output || []) for (const content of output.content || []) if (content.type === 'output_text' && content.text) return content.text;
  return '';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json(401, { success: false, error: 'Sign in is required.' });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const email = (user.email || '').toLowerCase();
    const { data: profile } = await admin.from('profiles').select('role').eq('auth_user_id', user.id).maybeSingle();
    if (email !== ownerEmail && !staffRoles.has(String(profile?.role || '').toLowerCase())) return json(403, { success: false, error: 'This account is not approved for CRM access.' });

    const body = await request.json();
    const question = String(body.question || '').trim().slice(0, 1000);
    if (!question) return json(400, { success: false, error: 'Enter a question.' });

    const { data: customers, error: customerError } = await admin.from('customers').select('id, name, email, phone, address, notes').limit(500);
    if (customerError) throw customerError;
    const terms = searchableTerms(question);
    const ranked = (customers || []).map((customer: any) => {
      const text = [customer.name, customer.email, customer.phone, customer.address].filter(Boolean).join(' ').toLowerCase();
      return { customer, score: terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0) };
    }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map(({ customer }) => customer);

    const customerIds = ranked.map((customer: any) => customer.id);
    const wantsBroadInvoices = /overdue|unpaid|outstanding|all invoices/i.test(question);
    const wantsBroadAppointments = /today|tomorrow|upcoming|schedule|appointments/i.test(question) && customerIds.length === 0;
    const today = new Date().toISOString().slice(0, 10);

    const equipmentQuery = admin.from('customer_equipment').select('*').limit(100);
    const recordsQuery = admin.from('customer_service_records').select('*, service_record_photos(id, storage_path, caption)').order('service_date', { ascending: false }).limit(100);
    const invoiceQuery = admin.from('crm_invoices').select('*, crm_invoice_line_items(*)').order('invoice_date', { ascending: false }).limit(100);
    const estimateQuery = admin.from('estimates').select('*, estimate_line_items(*)').order('estimate_date', { ascending: false }).limit(100);
    const appointmentQuery = admin.from('appointments').select('*').order('appointment_date', { ascending: false }).limit(100);

    const results = await Promise.all([
      customerIds.length ? equipmentQuery.in('customer_id', customerIds) : equipmentQuery.in('customer_id', ['00000000-0000-0000-0000-000000000000']),
      customerIds.length ? recordsQuery.in('customer_id', customerIds) : recordsQuery.in('customer_id', ['00000000-0000-0000-0000-000000000000']),
      customerIds.length ? invoiceQuery.in('customer_id', customerIds) : wantsBroadInvoices ? invoiceQuery.in('status', ['sent','partial','overdue']) : invoiceQuery.in('customer_id', ['00000000-0000-0000-0000-000000000000']),
      customerIds.length ? estimateQuery.in('customer_id', customerIds) : estimateQuery.in('customer_id', ['00000000-0000-0000-0000-000000000000']),
      customerIds.length ? appointmentQuery.in('customer_id', customerIds) : wantsBroadAppointments ? appointmentQuery.gte('appointment_date', today) : appointmentQuery.in('customer_id', ['00000000-0000-0000-0000-000000000000']),
    ]);
    for (const result of results) if (result.error) throw result.error;

    const crmContext = {
      matching_customers: ranked,
      equipment: results[0].data || [],
      service_records: results[1].data || [],
      invoices: results[2].data || [],
      estimates: results[3].data || [],
      appointments: results[4].data || [],
    };

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) throw new Error('OPENAI_API_KEY is not configured');
    const aiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini',
        instructions: 'You are the internal Cramer Services CRM assistant. Answer only from the supplied CRM records. Be concise and field-technician friendly. Clearly say when information is missing or no confident customer match was found. Never invent model numbers, serial numbers, dates, prices, customer details, or work history. If multiple customers match, identify the ambiguity. Do not provide general HVAC repair instructions unless the CRM record contains them.',
        input: `Staff question: ${question}\n\nCRM records:\n${JSON.stringify(crmContext)}`,
      }),
    });
    const aiPayload = await aiResponse.json();
    if (!aiResponse.ok) throw new Error(aiPayload?.error?.message || 'OpenAI request failed');
    const answer = responseText(aiPayload) || 'I could not form an answer from the matching CRM records.';
    await admin.from('crm_ai_queries').insert([{ staff_user_id: user.id, question, matched_customer_ids: customerIds, answer }]);
    return json(200, { success: true, answer });
  } catch (error) {
    console.error(error);
    return json(500, { success: false, error: error instanceof Error ? error.message : 'Assistant error' });
  }
});

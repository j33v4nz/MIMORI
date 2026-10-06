/** Custom Node.js tool loop using MIMORI's HTTP API; no framework or model. */
import { randomUUID } from 'node:crypto';

const key = process.env.MIMORI_API_KEY || process.env.MIMORI_DEV_API_KEY;
if (!key) throw new Error('Set MIMORI_API_KEY to a key generated in your dashboard.');
const base = (process.env.MIMORI_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const session = process.env.MIMORI_SESSION_ID || randomUUID();
const events = [];
function record(event_type, payload) {
  events.push({ event_type, sequence_number: events.length + 1, payload });
}
function accountBalance(account_id) {
  return { account_id, balance: 1250, currency: 'USD' }; // Inert fixture.
}

record('chain_start', { name: 'account_review', input: 'demo-account' });
record('tool_start', { tool: { name: 'account_balance' }, input: { account_id: 'demo-account' } });
const result = accountBalance('demo-account');
record('tool_end', { tool: { name: 'account_balance' }, output: result });
record('chain_end', { name: 'account_review', output: 'Synthetic account reviewed' });

// Direct HTTP callers must sanitize their own data. This fixture contains no
// credentials or customer data; it does not implement general redaction.
const response = await fetch(`${base}/api/ingest/event`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ agent_name: 'custom-node-agent', framework: 'custom-node', session_id: session, events }),
  signal: AbortSignal.timeout(30000),
});
if (response.status !== 202) throw new Error(`Ingestion returned HTTP ${response.status}`);
const data = await response.json();
if (data.accepted !== events.length) throw new Error('Not all demo events were accepted.');
console.log(JSON.stringify({ session_id: session, session_record_id: data.session_record_id,
  agent_name: 'custom-node-agent', accepted: data.accepted }));

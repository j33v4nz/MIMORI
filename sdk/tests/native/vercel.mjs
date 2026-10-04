/** Runs real AI SDK tool dispatch; provider output and telemetry HTTP are fixtures. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(pathToFileURL(process.env.MIMORI_VERCEL_PACKAGE || `${process.cwd()}/package.json`));
const { generateText, tool, stepCountIs } = await import(pathToFileURL(require.resolve('ai')));
const { MockLanguageModelV3 } = await import(pathToFileURL(require.resolve('ai/test')));
const { z } = await import(pathToFileURL(require.resolve('zod')));
const source = readFileSync('sdk/mimori/vercel-ai-handler.js', 'utf8');
const { MIMORIVercelAIHandler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const events = [];
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'http://localhost:3000/api/ingest/event');
  const body = JSON.parse(options.body);
  assert.equal(body.framework, 'vercel-ai');
  await new Promise(resolve => setTimeout(resolve, 20));
  events.push(...body.events);
  return new Response(JSON.stringify({ accepted: body.events.length }), { status: 202 });
};
const common = { usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] };
const model = new MockLanguageModelV3({ doGenerate: [
  { ...common, content: [{ type: 'tool-call', toolCallId: 'fixture', toolName: 'balance', input: '{"account":"fixture"}' }],
    finishReason: { unified: 'tool-calls', raw: 'tool_calls' } },
  { ...common, content: [{ type: 'text', text: '1250' }], finishReason: { unified: 'stop', raw: 'stop' } },
] });
const handler = new MIMORIVercelAIHandler({ apiKey: 'native-test-only', agentName: 'native-vercel' });
const result = await generateText({ model, prompt: 'Check balance', stopWhen: stepCountIs(2),
  tools: { balance: tool({ description: 'Fixture balance', inputSchema: z.object({ account: z.string() }), execute: async () => 1250 }) },
  ...handler.generateTextConfig() });
await handler.close();
assert.equal(result.text, '1250');
assert.equal(events.find(e => e.event_type === 'tool_start').payload.input, '{"account":"fixture"}');
assert.equal(events.find(e => e.event_type === 'tool_end').payload.output, '1250');
assert.equal(events.find(e => e.event_type === 'llm_end').payload.response, '1250');
assert.deepEqual(events.map(e => e.sequence_number), [1, 2, 3]);
console.log('Native Vercel AI SDK tool loop passed; input/output preserved and telemetry awaited.');

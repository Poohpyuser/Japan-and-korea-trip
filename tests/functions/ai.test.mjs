// Run: npm run test:fn   (no network or API key needed: the Anthropic client is faked)
import assert from 'node:assert/strict';
import { createHandler } from '../../netlify/functions/ai.mjs';

const calls = [];
const fake = {
  messages: {
    parse: async (args) => { calls.push(args); return { stop_reason: 'end_turn', parsed_output: args.messages ? { reply: 'ok', places: [] } : null }; },
  },
};
const post = (body, headers = {}) => new Request('http://x/api/ai', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const run = async (h, req) => { const r = await h(req); return [r.status, await r.json()]; };

const h = createHandler({ client: fake, env: { APP_PASSCODE: 'sesame' } });

let [s, j] = await run(h, new Request('http://x/api/ai'));
assert.equal(s, 405);
[s, j] = await run(h, post({ mode: 'chat', messages: [{ role: 'user', content: 'hi' }] }));
assert.equal(s, 401, 'passcode required');
[s, j] = await run(h, post({ mode: 'chat', messages: [{ role: 'user', content: 'hi' }] }, { 'x-passcode': 'wrong' }));
assert.equal(s, 401);
[s, j] = await run(h, post({ mode: 'nope' }, { 'x-passcode': 'sesame' }));
assert.equal(s, 400);
[s, j] = await run(h, post({ mode: 'extract', text: '  ' }, { 'x-passcode': 'sesame' }));
assert.equal(s, 400, 'empty extract');
[s, j] = await run(h, post({ mode: 'extract', images: [{ media_type: 'text/html', data: 'abc' }] }, { 'x-passcode': 'sesame' }));
assert.equal(s, 400, 'bad image type');
[s, j] = await run(h, post({ mode: 'chat', messages: [{ role: 'assistant', content: 'x' }] }, { 'x-passcode': 'sesame' }));
assert.equal(s, 400, 'must end with user');

[s, j] = await run(h, post({ mode: 'chat', context: '{"trip":1}', messages: [{ role: 'assistant', content: 'stale' }, { role: 'user', content: 'Where to eat ramen?' }] }, { 'x-passcode': 'sesame' }));
assert.equal(s, 200); assert.equal(j.ok, true); assert.equal(j.data.reply, 'ok');
const a = calls.at(-1);
assert.equal(a.model, 'claude-opus-5-5');
assert.equal(a.messages[0].role, 'user', 'leading assistant turn dropped');
assert.ok(a.output_config.format, 'structured output requested');
assert.equal(a.tool_choice, undefined, 'no forced tool choice (400 on current models)');
assert.equal(a.thinking, undefined);

[s, j] = await run(h, post({ mode: 'extract', text: 'caption: Ichiran Shibuya', images: [{ media_type: 'image/jpeg', data: 'QUJD' }] }, { 'x-passcode': 'sesame' }));
assert.equal(s, 200);
const c = calls.at(-1).messages[0].content;
assert.equal(c[0].type, 'image'); assert.equal(c.at(-1).type, 'text');

const open = createHandler({ client: fake, env: { AI_MODEL: 'claude-sonnet-5-5' } });
[s, j] = await run(open, post({ mode: 'planday', text: 'Day in Shibuya' }));
assert.equal(s, 200); assert.equal(calls.at(-1).model, 'claude-sonnet-5-5');

const refuse = createHandler({ client: { messages: { parse: async () => ({ stop_reason: 'refusal', parsed_output: null }) } }, env: {} });
[s, j] = await run(refuse, post({ mode: 'planday', text: 'x' }));
assert.equal(j.ok, false);

const boom = createHandler({ client: { messages: { parse: async () => { const e = new Error('x'); e.status = 429; throw e; } } }, env: {} });
[s, j] = await run(boom, post({ mode: 'planday', text: 'x' }));
assert.equal(s, 429);

const nokey = createHandler({ env: {} });
[s, j] = await run(nokey, post({ mode: 'planday', text: 'x' }));
assert.equal(s, 503); assert.equal(j.code, 'not_configured');
console.log('ai function: all checks passed');

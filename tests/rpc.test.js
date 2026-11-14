import test from 'node:test';
import assert from 'node:assert/strict';
import { RpcClient } from '../lib/rpc.js';
const client = () => new RpcClient({ command:process.execPath,args:['tests/fixtures/app-server.mjs'],timeout:200 });
test('JSONL framing handles fragmented UTF8 and correlates concurrent calls', async t => {
  const c=client(); t.after(()=>c.close());
  const a=await c.request('fragment');
  const [b,other]=await Promise.all([c.request('initialize'),c.request('initialize')]);
  assert.equal(other.userAgent,'fixture');
  assert.equal(a.text,'Русский'); assert.equal(b.userAgent,'fixture');
});
test('child crash rejects all pending requests', async t => {
  const c=client(); t.after(()=>c.close());
  const a=c.request('hang'); const b=c.request('exit');
  const out=await Promise.allSettled([a,b]);
  assert.equal(out.every(x=>x.status==='rejected'),true);
});
test('invalid JSON fails closed and pending call times out', async t => {
  const c=client(); t.after(()=>c.close());
  await assert.rejects(c.request('malformed'),/protocol/i);
  const d=client(); t.after(()=>d.close());
  await assert.rejects(d.request('hang'),/timeout/i);
});

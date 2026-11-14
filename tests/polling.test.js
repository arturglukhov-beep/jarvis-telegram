import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyBot, poll } from '../lib/polling.js';
import { acquireLock } from '../lib/runtime.js';
test('startup rejects another bot before polling or sending messages',async()=>{
 let touched=false; const bot={init:async()=>{},botInfo:{username:'wrong_bot'},api:{getWebhookInfo:async()=>{touched=true;}}};
 await assert.rejects(verifyBot(bot,'bestsled1126_bot'),/другому/); assert.equal(touched,false);
});
test('existing webhook stops startup and is never deleted',async()=>{
 const bot={init:async()=>{},botInfo:{username:'bestsled1126_bot'},api:{getWebhookInfo:async()=>({url:'https://example.org/hook'})}};
 await assert.rejects(verifyBot(bot,'bestsled1126_bot'),/webhook/);
});
test('polling resumes saved offset and does not discard pending updates',async()=>{
 const c=new AbortController(); const received=[];
 const app={bot:{api:{getUpdates:async p=>{assert.equal(p.offset,42);return [{update_id:42}];}},handleUpdate:async u=>{received.push(u.update_id);c.abort();}}};
 await poll(app,{value:{lastUpdate:41}},c.signal);assert.deepEqual(received,[42]);
});
test('second poller conflict fails rather than retrying and competing',async()=>{
 const app={bot:{api:{getUpdates:async()=>{throw {error_code:409};}}}};
 await assert.rejects(poll(app,{value:{lastUpdate:-1}},new AbortController().signal),/второй/);
});
test('process lock prevents two copies and releases when closed',async()=>{
 const name='jarvis-lock-test-'+process.pid;const a=await acquireLock(name);
 try {await assert.rejects(acquireLock(name),/экземпляр/);} finally {await new Promise(r=>a.close(r));}
 const b=await acquireLock(name);await new Promise(r=>b.close(r));
});

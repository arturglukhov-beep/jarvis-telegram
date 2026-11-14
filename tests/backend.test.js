import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodexBackend } from '../lib/codex.js';
import { AgentService } from '../lib/service.js';
import { StateStore } from '../lib/state.js';
import { RpcClient } from '../lib/rpc.js';
const backend = () => new CodexBackend({},()=>new RpcClient({command:process.execPath,args:['tests/fixtures/app-server.mjs'],timeout:1000}));
test('Codex starts and resumes thread without duplicating streamed text', async () => {
  const b=backend(); let saved;
  const a=await b.run({prompt:'hello',onThread:id=>saved=id});
  const next=await b.run({prompt:'hello again',threadId:saved});
  assert.equal(a.text,'Ответ Jarvis'); assert.equal(next.threadId,saved);
});
test('tool approval is declined and never executed in text-only mode', async () => {
  const b=backend(); const r=await b.run({prompt:'approval'});
  assert.equal(r.text,'Ответ Jarvis');
});
test('failed turn and crashed process reject instead of returning success', async () => {
  await assert.rejects(backend().run({prompt:'failure'}),/Codex/);
  await assert.rejects(backend().run({prompt:'crash'}),/Codex/);
});
test('aborting while a turn runs promptly rejects it', async () => {
  const c=new AbortController(); const b=backend();
  const result=b.run({prompt:'slow',signal:c.signal,onThread:()=>setTimeout(()=>c.abort(),25)});
  await assert.rejects(result,/останов|abort/i);
});
test('service serializes work and persists threads across restart', async () => {
  const store=new StateStore(mkdtempSync(join(tmpdir(),'jarvis-service-')));
  const service=new AgentService(backend(),store);
  const [a,b]=await Promise.all([service.submit('123','one'),service.submit('123','two')]);
  assert.equal(a.threadId,b.threadId);
  const after=new AgentService(backend(),new StateStore(join(store.path,'..')));
  const c=await after.submit('123','three'); assert.equal(c.threadId,a.threadId);
});
test('stop cancels queued work and new dialog preserves old history in Codex', async () => {
  const store=new StateStore(mkdtempSync(join(tmpdir(),'jarvis-stop-')));
  const service=new AgentService(backend(),store);
  const a=service.submit('123','slow'); const b=service.submit('123','two');
  setTimeout(()=>service.stop(),80);
  const out=await Promise.allSettled([a,b]); assert.equal(out.every(x=>x.status==='rejected'),true);
  const r=await service.submit('123','next'); assert.equal(r.text,'Ответ Jarvis');
  service.newDialog('123'); assert.equal(store.session('123'),null);
});
test('queued attachment preparation is cancelled by /stop before model execution',async()=>{
 const store=new StateStore(mkdtempSync(join(tmpdir(),'jarvis-prep-')));let runs=0;
 const service=new AgentService({run:async()=>{runs++;return{text:'unexpected'};}},store);
 const pending=service.submit('123','',{prepare:signal=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('Запрос остановлен')),{once:true});})});
 setTimeout(()=>service.stop(),20);await assert.rejects(pending,/останов/);assert.equal(runs,0);
});

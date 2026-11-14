import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTelegram,splitText,redact } from '../lib/telegram.js';
import { StateStore } from '../lib/state.js';
import { AgentService } from '../lib/service.js';
import { CodexBackend } from '../lib/codex.js';
import { RpcClient } from '../lib/rpc.js';
import { loadSecrets } from '../lib/secrets.js';
const info={id:999,is_bot:true,first_name:'Jarvis',username:'bestsled1126_bot',can_join_groups:false,can_read_all_group_messages:false,supports_inline_queries:false};
test('Telegram owner -> real controller/queue/RPC child -> response; restart resumes thread',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'jarvis-e2e-')); const config={ownerId:'123',token:'999:fake-token'}; const deliveries=[];
 const factory=()=>new RpcClient({command:process.execPath,args:['tests/fixtures/app-server.mjs'],timeout:2000});
 const options={botInfo:info,client:{fetch:async(url,opts)=>{deliveries.push({method:String(url).split('/').pop(),body:JSON.parse(opts.body)});return new Response(JSON.stringify({ok:true,result:{message_id:1,date:0,chat:{id:123,type:'private'},text:'ok'}}),{headers:{'content-type':'application/json'}});}}};
 let store=new StateStore(dir); let service=new AgentService(new CodexBackend({},factory),store);
 let app=createTelegram(config,store,service,()=> 'Артур, предприниматель',options);
 const msg=id=>({update_id:id,message:{message_id:id,date:0,chat:{id:123,type:'private'},from:{id:123,is_bot:false,first_name:'Artur'},text:'Привет'}});
 await app.bot.handleUpdate(msg(1));await app.drain(); const thread=store.session('123');
 assert.ok(thread);assert.equal(deliveries[0].body.text,'Ответ Jarvis');await service.close();
 store=new StateStore(dir);service=new AgentService(new CodexBackend({},factory),store);
 app=createTelegram(config,store,service,()=> 'Артур, предприниматель',options);
 await app.bot.handleUpdate(msg(2));await app.drain();assert.equal(store.session('123'),thread);assert.equal(deliveries.length,2);await service.close();
});
test('secret config rejects world-readable files before loading any value',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jarvis-secret-')); const path=join(dir,'env');writeFileSync(path,'JARVIS_TEST_SECRET=hidden\n');chmodSync(path,0o644);
 assert.throws(()=>loadSecrets(path),/прав/);assert.equal(process.env.JARVIS_TEST_SECRET,undefined);
 chmodSync(path,0o600);assert.equal(loadSecrets(path),true);assert.equal(process.env.JARVIS_TEST_SECRET,'hidden');delete process.env.JARVIS_TEST_SECRET;
});
test('long unicode replies are split below Telegram limit without broken emoji',()=>{
 const parts=splitText('🙂'.repeat(4000));assert.equal(parts.join(''),'🙂'.repeat(4000));assert.equal(parts.every(s=>s.length<=3500 && s.isWellFormed()),true);
});
test('known bot tokens and bearer credentials never appear in responses',()=>{
 const value=redact('private-token Bearer abc.def sk-12345678901234567890',['private-token']);
 assert.doesNotMatch(value,/private-token|abc.def|sk-12345678901234567890/);
});

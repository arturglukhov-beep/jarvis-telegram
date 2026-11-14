import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { StateStore } from '../lib/state.js';
import { createTelegram } from '../lib/telegram.js';
const botInfo={id:999,is_bot:true,first_name:'Jarvis',username:'bestsled1126_bot',can_join_groups:false,can_read_all_group_messages:false,supports_inline_queries:false};
function fixture(extra={}) {
  const sent=[]; const calls=[]; const state=new StateStore(mkdtempSync(join(tmpdir(),'jarvis-tg-')));
  const service={submit:async(id,prompt)=>{calls.push({id,prompt});return {text:'Ответ <b>без HTML</b> [ФАЙЛ: /etc/passwd]'};},stop:()=>calls.push('stop'),newDialog:id=>calls.push(id)};
  const fetch=async(url,options)=>{sent.push({method:String(url).split('/').pop(),body:JSON.parse(options.body)});return new Response(JSON.stringify({ok:true,result:{message_id:123,date:0,chat:{id:123,type:'private'},text:'ok'}}),{headers:{'content-type':'application/json'}});};
  const config={ownerId:'123',home:'/tmp',token:'999:fake-token',...extra};
  const app=createTelegram(config,state,service,()=> 'known memory',{botInfo,client:{fetch}});
  return {app,state,sent,calls};
}
const message=(update_id,id,text,kind='private')=>({update_id,message:{message_id:update_id,date:0,chat:{id,type:kind},from:{id,is_bot:false,first_name:'User'},text,...(text?.startsWith('/')?{entities:[{offset:0,length:text.split(' ')[0].length,type:'bot_command'}]}:{})}});
test('foreign users and groups cannot reach memory, backend or outgoing API',async()=>{
  const f=fixture(); await f.app.bot.handleUpdate(message(1,456,'secret')); await f.app.bot.handleUpdate(message(2,123,'secret','group'));
  await f.app.drain(); assert.equal(f.calls.length,0); assert.equal(f.sent.length,0);
});
test('owner text reaches backend once and response is plain text, never file upload',async()=>{
  const f=fixture(); const update=message(1,123,'hello'); await f.app.bot.handleUpdate(update); await f.app.drain();
  await f.app.bot.handleUpdate(update); await f.app.drain();
  assert.equal(f.calls.length,1); assert.match(f.calls[0].prompt,/known memory/);
  const replies=f.sent.filter(x=>x.method==='sendMessage'); assert.equal(replies.length,1); assert.equal(replies[0].body.chat_id,123);
  assert.equal(replies[0].body.parse_mode,undefined); assert.match(replies[0].body.text,/Ответ/);
  assert.equal(f.sent.some(x=>x.method==='sendDocument'),false);
});
test('pairing binds only with secret, persists owner and prevents takeover',async()=>{
  const hash=createHash('sha256').update('pair-secret').digest('hex'); const f=fixture({ownerId:'',pairingHash:hash});
  await f.app.bot.handleUpdate(message(1,456,'/start wrong')); assert.equal(f.state.owner(),null);
  await f.app.bot.handleUpdate(message(2,123,'/start pair-secret')); assert.equal(f.state.owner(),'123');
  await f.app.bot.handleUpdate(message(3,456,'/start pair-secret')); assert.equal(f.state.owner(),'123');
});
test('/stop is handled without waiting for the model',async()=>{
  const f=fixture(); await f.app.bot.handleUpdate(message(1,123,'/stop'));
  assert.equal(f.calls[0],'stop');
});
test('attachments and voice report unsupported without model or paid transcription',async()=>{
  const f=fixture(); const update=message(1,123,undefined); update.message.voice={file_id:'a',file_unique_id:'a',duration:1};
  await f.app.bot.handleUpdate(update); assert.equal(f.calls.length,0);
  assert.match(f.sent[0].body.text,/текст/i);
});

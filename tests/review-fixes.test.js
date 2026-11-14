import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyBot } from '../lib/polling.js';
import { createTelegram } from '../lib/telegram.js';
import { StateStore } from '../lib/state.js';
const fresh=()=>mkdtempSync(join(tmpdir(),'jarvis-review-'));
test('corrupt state and owner conflict terminate startup instead of holding process lock',()=>{
 for(const content of ['INVALID',JSON.stringify({version:1,ownerId:'456',sessions:{},lastUpdate:-1})]) {
  const home=fresh();const data=join(home,'data');mkdirSync(data);
  for(const name of ['SOUL.md','MEMORY.md','GOALS.md'])writeFileSync(join(home,name),'fixture memory');
  writeFileSync(join(data,'state.json'),content);
  const result=spawnSync(process.execPath,['index.js'],{env:{PATH:process.env.PATH,HOME:process.env.HOME,BOT_TOKEN:'999:fake-token',OWNER_ID:'123',JARVIS_HOME:home,DATA_DIR:data,CODEX_BIN:process.execPath},encoding:'utf8',timeout:2000});
  assert.equal(result.error?.code,undefined,'startup must not hang with an open lock');assert.equal(result.status,1);
 }
});
test('shutdown aborts Telegram preflight immediately',async()=>{
 const controller=new AbortController();let sawAbort=false;
 const bot={botInfo:{username:'bestsled1126_bot'},init:signal=>new Promise((resolve,reject)=>{
   const timer=setTimeout(resolve,250);
   signal?.addEventListener('abort',()=>{clearTimeout(timer);sawAbort=true;reject(new Error('aborted'));},{once:true});
 }),api:{getWebhookInfo:async()=>({url:''})}};
 const p=verifyBot(bot,'bestsled1126_bot',controller.signal);controller.abort();
 await assert.rejects(p,/abort/);assert.equal(sawAbort,true);
});
test('shutdown aborts pending Telegram delivery instead of waiting SDK default timeout',async()=>{
 const controller=new AbortController();let started;const ready=new Promise(r=>started=r);
 const info={id:999,is_bot:true,first_name:'Jarvis',username:'bestsled1126_bot'};
 const fetch=async(url,options)=>new Promise((resolve,reject)=>{
  started();const timer=setTimeout(()=>resolve(new Response(JSON.stringify({ok:true,result:{}}))),250);
  options.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('aborted'));},{once:true});
 });
 const app=createTelegram({ownerId:'123',token:'999:fake'},new StateStore(fresh()),{},()=>'',{botInfo:info,client:{fetch}},controller.signal);
 const pending=app.send(123,'reply');await ready;controller.abort();await assert.rejects(pending,/abort|network/i);
});

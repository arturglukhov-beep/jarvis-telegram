import test from'node:test';import assert from'node:assert/strict';import{mkdtempSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{createTelegram}from'../lib/telegram.js';import{StateStore}from'../lib/state.js';
const info={id:999,is_bot:true,first_name:'J',username:'bestsled1126_bot'};
const msg=(id,text)=>({update_id:id,message:{message_id:id,date:0,chat:{id:123,type:'private'},from:{id:123,is_bot:false,first_name:'A'},text,...(text.startsWith('/')?{entities:[{offset:0,length:text.length,type:'bot_command'}]}:{})}});
test('command callback returns promptly and /stop aborts the running action',async t=>{
 const sent=[];let resolveAction;let sawAbort=false;
 const actions={reminders:{list:()=>[]},prepare:()=>({action:{type:'command',id:'job',argv:['python3','--version'],cwd:'demo',hash:'test-hash'},preview:'Команда test'}),execute:(a,{signal}={})=>new Promise((resolve,reject)=>{resolveAction=resolve;signal?.addEventListener('abort',()=>{sawAbort=true;reject(new Error('Команда остановлена'));},{once:true});})};
 const service={submit:async()=>({text:'{"text":"Готово к подтверждению","actions":[{"kind":"command"}]}'}),stop:()=>{}};
 const fetch=async(url,opts)=>{const body=JSON.parse(opts.body);sent.push(body);return new Response(JSON.stringify({ok:true,result:{message_id:sent.length,date:0,chat:{id:123,type:'private'},text:'ok'}}),{headers:{'content-type':'application/json'}});};
 const app=createTelegram({ownerId:'123',token:'999:fake'},new StateStore(mkdtempSync(join(tmpdir(),'jarvis-ui-cmd-'))),service,()=>'',{botInfo:info,client:{fetch}},undefined,{actions});
 await app.bot.handleUpdate(msg(1,'Запусти'));await app.drain();const data=sent.find(x=>x.reply_markup).reply_markup.inline_keyboard[0][0].callback_data;
 let returned=false;const callback=app.bot.handleUpdate({update_id:2,callback_query:{id:'c',chat_instance:'x',from:{id:123,is_bot:false,first_name:'A'},data,message:{message_id:2,date:0,chat:{id:123,type:'private'},text:'confirm'}}}).then(()=>returned=true);
 t.after(async()=>{resolveAction?.({text:'cleanup'});await callback;});
 await new Promise(r=>setTimeout(r,40));assert.equal(returned,true,'polling must remain able to receive /stop');await app.bot.handleUpdate(msg(3,'/stop'));await app.drain();assert.equal(sawAbort,true);
});

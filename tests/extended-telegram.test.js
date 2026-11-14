import test from'node:test';import assert from'node:assert/strict';import{mkdtempSync,existsSync,readFileSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{createTelegram}from'../lib/telegram.js';import{StateStore}from'../lib/state.js';import{ScopedFiles}from'../lib/files.js';import{Reminders}from'../lib/reminders.js';import{ActionController}from'../lib/actions.js';
const fresh=()=>mkdtempSync(join(tmpdir(),'jarvis-ui-'));
const info={id:999,is_bot:true,first_name:'Jarvis',username:'bestsled1126_bot'};
const msg=(id,text)=>({update_id:id,message:{message_id:id,date:0,chat:{id:123,type:'private'},from:{id:123,is_bot:false,first_name:'A'},text}});
const callback=(id,data,user=123)=>({update_id:id,callback_query:{id:'query'+id,chat_instance:'test',data,from:{id:user,is_bot:false,first_name:'A'},message:{message_id:99,date:0,chat:{id:123,type:'private'},text:'Confirm'}}});
function fixture(action){
 const root=fresh();const sent=[];const reminders=new Reminders(fresh());const actions=new ActionController(new ScopedFiles(root,fresh()),reminders);
 const fetch=async(url,opts)=>{const method=String(url).split('/').pop();const body=typeof opts.body==='string'?JSON.parse(opts.body):{};sent.push({method,body});return new Response(JSON.stringify({ok:true,result:{message_id:1,date:0,chat:{id:123,type:'private'},text:'ok'}}),{headers:{'content-type':'application/json'}});};
 const service={submit:async()=>({text:JSON.stringify({text:'Подготовлено',actions:[action]})}),stop:()=>{}};
 const app=createTelegram({ownerId:'123',token:'999:fake',enhanced:true},new StateStore(fresh()),service,()=>'',{botInfo:info,client:{fetch}},undefined,{actions});
 return{root,sent,app,reminders};
}
test('model file proposal requires owner callback; foreign and repeated callbacks cannot write',async()=>{
 const f=fixture({kind:'write_file',path:'demo/file.txt',content:'Test content'});await f.app.bot.handleUpdate(msg(1,'Создай файл'));await f.app.drain();assert.equal(existsSync(join(f.root,'demo/file.txt')),false);
 const button=f.sent.find(x=>x.body.reply_markup)?.body.reply_markup.inline_keyboard[0][0].callback_data;assert.ok(button);
 await f.app.bot.handleUpdate(callback(2,button,456));assert.equal(existsSync(join(f.root,'demo/file.txt')),false);
 await f.app.bot.handleUpdate(callback(3,button));await f.app.drain();assert.equal(readFileSync(join(f.root,'demo/file.txt'),'utf8'),'Test content');
 await f.app.bot.handleUpdate(callback(4,button));assert.equal(f.sent.filter(x=>x.method==='sendDocument').length,1);
});
test('reminder stays absent until its exact text and time are confirmed',async()=>{
 const f=fixture({kind:'reminder',text:'Позвонить',at:new Date(Date.now()+3600000).toISOString()});await f.app.bot.handleUpdate(msg(1,'Напомни'));await f.app.drain();assert.equal(f.reminders.list().length,0);
 const button=f.sent.find(x=>x.body.reply_markup)?.body.reply_markup.inline_keyboard[0][0].callback_data;await f.app.bot.handleUpdate(callback(2,button));await f.app.drain();assert.equal(f.reminders.list().length,1);
});
test('confirmation visibly identifies its file and references the exact preview',async()=>{
 const f=fixture({kind:'write_file',path:'demo/identity.txt',content:'Approved content'});await f.app.bot.handleUpdate(msg(1,'Создай файл'));await f.app.drain();
 const button=f.sent.find(x=>x.body.reply_markup);assert.match(button.body.text,/demo\/identity.txt/);assert.ok(Number.isInteger(button.body.reply_parameters?.message_id));
});

import test from'node:test';import assert from'node:assert/strict';import{mkdtempSync,existsSync,readFileSync,writeFileSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{ActionController,parseReply,responseSchema}from'../lib/actions.js';import{ScopedFiles}from'../lib/files.js';import{Reminders}from'../lib/reminders.js';
const fresh=()=>mkdtempSync(join(tmpdir(),'jarvis-action-'));
test('structured output prepares a file without writing until explicit execution',async()=>{
 const root=fresh();const c=new ActionController(new ScopedFiles(root,fresh()),new Reminders(fresh()));const p=c.prepare({kind:'write_file',path:'demo/a.txt',content:'Пример'});
 assert.equal(existsSync(join(root,'demo/a.txt')),false);assert.match(p.preview,/Пример/);await c.execute(p.action);assert.equal(readFileSync(join(root,'demo/a.txt'),'utf8'),'Пример');
});
test('reminder proposal does not schedule anything before confirmation',async()=>{
 const r=new Reminders(fresh());const c=new ActionController(new ScopedFiles(fresh(),fresh()),r);const p=c.prepare({kind:'reminder',text:'Позвонить',at:new Date(Date.now()+3600000).toISOString()});assert.equal(r.list().length,0);await c.execute(p.action);assert.equal(r.list().length,1);
});
test('unknown actions and native shell remain blocked',()=>{
 const c=new ActionController(new ScopedFiles(fresh(),fresh()),new Reminders(fresh()));assert.throws(()=>c.prepare({kind:'send_message',chat:'456'}));assert.throws(()=>c.prepare({kind:'command',argv:['rm','-rf','/']}),/изоляц/i);
});
test('plain model text cannot become an action and malformed envelopes fail closed',()=>{
 assert.deepEqual(parseReply('rm -rf /'),{text:'rm -rf /',actions:[]});assert.throws(()=>parseReply('{"text":"ok","actions":[1,2,3,4]}'));
 assert.equal(responseSchema.additionalProperties,false);
});
test('reading a long file includes the complete file as an attachment',async()=>{
 const root=fresh();const text='x'.repeat(100000);writeFileSync(join(root,'large.txt'),text);
 const c=new ActionController(new ScopedFiles(root,fresh()),new Reminders(fresh()));const result=await c.execute(c.prepare({kind:'read_file',path:'large.txt'}).action);
 assert.equal(result.file.content.length,100000);assert.match(result.text,/вложен/i);
});

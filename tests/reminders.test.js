import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import{Reminders}from'../lib/reminders.js';
const fresh=()=>mkdtempSync(join(tmpdir(),'jarvis-reminders-'));
test('one-time reminder persists and sends exactly one attempt to the owner',async()=>{
 const dir=fresh();const now=Date.parse('2026-11-14T00:00:00Z');const r=new Reminders(dir);const task=r.add({text:'Собрание',at:'2026-11-14T12:01:00+12:00'},now);
 const after=new Reminders(dir);const sent=[];await after.tick(now+60000,async text=>sent.push(text));await after.tick(now+60001,async text=>sent.push(text));
 assert.equal(sent.length,1);assert.match(sent[0],/Собрание/);assert.equal(after.list().find(x=>x.id===task.id).status,'done');
});
test('daily reminder repeats next Kamchatka day, not again in the same minute',async()=>{
 const now=Date.parse('2026-11-14T12:59:00Z');const r=new Reminders(fresh());r.add({text:'План дня',daily:'01:00'},now);const sent=[];
 await r.tick(now+60000,t=>sent.push(t));await r.tick(now+61000,t=>sent.push(t));await r.tick(now+86460000,t=>sent.push(t));assert.equal(sent.length,2);
});
test('failed delivery is unknown and never automatically retried after restart',async()=>{
 const dir=fresh();const now=Date.now();const r=new Reminders(dir);r.add({text:'Тест',at:new Date(now+1000).toISOString()},now);let attempts=0;
 await r.tick(now+1000,async()=>{attempts++;throw new Error('network');});const after=new Reminders(dir);await after.tick(now+2000,async()=>{attempts++;});
 assert.equal(attempts,1);assert.equal(after.list()[0].status,'unknown');
});
test('past tasks missed during downtime are marked missed and cancellation retains history',async()=>{
 const now=Date.now();const r=new Reminders(fresh());const t=r.add({text:'Срок',at:new Date(now+1000).toISOString()},now);
 r.recover(now+120000);let sent=0;await r.tick(now+120000,async()=>sent++);assert.equal(sent,0);assert.equal(r.list()[0].status,'missed');r.cancel(t.id);assert.equal(r.list()[0].status,'cancelled');
});
test('cancelling a reminder during successful or failed delivery cannot revive it',async()=>{
 for(const fail of[false,true]){
  const now=Date.parse('2026-11-14T12:59:00Z');const r=new Reminders(fresh());const task=r.add({text:'Отменить',daily:'01:00'},now);let release;const wait=new Promise(resolve=>release=resolve);
  const tick=r.tick(now+60000,async()=>{await wait;if(fail)throw new Error('network');});
  r.cancel(task.id);release();await tick;assert.equal(r.list()[0].status,'cancelled');let sent=0;await r.tick(now+86460000,async()=>sent++);assert.equal(sent,0);
 }
});

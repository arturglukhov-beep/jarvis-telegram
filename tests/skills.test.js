import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillCatalog } from '../lib/skills.js';
import { CodexBackend } from '../lib/codex.js';
import { RpcClient } from '../lib/rpc.js';
function fixture(){
 const home=mkdtempSync(join(tmpdir(),'jarvis-skills-'));
 const put=(group,name,text)=>{const dir=join(home,'skills',group,name);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'SKILL.md'),`---\nname: ${name}\ndescription: Example instructions\n---\n${text}`);return dir;};
 return{home,put};
}
test('installed project skills are discoverable and duplicate custom instructions take precedence',()=>{
 const f=fixture();f.put('global','content-creator','GLOBAL');f.put('custom','content-creator','CUSTOM');f.put('custom','discovery-interview','ASK QUESTIONS');
 const c=new SkillCatalog(f.home);assert.deepEqual(c.list().map(x=>x.name),['content-creator','discovery-interview']);assert.match(c.read('content-creator'),/CUSTOM/);
});
test('legacy Markdown skills without YAML remain usable',()=>{
 const f=fixture();const dir=f.put('custom','code-review','');writeFileSync(join(dir,'SKILL.md'),'# Скилл: Анализ кода\n\nПроверь ошибки в коде.');
 const c=new SkillCatalog(f.home);assert.deepEqual(c.list().map(x=>x.name),['code-review']);assert.match(c.read('code-review'),/Проверь/);
});
test('legacy thread loads requested instructions internally and returns only the final answer',async()=>{
 const f=fixture();f.put('custom','discovery-interview','MAGIC_INTERVIEW_RULE');
 const b=new CodexBackend({enhanced:true,home:f.home},()=>new RpcClient({command:process.execPath,args:['tests/fixtures/app-server.mjs'],timeout:2000}));
 const result=await b.run({prompt:'skills-probe',threadId:'legacy-thread'});
 assert.equal(result.threadId,'legacy-thread');assert.deepEqual(JSON.parse(result.text),{text:'Какую проблему решает Ваш проект?',actions:[]});
});
test('unavailable skill requests stop instead of leaking internal actions to Telegram',async()=>{
 const f=fixture();const b=new CodexBackend({enhanced:true,home:f.home},()=>new RpcClient({command:process.execPath,args:['tests/fixtures/app-server.mjs'],timeout:2000}));
 await assert.rejects(b.run({prompt:'skills-probe',threadId:'legacy-thread'}),/Скилл/);
});
test('skill reads cannot escape the approved catalog, follow symlinks or load oversized instructions',()=>{
 const f=fixture();const dir=f.put('custom','valid','OK');writeFileSync(join(f.home,'secret.md'),'PRIVATE');
 symlinkSync(join(f.home,'secret.md'),join(dir,'reference.md'));const linked=join(f.home,'skills/custom/linked');symlinkSync(dir,linked);
 const huge=f.put('custom','huge','x'.repeat(70000));const c=new SkillCatalog(f.home);
 assert.deepEqual(c.list().map(x=>x.name),['valid']);for(const name of ['../secret.md','linked','valid/reference.md','huge'])assert.throws(()=>c.read(name));
 writeFileSync(join(dir,'SKILL.md'),'CHANGED');assert.throws(()=>c.read('valid'),/измен/);
});

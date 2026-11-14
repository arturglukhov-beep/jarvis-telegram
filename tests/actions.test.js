import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,linkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ScopedFiles} from '../lib/files.js';
import {Approvals} from '../lib/approvals.js';
const fresh=()=>mkdtempSync(join(tmpdir(),'jarvis-files-'));
test('file changes are scoped and old content is backed up before replacement',()=>{
 const root=fresh();const backup=fresh();mkdirSync(join(root,'demo'));writeFileSync(join(root,'demo/a.txt'),'before');
 const files=new ScopedFiles(root,backup);const p=files.prepare('demo/a.txt','after');files.apply(p);
 assert.equal(files.read('demo/a.txt'),'after');assert.equal(readFileSync(p.backupPath,'utf8'),'before');
});
test('traversal, secret names and bot self-modification are denied',()=>{
 const files=new ScopedFiles(fresh(),fresh());
 for(const path of ['../outside.txt','.env','demo/.git/config','demo/secrets.json','jarvis-telegram/index.js','tgbotdorabotka/PLAN.md']) assert.throws(()=>files.prepare(path,'bad'),/запрещ|каталог|пут/i);
});
test('symlinks and hardlinks cannot expose or overwrite outside files',()=>{
 const root=fresh();const outside=fresh();writeFileSync(join(outside,'secret.txt'),'private');
 symlinkSync(outside,join(root,'alias'));linkSync(join(outside,'secret.txt'),join(root,'hard.txt'));
 const files=new ScopedFiles(root,fresh());assert.throws(()=>files.read('alias/secret.txt'));assert.throws(()=>files.prepare('hard.txt','bad'));
 assert.equal(readFileSync(join(outside,'secret.txt'),'utf8'),'private');
});
test('file changed while approval was pending cannot be overwritten',()=>{
 const root=fresh();writeFileSync(join(root,'a.txt'),'before');const files=new ScopedFiles(root,fresh());const p=files.prepare('a.txt','new');writeFileSync(join(root,'a.txt'),'changed');
 assert.throws(()=>files.apply(p),/измен/i);assert.equal(readFileSync(join(root,'a.txt'),'utf8'),'changed');
});
test('approval binds owner, chat, expiry and one-time execution',()=>{
 let now=0;const a=new Approvals(()=>now);const id=a.create('123','123',{type:'write'});
 assert.throws(()=>a.take(id,'456','123'));assert.throws(()=>a.take(id,'123','456'));
 assert.equal(a.take(id,'123','123').type,'write');assert.throws(()=>a.take(id,'123','123'));
 const expired=a.create('123','123',{});now=301000;assert.throws(()=>a.take(expired,'123','123'));
});

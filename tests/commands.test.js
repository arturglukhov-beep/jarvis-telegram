import test from'node:test';import{spawnSync}from'node:child_process';import assert from'node:assert/strict';import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';import{Commands}from'../lib/commands.js';
const fresh=()=>mkdtempSync(join(tmpdir(),'jarvis-command-'));
function fixture(){const root=fresh();mkdirSync(join(root,'demo'));const data=fresh();writeFileSync(join(data,'sandbox-health.json'),JSON.stringify({ok:true,checkedAt:new Date().toISOString()}));return{root,data,commands:new Commands({projectsRoot:root,dataDir:data,jobBase:mkdtempSync('/var/tmp/jarvis-command-test-')})};}
test('commands fail closed without a successful sandbox check',()=>{
 const f=fixture();writeFileSync(join(f.data,'sandbox-health.json'),'{"ok":false}');assert.throws(()=>f.commands.prepare(['python3','--version'],'demo'),/изоляц/i);
});
test('command executes once in a frozen copy, without changing original project',async()=>{
 const f=fixture();writeFileSync(join(f.root,'demo/a.txt'),'original');const p=f.commands.prepare(['python3','-c',"from pathlib import Path; p=Path('a.txt'); print(p.read_text()); p.write_text('changed')"],'demo');
 writeFileSync(join(f.root,'demo/a.txt'),'new original');const out=await f.commands.run(p);assert.equal(out.exitCode,0);assert.match(out.stdout,/original/);assert.equal(readFileSync(join(f.root,'demo/a.txt'),'utf8'),'new original');await assert.rejects(f.commands.run(p),/повтор/i);
});
test('outside files, network and host credentials remain unavailable',async()=>{
 const f=fixture();const secret=join(f.root,'private.txt');writeFileSync(secret,'not available');
 const code=`from pathlib import Path; import socket\nchecks=[]\nfor action in [lambda:Path(${JSON.stringify(secret)}).read_text(),lambda:socket.create_connection(('1.1.1.1',80),timeout=1)]:\n try:action();checks.append(False)\n except OSError:checks.append(True)\nprint(all(checks))`;
 const out=await f.commands.run(f.commands.prepare(['python3','-c',code],'demo'));assert.equal(out.exitCode,0);assert.match(out.stdout,/True/);
});
test('aborting command stops its transient service and rejects delivery',async()=>{
 const f=fixture();const p=f.commands.prepare(['python3','-c','import time; time.sleep(20)'],'demo');const abort=new AbortController();const run=f.commands.run(p,{signal:abort.signal});setTimeout(()=>abort.abort(),400);await assert.rejects(run,/останов/i);
});
test('sandbox command cannot signal its host controller process',async()=>{
 const f=fixture();const code=`import os\ntry:os.kill(${process.pid},0);print('host visible')\nexcept (ProcessLookupError,PermissionError):print('isolated')`;
 const out=await f.commands.run(f.commands.prepare(['python3','-c',code],'demo'));assert.equal(out.exitCode,0);assert.match(out.stdout,/isolated/);
});
test('inherited object keys cannot pass the executable allowlist',()=>{
 const f=fixture();for(const name of['constructor','toString','__proto__'])assert.throws(()=>f.commands.prepare([name],'demo'),/Допустим/);
});
test('snapshot excludes auth and env data from the command-visible copy',()=>{
 const f=fixture();writeFileSync(join(f.root,'demo/auth.json'),'{"access_token":"synthetic"}');writeFileSync(join(f.root,'demo/env.json'),'{"BOT_TOKEN":"synthetic"}');
 const p=f.commands.prepare(['python3','--version'],'demo');const job=f.commands.jobs.get(p.id);const copy=job.snapshotDir||job.workspace;assert.equal(existsSync(join(copy,'auth.json')),false);assert.equal(existsSync(join(copy,'env.json')),false);
});
test('command output storage has a 64 MiB total filesystem capacity',async()=>{
 const f=fixture();const p=f.commands.prepare(['python3','-c',"import os; s=os.statvfs('.'); print(s.f_blocks*s.f_frsize)"],'demo');const result=await f.commands.run(p);assert.equal(result.exitCode,0);assert.ok(Number(result.stdout.trim())<=67108864);
});
test('nonexistent projects do not exhaust command job slots',()=>{
 const f=fixture();for(let i=0;i<31;i++)assert.throws(()=>f.commands.prepare(['python3','--version'],'missing'));
 assert.doesNotThrow(()=>f.commands.prepare(['python3','--version'],'demo'));
});
test('Node and npm run from public runtime without home access',async()=>{
 const f=fixture();for(const argv of[['node','--version'],['npm','--version']]){const r=await f.commands.run(f.commands.prepare(argv,'demo'));assert.equal(r.exitCode,0,r.stderr);assert.match(r.stdout,/\d+\.\d+\.\d+/);}
});
test('transient service actually applies resource and time limits',async()=>{
 const f=fixture();const action=f.commands.prepare(['python3','-c','import time; time.sleep(10)'],'demo');const abort=new AbortController();const pending=f.commands.run(action,{signal:abort.signal});
 try{let info='';for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,80));const r=spawnSync('/usr/bin/systemctl',['--user','show','jarvis-command-'+action.id+'.service','--property=MemoryMax','--property=TasksMax','--property=RuntimeMaxUSec','--property=NoNewPrivileges'],{encoding:'utf8'});info=r.stdout;if(info.includes('MemoryMax=536870912'))break;}
  assert.match(info,/MemoryMax=536870912/);assert.match(info,/TasksMax=32/);assert.match(info,/RuntimeMaxUSec=30s/);assert.match(info,/NoNewPrivileges=yes/);
 }finally{abort.abort();await pending.catch(()=>{});}
});
test('output is bounded and nonzero exit codes remain failures',async()=>{
 const f=fixture();const failed=await f.commands.run(f.commands.prepare(['python3','-c',"import sys; print('error',file=sys.stderr); sys.exit(3)"],'demo'));assert.equal(failed.exitCode,3);assert.match(failed.stderr,/error/);
 const large=await f.commands.run(f.commands.prepare(['python3','-c',"print('x'*250000)"],'demo'));assert.equal(large.exitCode,90);assert.ok(large.stdout.length<=200000);assert.match(large.stderr,/output limit/);
});
test('ordinary config files with literal credentials are not copied',()=>{
 const f=fixture();writeFileSync(join(f.root,'demo/config.json'),'{"access_token":"SYNTHETIC-CREDENTIAL"}');const p=f.commands.prepare(['python3','--version'],'demo');const job=f.commands.jobs.get(p.id);assert.equal(existsSync(join(job.snapshotDir,'config.json')),false);
});

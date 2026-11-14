import{mkdtempSync,mkdirSync,writeFileSync,symlinkSync}from'node:fs';import{join}from'node:path';import{spawnSync}from'node:child_process';
const base='/home/agent/.local/share/jarvis-telegram/sandbox-probes';mkdirSync(base,{recursive:true,mode:0o700});
const root=mkdtempSync(join(base,'probe-'));const allowed=join(root,'allowed');const blocked=join(root,'blocked');const home=join(root,'codex-home');
for(const dir of[allowed,blocked,home])mkdirSync(dir,{mode:0o700});
writeFileSync(join(allowed,'input.txt'),'allowed-test');writeFileSync(join(blocked,'private.txt'),'fake-secret-for-sandbox-test');symlinkSync(join(blocked,'private.txt'),join(allowed,'escape.txt'));
writeFileSync(join(allowed,'.jarvis-root'),'');
const config=`default_permissions = "probe"\nproject_root_markers = [".jarvis-root"]\n[permissions.probe.filesystem]\n":minimal" = "read"\n${JSON.stringify(allowed)} = "write"\n[permissions.probe.network]\nenabled = false\n`;
writeFileSync(join(home,'config.toml'),config,{mode:0o600});
const code=`import json,socket,pathlib\na=pathlib.Path(${JSON.stringify(allowed)})\nb=pathlib.Path(${JSON.stringify(blocked)})\nr={}\nr['allowed_read']=a.joinpath('input.txt').read_text()=='allowed-test'\na.joinpath('output.txt').write_text('ok')\nr['allowed_write']=True\nfor key,fn in [('blocked_read',lambda:b.joinpath('private.txt').read_text()),('blocked_write',lambda:b.joinpath('new.txt').write_text('bad')),('symlink_escape',lambda:a.joinpath('escape.txt').read_text()),('network',lambda:socket.create_connection(('1.1.1.1',80),timeout=2))]:\n try:fn();r[key]=False\n except (PermissionError,OSError):r[key]=True\nprint(json.dumps(r))\n`;
const env={PATH:process.env.PATH,HOME:process.env.HOME,CODEX_HOME:home};
const result=spawnSync('/usr/bin/setpriv',['--no-new-privs','/home/agent/.local/bin/jarvis-codex','sandbox','-P','probe','-C',allowed,'/usr/bin/python3','-c',code],{env,cwd:allowed,encoding:'utf8',timeout:15000});
let checks={};try{checks=JSON.parse(result.stdout);}catch{}
const ok=result.status===0&&['allowed_read','allowed_write','blocked_read','blocked_write','symlink_escape','network'].every(x=>checks[x]===true);
console.log(JSON.stringify({isolationReady:ok,checks,diagnostic:ok?null:(result.stderr||result.error?.message||'sandbox failed').slice(0,600)},null,2));
writeFileSync('/home/agent/.local/share/jarvis-telegram/sandbox-health.json',JSON.stringify({ok,checkedAt:new Date().toISOString(),checks}),{mode:0o600});
if(!ok)process.exitCode=1;

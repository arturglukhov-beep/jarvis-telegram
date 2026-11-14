import*as fs from'node:fs';import{join}from'node:path';import{randomUUID}from'node:crypto';import{execFile,spawnSync}from'node:child_process';import{promisify}from'node:util';import{snapshot,validateProject}from'./command-snapshot.js';import{sandboxLaunch}from'./command-launch.js';
const run=promisify(execFile);const runtimeRoot=`/var/tmp/jarvis-command-runtime-${process.getuid()}`;const nodeRoot=join(runtimeRoot,'node');const codex=join(runtimeRoot,'jarvis-codex');
const programs={node:[join(nodeRoot,'bin/node')],python3:['/usr/bin/python3'],npm:[join(nodeRoot,'bin/node'),join(nodeRoot,'lib/node_modules/npm/bin/npm-cli.js')],bash:['/bin/bash'],sh:['/bin/sh'],git:['/usr/bin/git'],ls:['/usr/bin/ls'],pwd:['/usr/bin/pwd']};
export class Commands{
 constructor(config){this.root=config.projectsRoot;this.data=config.dataDir;this.jobs=new Map();this.busy=false;this.jobBase=config.jobBase||`/var/tmp/jarvis-command-jobs-${process.getuid()}`;}
 ready(){try{let h=JSON.parse(fs.readFileSync(join(this.data,'sandbox-health.json'),'utf8'));if(h.ok===true&&Date.now()-Date.parse(h.checkedAt)>=86400000&&this.data==='/home/agent/.local/share/jarvis-telegram'){spawnSync(process.execPath,[join(import.meta.dirname,'../scripts/check-sandbox.js')],{env:{PATH:process.env.PATH,HOME:process.env.HOME},timeout:20000,maxBuffer:10000});h=JSON.parse(fs.readFileSync(join(this.data,'sandbox-health.json'),'utf8'));}return h.ok===true&&Date.now()-Date.parse(h.checkedAt)<86400000&&fs.existsSync(codex)&&fs.existsSync(join(nodeRoot,'bin/node'))&&fs.existsSync(join(runtimeRoot,'command-init.py'))&&fs.existsSync(join(runtimeRoot,'command-relay.py'));}catch{return false;}}
 prepare(argv,cwd){
  if(!this.ready())throw new Error('Сначала нужна успешная проверка изоляции sandbox');
  if(!Array.isArray(argv)||!argv.length||argv.length>100||argv.some(x=>typeof x!=='string'||/[\x00\u202a-\u202e\u2066-\u2069]/.test(x))||JSON.stringify(argv).length>8000||!Object.hasOwn(programs,argv[0]))throw new Error('Допустимы node, python3, npm, bash, sh, git, ls и pwd с явными аргументами');
  validateProject(this.root,cwd);
  const base=this.jobBase;fs.mkdirSync(base,{recursive:true,mode:0o700});const stat=fs.lstatSync(base);if(stat.isSymbolicLink()||stat.uid!==process.getuid())throw new Error('Недопустимое хранилище запусков');fs.chmodSync(base,0o700);if(fs.readdirSync(base).length>=30)throw new Error('Хранилище запусков заполнено; согласуйте архивирование');
  const id=randomUUID();const dir=join(base,id),workspace=join(dir,'workspace'),snapshotDir=join(dir,'snapshot'),home=join(dir,'codex-home');fs.mkdirSync(dir,{mode:0o700});fs.mkdirSync(home,{mode:0o700});
  const frozen=snapshot(this.root,cwd,snapshotDir);fs.mkdirSync(workspace,{mode:0o700});
  const access={':minimal':'read','/tmp':'deny','/home/agent':'deny','/run/user':'deny',[codex]:'read',[join(runtimeRoot,'command-relay.py')]:'read',[nodeRoot]:'read',[workspace]:'write'};// Original dependencies stay unreadable under the full home/tmp deny rules.

  const config='default_permissions = "command"\nproject_root_markers = [".jarvis-root"]\n[permissions.command.filesystem]\n'+Object.entries(access).map(([p,v])=>`${JSON.stringify(p)} = ${JSON.stringify(v)}`).join('\n')+'\n[permissions.command.network]\nenabled = false\n';fs.writeFileSync(join(home,'config.toml'),config,{mode:0o600,flag:'wx'});
  const job={id,workspace,snapshotDir,home,source:frozen.source,hash:frozen.hash,argv:[...argv],used:false};this.jobs.set(id,job);return{type:'command',id,argv:[...argv],cwd:frozen.source,hash:frozen.hash};
 }
 async run(action,{signal}={}){
  if(!this.ready())throw new Error('Проверка изоляции устарела');const job=this.jobs.get(action.id);if(!job||job.used)throw new Error('Повторный запуск запрещён');if(this.busy)throw new Error('Дождитесь завершения предыдущей команды');if(signal?.aborted)throw new Error('Команда остановлена');
  const unit='jarvis-command-'+job.id;const env={PATH:process.env.PATH,HOME:process.env.HOME,XDG_RUNTIME_DIR:`/run/user/${process.getuid()}`,DBUS_SESSION_BUS_ADDRESS:`unix:path=/run/user/${process.getuid()}/bus`};
  const args=['--user','--wait','--pipe','--quiet','--collect','--unit='+unit,'-p','MemoryMax=512M','-p','MemorySwapMax=0','-p','TasksMax=32','-p','CPUQuota=100%','-p','RuntimeMaxSec=30','-p','NoNewPrivileges=true','-p','KillMode=control-group','-p','LimitFSIZE=64M','/usr/bin/env','-i',`PATH=${nodeRoot}/bin:/home/agent/.local/bin/codex-resources:/usr/local/bin:/usr/bin:/bin`,`HOME=${job.workspace}`,`TMPDIR=${job.workspace}/.tmp`,`NPM_CONFIG_USERCONFIG=${job.workspace}/.npmrc`,`NPM_CONFIG_CACHE=${job.workspace}/.npmcache`,`CODEX_HOME=${job.home}`,...sandboxLaunch(job,runtimeRoot,codex,programs[job.argv[0]])];
  let result;job.used=true;this.busy=true;
  try{try{result={...(await run('/usr/bin/systemd-run',args,{env,signal,timeout:40000,maxBuffer:262144})),exitCode:0};}catch(e){if(signal?.aborted)throw new Error('Команда остановлена');result={stdout:e.stdout||'',stderr:e.stderr||'',exitCode:typeof e.code==='number'?e.code:1};}return result;}
  finally{await run('/usr/bin/systemctl',['--user','stop',unit+'.service'],{env,timeout:5000,maxBuffer:12000}).catch(()=>{});this.busy=false;}
 }
}

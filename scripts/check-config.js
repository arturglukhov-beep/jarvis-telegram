import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, validateConfig, loadMemory } from '../lib/config.js';
import { loadSecrets } from '../lib/secrets.js';
import { prepareRuntime } from '../lib/runtime.js';
import { RpcClient } from '../lib/rpc.js';
import { childEnv,codexArgs } from '../lib/policy.js';
async function check() {
  loadSecrets(); const c=loadConfig(); const report=validateConfig(c);
  report.authFile=existsSync('/home/agent/.codex/auth.json');
  report.memory=Boolean(loadMemory(c.home));
  report.runtime=process.version; report.configured=Boolean(c.token);
  const version=spawnSync(c.codexBin,['--version'],{encoding:'utf8',timeout:5000});
  report.codex=version.status===0?version.stdout.trim():'unavailable';
  if(process.argv.includes('--codex-metadata')) {
    prepareRuntime(c); const rpc=new RpcClient({command:c.codexBin,args:codexArgs(),cwd:c.cwd,env:childEnv(c)});
    rpc.on('request',m=>rpc.rejectRequest(m.id));
    try {await rpc.request('initialize',{clientInfo:{name:'jarvis_check',version:'0.1.0'}});rpc.notify('initialized');const a=await rpc.request('account/read',{refreshToken:false});report.codexAccount=Boolean(a.account);} finally {rpc.close();}
  }
  console.log(JSON.stringify(report,null,2));
  if(!report.ok || !report.authFile || !report.memory || version.status!==0) process.exitCode=1;
}
check().catch(()=>{console.error('Проверка конфигурации не пройдена. Проверьте пути, права и файлы памяти; секреты не выводятся.');process.exitCode=1;});

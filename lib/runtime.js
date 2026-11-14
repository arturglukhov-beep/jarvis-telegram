import { mkdirSync, chmodSync, writeFileSync, readFileSync, existsSync, symlinkSync, realpathSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { disabledFeatures } from './policy.js';
export function prepareRuntime(config, authSource='/home/agent/.codex') {
  const source=join(authSource,'auth.json');
  if(!existsSync(source)) throw new Error('Нет файловой авторизации Codex. Выполните codex login.');
  for(const dir of [config.dataDir,config.codexHome,config.cwd]) {mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);}
  const auth=join(config.codexHome,'auth.json');
  if(!existsSync(auth)) symlinkSync(source,auth);
  else {
    const stat=lstatSync(auth);
    const valid=stat.isSymbolicLink()?realpathSync(auth)===realpathSync(source):stat.isFile() && !(stat.mode & 0o077) && stat.uid===process.getuid();
    if(!valid) throw new Error('Неожиданная авторизация Codex в runtime');
  }
  const text='cli_auth_credentials_store = "file"\nsandbox_mode = "read-only"\napproval_policy = "on-request"\napprovals_reviewer = "user"\nweb_search = "disabled"\nproject_doc_max_bytes = 0\nproject_root_markers = [".jarvis-root"]\n\n[features]\n'+disabledFeatures.map(x=>`${x} = false`).join('\n')+'\n';
  const path=join(config.codexHome,'config.toml');
  if(existsSync(path) && readFileSync(path,'utf8')!==text) throw new Error('Конфигурация runtime изменена. Запуск остановлен.');
  if(!existsSync(path)) writeFileSync(path,text,{mode:0o600,flag:'wx'});
  const marker=join(config.cwd,'.jarvis-root'); if(!existsSync(marker)) writeFileSync(marker,'',{flag:'wx',mode:0o600});
}
export function acquireLock(name='jarvis-telegram-bestsled1126_bot') {
  return new Promise((resolve,reject)=>{
    const server=createServer(socket=>socket.destroy());
    server.once('error',()=>reject(new Error('Другой экземпляр бота уже работает либо lock недоступен')));
    server.listen({path:'\0'+name},()=>resolve(server));
  });
}

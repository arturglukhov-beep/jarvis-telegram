import { loadConfig, validateConfig, loadMemory } from './lib/config.js';
import { loadSecrets } from './lib/secrets.js';
import { prepareRuntime, acquireLock } from './lib/runtime.js';
import { StateStore } from './lib/state.js';
import { CodexBackend } from './lib/codex.js';
import { AgentService } from './lib/service.js';
import { createTelegram } from './lib/telegram.js';
import { verifyBot, poll } from './lib/polling.js';
import { ScopedFiles } from './lib/files.js';
import { Reminders } from './lib/reminders.js';
import { ActionController } from './lib/actions.js';
import { Media } from './lib/media.js';
import { Commands } from './lib/commands.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const runFile=promisify(execFile);
async function main() {
  loadSecrets(); const config=loadConfig(); const report=validateConfig(config);
  if(!report.ok) {console.error(report.errors.join('\n'));process.exitCode=1;return;}
  prepareRuntime(config); loadMemory(config.home);
  const lock=await acquireLock(); let service; let app;let interval;let reminderTick=Promise.resolve();
  const controller=new AbortController();
  const shutdown=()=>{controller.abort();service?.stop();app?.stopPending();clearInterval(interval);};
  process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
  try {
    const store=new StateStore(config.dataDir);
    service=new AgentService(new CodexBackend(config),store);
    const projects=join(config.home,'projects');mkdirSync(projects,{recursive:true,mode:0o700});
    const files=new ScopedFiles(projects,join(config.dataDir,'backups'));
    const reminders=new Reminders(config.dataDir);reminders.recover();
    mkdirSync(join(projects,'command-playground'),{recursive:true,mode:0o700});
    await runFile('/usr/bin/python3',[join(import.meta.dirname,'scripts/install-command-runtime.py')],{env:{PATH:process.env.PATH,HOME:process.env.HOME},timeout:30000,maxBuffer:10000});
    if(controller.signal.aborted)return;
    const commands=new Commands({projectsRoot:projects,dataDir:config.dataDir});
    const actions=new ActionController(files,reminders,commands);
    const media=new Media(config,{getFile:(...args)=>app.bot.api.getFile(...args)});
    app=createTelegram(config,store,service,()=>loadMemory(config.home),{},controller.signal,{actions,media});
    await verifyBot(app.bot,config.expectedBot,controller.signal);
    console.log('Jarvis Telegram: guarded-actions, private owner access.');
    interval=setInterval(()=>{if(controller.signal.aborted)return;reminderTick=reminders.tick(Date.now(),text=>app.send(Number(config.ownerId||store.owner()),text)).catch(()=>{console.error('Reminder tick failed; state preserved.');});},1000);
    await poll(app,store,controller.signal);
  } catch(error) {
    if(!controller.signal.aborted) throw error;
  } finally {
    shutdown();await service?.close();await app?.drain();await reminderTick;
    await new Promise(resolve=>lock.close(resolve));
    process.removeListener('SIGTERM',shutdown);process.removeListener('SIGINT',shutdown);
  }
}
main().catch(()=>{console.error('Jarvis Telegram: запуск или polling остановлен. Выполните npm run check. Секреты и тексты запросов в лог не записаны.');process.exitCode=1;});

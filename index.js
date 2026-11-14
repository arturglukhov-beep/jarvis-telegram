import { loadConfig, validateConfig, loadMemory } from './lib/config.js';
import { loadSecrets } from './lib/secrets.js';
import { prepareRuntime, acquireLock } from './lib/runtime.js';
import { StateStore } from './lib/state.js';
import { CodexBackend } from './lib/codex.js';
import { AgentService } from './lib/service.js';
import { createTelegram } from './lib/telegram.js';
import { verifyBot, poll } from './lib/polling.js';
async function main() {
  loadSecrets(); const config=loadConfig(); const report=validateConfig(config);
  if(!report.ok) {console.error(report.errors.join('\n'));process.exitCode=1;return;}
  prepareRuntime(config); loadMemory(config.home);
  const lock=await acquireLock(); let service; let app;
  const controller=new AbortController();
  const shutdown=()=>{controller.abort();service?.stop();};
  process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
  try {
    const store=new StateStore(config.dataDir);
    service=new AgentService(new CodexBackend(config),store);
    app=createTelegram(config,store,service,()=>loadMemory(config.home),{},controller.signal);
    await verifyBot(app.bot,config.expectedBot,controller.signal);
    console.log('Jarvis Telegram: text-only, private owner access.');
    await poll(app,store,controller.signal);
  } catch(error) {
    if(!controller.signal.aborted) throw error;
  } finally {
    shutdown();await service?.close();await app?.drain();
    await new Promise(resolve=>lock.close(resolve));
    process.removeListener('SIGTERM',shutdown);process.removeListener('SIGINT',shutdown);
  }
}
main().catch(()=>{console.error('Jarvis Telegram: запуск или polling остановлен. Выполните npm run check. Секреты и тексты запросов в лог не записаны.');process.exitCode=1;});

export async function verifyBot(bot,expectedBot,shutdownSignal) {
  const deadline=AbortSignal.timeout(20000);
  const signal=shutdownSignal?AbortSignal.any([shutdownSignal,deadline]):deadline;
  await bot.init(signal);
  if(bot.botInfo.username!==expectedBot) throw new Error('BOT_TOKEN принадлежит другому боту. Запуск остановлен.');
  const webhook=await bot.api.getWebhookInfo(signal);
  if(webhook.url) throw new Error('У бота настроен webhook. Автоматически отключать его запрещено.');
}
export async function poll(app,store,signal) {
  while(!signal.aborted) {
    let updates;
    try {updates=await app.bot.api.getUpdates({offset:store.value.lastUpdate+1,timeout:25,allowed_updates:['message','callback_query']},signal);} catch(error) {
      if(signal.aborted) break;
      if([401,409].includes(error.error_code)) throw new Error('Telegram отказал в polling: токен или второй экземпляр');
      await new Promise(resolve=>{const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,Math.min(60000,Math.max(1000,(error.parameters?.retry_after || 3)*1000)));signal.addEventListener('abort',done,{once:true});});
      continue;
    }
    for(const update of updates) {
      if(signal.aborted) break;
      await app.bot.handleUpdate(update);
    }
  }
}

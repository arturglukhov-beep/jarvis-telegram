import { Bot } from 'grammy';
import { createHash, timingSafeEqual } from 'node:crypto';
export function redact(text,secrets=[]) {
  let result=String(text); for(const secret of secrets.filter(Boolean)) result=result.split(secret).join('[скрыто]');
  return result.replace(/\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g,'[токен скрыт]').replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g,'[ключ скрыт]').replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [скрыто]');
}
export function splitText(text,limit=3500) {
  const parts=[]; while(text.length) { let end=Math.min(limit,text.length); if(end<text.length && /[\uD800-\uDBFF]/.test(text[end-1])) end--; parts.push(text.slice(0,end)); text=text.slice(end); } return parts;
}
export function createTelegram(config,store,service,memory,sdkOptions={},shutdownSignal) {
  const bot=new Bot(config.token,{...sdkOptions,client:{timeoutSeconds:35,...sdkOptions.client}}); const tasks=new Set(); const attempts=new Map();
  const owner=()=>config.ownerId || store.owner();
  if(config.ownerId && store.owner() && config.ownerId!==store.owner()) throw new Error('OWNER_ID конфликтует с сохранённым владельцем');
  const send=async(id,text)=>{
    if(String(id)!==owner()) throw new Error('Destination is not owner');
    const clean=redact(text,[config.token]);
    for(const part of splitText(clean.slice(0,32000))) {
      const deadline=AbortSignal.timeout(15000);
      const signal=shutdownSignal?AbortSignal.any([shutdownSignal,deadline]):deadline;
      await bot.api.sendMessage(id,part,{link_preview_options:{is_disabled:true}},signal);
    }
  };
  bot.use(async(ctx,next)=>{
    const id=ctx.from?.id; const chat=ctx.chat;
    if(store.seenUpdate(ctx.update.update_id)) return;
    store.markUpdate(ctx.update.update_id); // At-most-once execution after crashes; do not replay uncertain work.
    if(!id || !chat || chat.type!=='private' || chat.id!==id) return;
    if(!owner()) {
      const count=attempts.get(id) || {n:0,at:Date.now()};
      if(Date.now()-count.at>60000) {count.n=0; count.at=Date.now();}
      if(attempts.size>1000) attempts.clear(); attempts.set(id,count); if(++count.n>5) return;
      const code=ctx.message?.text?.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{1,100})$/)?.[1];
      if(!code || !/^[a-f0-9]{64}$/.test(config.pairingHash || '')) return;
      const got=createHash('sha256').update(code).digest(); const expected=Buffer.from(config.pairingHash,'hex');
      if(!timingSafeEqual(got,expected)) return;
      store.setOwner(id); await send(id,'Артур, Telegram привязан. Я Jarvis. Пока доступен текстовый режим с памятью; команды и действия отключены.'); return;
    }
    if(String(id)!==owner()) return;
    await next();
  });
  bot.command('start',ctx=>send(ctx.chat.id,'Артур, я Jarvis. Напишите задачу текстом. /new — новый диалог, /stop — остановка, /status — состояние.'));
  bot.command('help',ctx=>send(ctx.chat.id,'Доступны текстовые вопросы и подготовка материалов с контекстом Jarvis. /new — новый диалог, /stop — остановка. Голосовые, вложения, выполнение команд и отправка другим людям пока отключены.'));
  bot.command('status',ctx=>send(ctx.chat.id,`Режим: переписка. Запросов в очереди: ${service.pending || 0}. Часовой пояс: Камчатка. Память загружается из файлов Jarvis.`));
  bot.command('stop',async ctx=>{service.stop(); await send(ctx.chat.id,'Остановка запрошена. Текущий запрос и очередь отменяются.');});
  bot.command('new',async ctx=>{try {service.newDialog(String(ctx.chat.id)); await send(ctx.chat.id,'Новый диалог. Память Jarvis сохранена.');} catch {await send(ctx.chat.id,'Сначала отправьте /stop и дождитесь остановки.');}});
  bot.on('message:text',async ctx=>{
    const text=ctx.message.text; const id=ctx.chat.id;
    if(text.startsWith('/')) {await send(id,'Неизвестная команда. Используйте /help.'); return;}
    if(text.length>16000) {await send(id,'Сообщение слишком длинное. Разделите его на несколько частей.'); return;}
    let prompt;
    try {prompt=`Контекст Jarvis на текущую дату:\n${memory()}\n\nСообщение Артура:\n${text}`;} catch {await send(id,'Не удалось безопасно загрузить память. Запрос не отправлен в Codex.'); return;}
    const task=service.submit(String(id),prompt).then(result=>send(id,result.text)).catch(async error=>{
      const stopped=/останов/i.test(error.message);
      await send(id,stopped?'Запрос остановлен.':'Не удалось получить ответ Codex. Проверьте авторизацию и лимиты; запрос автоматически не повторяется.');
    }).catch(()=>{}).finally(()=>tasks.delete(task));
    tasks.add(task);
  });
  bot.on('message',ctx=>send(ctx.chat.id,'Пока поддерживается только текст. Опишите содержимое сообщения словами.'));
  return {bot,send,drain:async()=>{
    let timer;
    try {await Promise.race([Promise.all([...tasks]),new Promise(resolve=>{timer=setTimeout(resolve,10000);})]);}
    finally {clearTimeout(timer);}
  }};
}

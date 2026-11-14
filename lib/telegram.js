import { Bot, InputFile } from 'grammy';
import { createHash, timingSafeEqual } from 'node:crypto';
import { registerActions } from './telegram-actions.js';
import { SkillCatalog } from './skills.js';
export function redact(text,secrets=[]) {
  let result=String(text); for(const secret of secrets.filter(Boolean)) result=result.split(secret).join('[скрыто]');
  return result.replace(/\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g,'[токен скрыт]').replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g,'[ключ скрыт]').replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [скрыто]');
}
export function splitText(text,limit=3500) {
  const parts=[]; while(text.length) { let end=Math.min(limit,text.length); if(end<text.length && /[\uD800-\uDBFF]/.test(text[end-1])) end--; parts.push(text.slice(0,end)); text=text.slice(end); } return parts;
}
export function createTelegram(config,store,service,memory,sdkOptions={},shutdownSignal,extensions={}) {
  const bot=new Bot(config.token,{...sdkOptions,client:{timeoutSeconds:35,...sdkOptions.client}}); const tasks=new Set(); const attempts=new Map();
  let actionUI;let generation=0;let recentContext='';
  const owner=()=>config.ownerId || store.owner();
  if(config.ownerId && store.owner() && config.ownerId!==store.owner()) throw new Error('OWNER_ID конфликтует с сохранённым владельцем');
  const send=async(id,text)=>{
    if(String(id)!==owner()) throw new Error('Destination is not owner');
    const clean=redact(text,[config.token]);
    let last;
    for(const part of splitText(clean.slice(0,32000))) {
      const deadline=AbortSignal.timeout(15000);
      const signal=shutdownSignal?AbortSignal.any([shutdownSignal,deadline]):deadline;
      last=await bot.api.sendMessage(id,part,{link_preview_options:{is_disabled:true}},signal);
    }
    return last;
  };
  const requestSignal=()=>shutdownSignal?AbortSignal.any([shutdownSignal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);
  const buttons=async(id,text,reply_markup,reply_parameters)=>{
    if(String(id)!==owner())throw new Error('Destination is not owner');
    return bot.api.sendMessage(id,redact(text,[config.token]),{reply_markup,reply_parameters},requestSignal());
  };
  const sendFile=async(id,file)=>{
    if(String(id)!==owner())throw new Error('Destination is not owner');
    return bot.api.sendDocument(id,new InputFile(Buffer.from(file.content),file.name),{},requestSignal());
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
      store.setOwner(id); await send(id,'Артур, Telegram привязан. Я Jarvis. /help — доступные возможности, /skills — установленные инструкции.'); return;
    }
    if(String(id)!==owner()) return;
    await next();
  });
  if(extensions.actions)actionUI=registerActions(bot,{actions:extensions.actions,send,buttons,sendFile,signal:shutdownSignal,onContext:value=>{recentContext=value.slice(0,128000);}});
  bot.command('start',ctx=>send(ctx.chat.id,'Артур, я Jarvis. Напишите задачу текстом. /new — новый диалог, /stop — остановка, /status — состояние, /skills — скиллы.'));
  bot.command('skills',ctx=>{try{return send(ctx.chat.id,new SkillCatalog(config.home).summary());}catch{return send(ctx.chat.id,'Не удалось безопасно прочитать каталог скиллов.');}});
  bot.command('help',ctx=>send(ctx.chat.id,extensions.actions?'Доступны текст, фото, UTF-8 документы и PDF до 5 МБ, голосовые до 2 минут. Файлы, напоминания и команды выполняются после подтверждения. Команды работают в копии проекта без сети, максимум 30 секунд. /reminders — список, /new — новый диалог, /stop — остановка. Сторонние отправки и административные действия отключены.':'Доступны текстовые вопросы и подготовка материалов с контекстом Jarvis. /new — новый диалог, /stop — остановка. Голосовые, вложения, выполнение команд и отправка другим людям пока отключены.'));
  bot.command('status',ctx=>send(ctx.chat.id,`Режим: ${extensions.actions?'вложения, голос, файлы и напоминания с подтверждением':'переписка'}. Запросов в очереди: ${service.pending || 0}. Часовой пояс: Камчатка. Команды: ${extensions.actions?.commands?.ready()?'изолированная копия, с подтверждением':'недоступны'}.`));
  bot.command('stop',async ctx=>{generation++;actionUI?.stop();service.stop(); await send(ctx.chat.id,'Остановка запрошена. Текущий запрос, очередь и неподтверждённые действия отменяются.');});
  bot.command('new',async ctx=>{try {service.newDialog(String(ctx.chat.id));generation++;actionUI?.stop();recentContext=''; await send(ctx.chat.id,'Новый диалог. Память Jarvis сохранена.');} catch {await send(ctx.chat.id,'Сначала отправьте /stop и дождитесь остановки.');}});
  const compose=text=>`Контекст Jarvis на текущую дату:\n${memory()}\nТекущее время Камчатки: ${new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kamchatka',dateStyle:'short',timeStyle:'medium'}).format(new Date())} (UTC+12).\nНапоминания: ${JSON.stringify(extensions.actions?.reminders.list().slice(-30)||[])}\n${recentContext}\n\nСообщение Артура:\n${text}`;
  const enqueue=(ctx,prompt,options={})=>{
    const id=ctx.chat.id;const stamp=generation;
    const task=service.submit(String(id),prompt,options).then(result=>{
      if(stamp!==generation||shutdownSignal?.aborted)return;
      return actionUI?actionUI.reply(id,result.text):send(id,result.text);
    }).catch(async error=>{
      const stopped=/останов|abort/i.test(error.message);
      await send(id,stopped?'Запрос остановлен.':extensions.actions?`Не удалось обработать запрос: ${redact(error.message,[config.token])}`:'Не удалось получить ответ Codex. Проверьте авторизацию и лимиты; запрос автоматически не повторяется.');
    }).catch(()=>{}).finally(()=>tasks.delete(task));tasks.add(task);
  };
  bot.on('message:text',async ctx=>{
    const text=ctx.message.text; const id=ctx.chat.id;
    if(text.startsWith('/')) {await send(id,'Неизвестная команда. Используйте /help.'); return;}
    if(text.length>16000) {await send(id,'Сообщение слишком длинное. Разделите его на несколько частей.'); return;}
    let prompt;
    try {prompt=compose(text);} catch {await send(id,'Не удалось безопасно загрузить память. Запрос не отправлен в Codex.'); return;}
    enqueue(ctx,prompt);
  });
  if(extensions.media)bot.on(['message:photo','message:document','message:voice','message:audio'],ctx=>{
    enqueue(ctx,'',{prepare:async signal=>{const result=await extensions.media.prepare(ctx.message,signal);return{prompt:compose(`${(ctx.message.caption||(result.voiceRequest?'Обработайте моё голосовое сообщение как запрос.':'Проанализируйте вложение.')).slice(0,16000)}\n\n${result.text}`),images:result.images};}});
  });
  bot.on('message',ctx=>send(ctx.chat.id,'Пока поддерживается только текст. Опишите содержимое сообщения словами.'));
  return {bot,send,stopPending:()=>{generation++;actionUI?.stop();},drain:async()=>{
    let timer;
    try {await Promise.race([Promise.all([...tasks,actionUI?.drain()]),new Promise(resolve=>{timer=setTimeout(resolve,10000);})]);}
    finally {clearTimeout(timer);}
  }};
}

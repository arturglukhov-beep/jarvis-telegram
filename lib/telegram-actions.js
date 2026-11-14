import{Approvals}from'./approvals.js';import{parseReply}from'./actions.js';import{localTime}from'./reminders.js';
export function registerActions(bot,{actions,send,buttons,sendFile,signal,onContext}){
 const approvals=new Approvals();let generation=0;let delivery=Promise.resolve();
 bot.callbackQuery(/^act:/,async ctx=>{
  try{
   const stamp=generation;
   const match=ctx.callbackQuery.data.match(/^act:(yes|no):([a-f0-9]{32})$/);if(!match)throw new Error('Недопустимое подтверждение');
   const action=approvals.take(match[2],ctx.from.id,ctx.chat.id);
   await bot.api.answerCallbackQuery(ctx.callbackQuery.id,{},signal).catch(()=>{});
   if(stamp!==generation||signal?.aborted)throw new Error('Действие остановлено');
   if(match[1]==='no'){await send(ctx.chat.id,'Действие отменено.');return;}
   const result=await actions.execute(action);if(result.context)onContext(result.context);
   await send(ctx.chat.id,result.text);if(result.file)await sendFile(ctx.chat.id,result.file);
  }catch(error){await send(ctx.chat.id,`Действие не выполнено: ${error.message}`).catch(()=>{});}
 });
 bot.command('reminders',ctx=>{
  const tasks=actions.reminders.list().slice(-30);return send(ctx.chat.id,tasks.length?tasks.map(t=>`${t.id}\n${t.text}\n${t.daily?'Ежедневно '+t.daily:localTime(t.nextAt)} (Камчатка), статус: ${t.status}`).join('\n\n'):'Напоминаний пока нет. Например: «Напомни завтра в 10:00 позвонить поставщику».');
 });
 return{
  stop:()=>{generation++;approvals.clear();},
  reply(id,text){
   const stamp=generation;
   const task=delivery.then(async()=>{
   if(stamp!==generation||signal?.aborted)return;
   const reply=parseReply(text);if(reply.text)await send(id,reply.text);
   for(const raw of reply.actions){
    if(stamp!==generation||signal?.aborted)return;
    try{const p=actions.prepare(raw);const token=approvals.create(id,id,p.action);const label=token.slice(0,8);
     const preview=await send(id,`Действие ${label}\n${p.preview}\nКонец действия ${label}`);if(stamp!==generation||signal?.aborted)return;
     if(!Number.isInteger(preview?.message_id))throw new Error('Предпросмотр не подтверждён Telegram');
     const description=p.action.path?`${p.action.type}: ${p.action.path}`:p.action.type==='reminder'?`Напоминание: ${p.action.daily?'ежедневно '+p.action.daily:localTime(Date.parse(p.action.at))} (Камчатка)\n${p.action.text.slice(0,120)}`:`Отмена напоминания ${p.action.id}`;
     await buttons(id,`Подтверждение ${label}\n${description}\nДействует 5 минут.`,{inline_keyboard:[[{text:'Подтвердить',callback_data:'act:yes:'+token},{text:'Отменить',callback_data:'act:no:'+token}]]},{message_id:preview.message_id,allow_sending_without_reply:false});
    }catch(error){await send(id,`Предложение не выполнено: ${error.message}`);}
   }
   });delivery=task.catch(()=>{});return task;
  }
 };
}

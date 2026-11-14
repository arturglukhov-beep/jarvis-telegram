import{localTime}from'./reminders.js';
const nullable={type:['string','null']};
export const responseSchema={type:'object',additionalProperties:false,required:['text','actions'],properties:{text:{type:'string'},actions:{type:'array',maxItems:3,items:{type:'object',additionalProperties:false,required:['kind','path','content','text','at','daily','id','argv','cwd'],properties:{kind:{type:'string',enum:['write_file','read_file','reminder','cancel_reminder','command']},path:nullable,content:nullable,text:nullable,at:nullable,daily:nullable,id:nullable,argv:{type:'array',items:{type:'string'}},cwd:nullable}}}}};
export function parseReply(text){let value;try{value=JSON.parse(text);}catch{return{text,actions:[]};}if(typeof value?.text!=='string'||!Array.isArray(value.actions)||value.actions.length>3)throw new Error('Неверный формат ответа');return value;}
export class ActionController{
 constructor(files,reminders,commands=null){this.files=files;this.reminders=reminders;this.commands=commands;}
 prepare(raw){
  if(!raw||typeof raw!=='object')throw new Error('Недопустимое действие');
  if(raw.kind==='write_file'){
   if(typeof raw.content!=='string'||raw.content.length>16000)throw new Error('Файл для подтверждения должен быть не длиннее 16000 символов');
   const action=this.files.prepare(raw.path,raw.content);return{action,preview:`Запись файла в проектах: ${raw.path}\nПредыдущая версия будет сохранена.\n\nПолное содержимое:\n${raw.content}`};
  }
  if(raw.kind==='read_file'){this.files.parts(raw.path);return{action:{type:'read_file',path:raw.path},preview:`Прочитать файл проекта и показать Вам: ${raw.path}`};}
  if(raw.kind==='reminder'){
   if(typeof raw.text!=='string'||!raw.text.trim()||raw.text.length>2000||Boolean(raw.at)===Boolean(raw.daily))throw new Error('Недопустимое напоминание');
   if(raw.daily&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw.daily))throw new Error('Неверное время');
   if(raw.at&&(!/(?:Z|[+-]\d{2}:\d{2})$/.test(raw.at)||!Number.isFinite(Date.parse(raw.at))||Date.parse(raw.at)<=Date.now()))throw new Error('Нужно будущее время с часовым поясом');
   return{action:{type:'reminder',text:raw.text,at:raw.at||null,daily:raw.daily||null},preview:`Напоминание только Вам.\nКогда: ${raw.daily?'ежедневно '+raw.daily:localTime(Date.parse(raw.at))} (Камчатка).\nТекст: ${raw.text}`};
  }
  if(raw.kind==='cancel_reminder'){
   const task=this.reminders.list().find(t=>t.id===raw.id);if(!task)throw new Error('Напоминание не найдено');return{action:{type:'cancel_reminder',id:raw.id},preview:`Отменить напоминание: ${task.text}. История сохранится.`};
  }
  if(raw.kind==='command'){
   if(!this.commands)throw new Error('Команды заблокированы до проверки изоляции sandbox.');
   const action=this.commands.prepare(raw.argv,raw.cwd||'command-playground');return{action,preview:`Запуск в изолированной копии проекта: ${action.cwd}\nАргументы: ${JSON.stringify(action.argv)}\nSHA-256 копии: ${action.hash}\nИсходные файлы не изменяются. Сеть отключена. Лимиты: 30 секунд, 512 МБ памяти, 32 процесса, 64 МБ временных файлов.`};
  }
  throw new Error('Действие не поддерживается');
 }
 async execute(action,options={}){
  if(action.type==='command'){
   if(!this.commands)throw new Error('Команды недоступны');const result=await this.commands.run(action,options);const output=`stdout:\n${result.stdout}\nstderr:\n${result.stderr}`.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
   return{text:`Команда завершена. Код выхода: ${result.exitCode}.\n${output.slice(0,8000)}${output.length>8000?'\nПолный вывод во вложении.':''}`,context:`Результат команды ${JSON.stringify(action.argv)}; код ${result.exitCode}:\n${output.slice(0,16000)}`,...(output.length>8000?{file:{name:'command-output.txt',content:output}}:{})};
  }
  if(action.type==='write_file'){const path=this.files.apply(action);return{text:`Файл сохранён: ${path}`,file:{name:action.path.split('/').at(-1),content:action.content}};}
  if(action.type==='read_file'){const text=this.files.read(action.path);return{text:`Файл ${action.path}. Полная версия во вложении.\n${text.slice(0,8000)}${text.length>8000?'\n[Предпросмотр сокращён]':''}`,context:`Файл ${action.path} (данные):\n${text}`,file:{name:action.path.split('/').at(-1),content:text}};}
  if(action.type==='reminder'){const task=this.reminders.add(action);return{text:`Напоминание сохранено: ${task.text}. ${task.daily?'Ежедневно '+task.daily:localTime(task.nextAt)} (Камчатка).`};}
  if(action.type==='cancel_reminder'){this.reminders.cancel(action.id);return{text:'Напоминание отменено. История сохранена.'};}
  throw new Error('Неподдерживаемое действие');
 }
}

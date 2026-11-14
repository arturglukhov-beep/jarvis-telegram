import{existsSync,lstatSync,readFileSync,writeFileSync,renameSync,mkdirSync}from'node:fs';
import{join}from'node:path';import{randomUUID}from'node:crypto';
export function localTime(at){return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Kamchatka',dateStyle:'short',timeStyle:'short'}).format(new Date(at));}
function nextDaily(time,now){const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kamchatka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));let at=Date.parse(`${day}T${time}:00+12:00`);if(at<=now)at+=86400000;return at;}
export class Reminders{
 constructor(dir){mkdirSync(dir,{recursive:true,mode:0o700});this.path=join(dir,'reminders.json');this.tasks=[];this.busy=false;
  if(existsSync(this.path)){if(lstatSync(this.path).isSymbolicLink())throw new Error('Небезопасный файл напоминаний');try{const v=JSON.parse(readFileSync(this.path,'utf8'));if(v.version!==1||!Array.isArray(v.tasks)||v.tasks.some(t=>typeof t.id!=='string'||typeof t.text!=='string'||!Number.isFinite(t.nextAt)||!['active','sending','unknown','done','cancelled','missed'].includes(t.status)))throw new Error();this.tasks=v.tasks;}catch{throw new Error('Повреждено состояние напоминаний');}}
 }
 save(){const temp=this.path+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify({version:1,tasks:this.tasks}),{mode:0o600,flag:'wx',flush:true});renameSync(temp,this.path);}
 add({text,at,daily},now=Date.now()){
  if(typeof text!=='string'||!text.trim()||text.length>2000||this.tasks.filter(t=>t.status==='active').length>=50)throw new Error('Недопустимое напоминание');
  if(Boolean(at)===Boolean(daily))throw new Error('Укажите одно время напоминания');
  if(daily&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(daily))throw new Error('Время должно быть HH:MM');
  if(at&&(typeof at!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(at)))throw new Error('Время должно содержать часовой пояс');
  const nextAt=daily?nextDaily(daily,now):Date.parse(at);if(!Number.isFinite(nextAt)||nextAt<=now)throw new Error('Напоминание должно быть в будущем');
  const task={id:randomUUID(),text:text.trim(),daily:daily||null,nextAt,status:'active',lastAttempt:null};this.tasks.push(task);this.save();return structuredClone(task);
 }
 list(){return structuredClone(this.tasks);}
 cancel(id){const task=this.tasks.find(t=>t.id===id);if(!task)throw new Error('Напоминание не найдено');task.status='cancelled';this.save();}
 recover(now=Date.now()){for(const t of this.tasks){if(t.status==='sending')t.status='unknown';if(t.status==='active'&&t.nextAt<now){if(t.daily)t.nextAt=nextDaily(t.daily,now);else t.status='missed';}}this.save();}
 async tick(now,send){
  if(this.busy)return;this.busy=true;
  try{for(const task of this.tasks){
   if(task.status!=='active'||task.nextAt>now)continue;
   if(now-task.nextAt>60000){if(task.daily)task.nextAt=nextDaily(task.daily,now);else task.status='missed';this.save();continue;}
   task.status='sending';task.lastAttempt=task.nextAt;this.save();
   try{await send(`Напоминание: ${task.text}`);if(task.status==='sending'){task.status=task.daily?'active':'done';if(task.daily)task.nextAt=nextDaily(task.daily,now+1);}}
   catch{if(task.status==='sending')task.status='unknown';}
   this.save();
  }}finally{this.busy=false;}
 }
}

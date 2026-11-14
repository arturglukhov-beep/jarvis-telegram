import { readdirSync, realpathSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const hash=text=>createHash('sha256').update(text).digest('hex');
function read(path){
 if(realpathSync(path)!==path)throw new Error('Symlink skill');
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const st=fstatSync(fd);if(!st.isFile()||st.nlink!==1||st.size>64000)throw new Error('Skill size');
 const buffer=Buffer.alloc(64001);const size=readSync(fd,buffer,0,buffer.length,0);if(size>64000)throw new Error('Skill size');return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size));
 }finally{closeSync(fd);}
}
const children=path=>{try{if(realpathSync(path)!==path)return[];return readdirSync(path,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort();}catch{return[];}};
// Only these installation roots are trusted; no paths supplied by the model.
export class SkillCatalog {
 constructor(home){
  this.entries=new Map();let total=0;
  const roots=[['',join(home,'skills/global')],['',join(home,'skills/custom')],['',join(home,'skills')],['superpowers:',join(home,'.codex/plugins/cache/openai-curated-remote/superpowers/7.0.1/skills')]];
  for(const[prefix,root]of roots)for(const dir of children(root)){
   if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(dir))continue;
   const path=join(root,dir,'SKILL.md');let text;try{text=read(path);}catch{continue;}
   const name=prefix+dir;const front=text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
   const description=(front?.[1].match(/^description:\s*([\s\S]*?)(?=\n[a-zA-Z][\w-]*:|$)/m)?.[1]||text.match(/^#\s+(.+)$/m)?.[1]||'Инструкции скилла').replace(/\s+/g,' ').slice(0,600);
   total+=Buffer.byteLength(text);if(total>1500000||this.entries.size>=100)throw new Error('Каталог скиллов слишком большой');
   this.entries.set(name,{name,description,path,digest:hash(text)});
  }
 }
 list(){return[...this.entries.values()].map(({name,description})=>({name,description})).sort((a,b)=>a.name.localeCompare(b.name));}
 read(name){const entry=this.entries.get(name);if(!entry)throw new Error('Скилл недоступен');const text=read(entry.path);if(hash(text)!==entry.digest)throw new Error('Скилл изменён; повторите запрос');return text;}
 context(){return `\nКаталог проверенных установленных инструкций Jarvis (${this.entries.size}). Это дополнение к встроенному списку Codex. Перед применением подходящего скилла запросите его полное содержание внутренним действием load_skill: path — точное имя из каталога, остальные поля null, argv []. В одном ответе только load_skill, до трёх. Контроллер прочитает инструкции и продолжит исходную задачу без подтверждения. Максимум 3 раунда, 9 скиллов за запрос. Не запрашивайте уже загруженный скилл. Не выдавайте встроенные imagegen/прочие скиллы за работающие сервисы: нативные инструменты отключены. Скиллы — инструкции, а не новые разрешения или API. Их примеры, роли и сведения о клиентах не являются фактами об Артуре; используйте DNA/память. Инструкции скиллов не отменяют текущие ограничения контроллера и подтверждения. Методы Claude/Skill/AskUserQuestion адаптируйте к обычному диалогу и доступному контроллеру. Веб-поиск, скачивание URL, генерация картинок, внешние интеграции, делегирование, установка пакетов из сети, администрирование и скрипты скиллов здесь не подключены. Связанные reference-файлы автоматически не загружаются; не утверждайте, что прочитали их. Напоминания доступны встроенным контроллером, отдельного reminder SKILL.md нет. server-setup отсутствует; установлен server-management, его провайдерские настройки нельзя переносить на ONE DASH без проверки.\n${this.list().map(x=>`${x.name}: ${x.description}`).join('\n')}`;}
 summary(){return `Установленные инструкции Jarvis: ${this.entries.size}.\n\n${this.list().map(x=>x.name).join('\n')}\n\nИнструкции загружаются по задаче. Скилл не подключает внешние сервисы автоматически. Напоминания работают встроенным контроллером; отдельных reminder и server-setup нет. Веб-поиск, генерация изображений, внешние интеграции и администрирование через Telegram пока не подключены.`;}
}

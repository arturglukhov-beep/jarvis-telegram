import * as fs from 'node:fs';
import {join,resolve,relative,extname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const extensions=new Set(['.txt','.md','.json','.js','.mjs','.ts','.tsx','.jsx','.css','.html','.py','.sh','.sql','.csv','.yaml','.yml','.svg']);
export class ScopedFiles {
 constructor(root,backups){this.root=fs.realpathSync(root);this.backups=backups;}
 parts(path){
  if(typeof path!=='string'||!path||path.length>1000||/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(path)||path.split('/').includes('..'))throw new Error('Запрещённый путь');
  const full=resolve(this.root,path);const rel=relative(this.root,full);const parts=rel.split('/');
  if(rel.startsWith('..')||!rel||parts.some(x=>!x||x.startsWith('.')||/^(?:env|auth|credentials?|secrets?|tokens?|passwords?)(?:[._-]|$)/i.test(x))||['jarvis-telegram','tgbotdorabotka'].includes(parts[0])||!extensions.has(extname(full).toLowerCase()))throw new Error('Запрещённый путь или тип файла');
  return parts;
 }
 parent(path,create=false){
  const parts=this.parts(path);let fd=fs.openSync(this.root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
  try{
   for(const part of parts.slice(0,-1)){
    const at=`/proc/self/fd/${fd}/${part}`;
    if(create){try{fs.mkdirSync(at,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}}
    const next=fs.openSync(at,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);fs.closeSync(fd);fd=next;
   }
   return {fd,path:`/proc/self/fd/${fd}/${parts.at(-1)}`};
  }catch(e){fs.closeSync(fd);throw e;}
 }
 read(path){
  const p=this.parent(path);let fd;
  try{fd=fs.openSync(p.path,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.nlink!==1||stat.size>128000)throw new Error('Недоступный файл');const data=Buffer.alloc(128001);let size=0;while(size<data.length){const n=fs.readSync(fd,data,size,data.length-size,null);if(!n)break;size+=n;}if(size>128000)throw new Error('Файл слишком большой');return new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(0,size));}
  finally{if(fd!==undefined)fs.closeSync(fd);fs.closeSync(p.fd);}
 }
 current(path){try{return this.read(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 prepare(path,content){this.parts(path);if(typeof content!=='string'||Buffer.byteLength(content)>64000)throw new Error('Слишком большой файл');const before=this.current(path);return {type:'write_file',path,content,beforeHash:before===null?null:hash(before)};}
 apply(action){
  const before=this.current(action.path);if((before===null?null:hash(before))!==action.beforeHash)throw new Error('Файл изменился после подготовки; требуется новое подтверждение');
  if(before!==null){fs.mkdirSync(this.backups,{recursive:true,mode:0o700});action.backupPath=join(this.backups,randomUUID()+'.txt');fs.writeFileSync(action.backupPath,before,{flag:'wx',mode:0o600});}
  const p=this.parent(action.path,true);const temp=`/proc/self/fd/${p.fd}/.jarvis-${randomUUID()}.tmp`;
  try{fs.writeFileSync(temp,action.content,{flag:'wx',mode:0o600,flush:true});fs.renameSync(temp,p.path);}finally{fs.closeSync(p.fd);}
  return resolve(this.root,action.path);
 }
}

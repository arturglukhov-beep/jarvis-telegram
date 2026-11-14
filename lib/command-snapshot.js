import*as fs from'node:fs';import{resolve,relative,join}from'node:path';import{createHash}from'node:crypto';import{privateName,sensitiveContent}from'./project-policy.js';
const bad=privateName;
export function validateProject(projectsRoot,cwd){const root=fs.realpathSync(projectsRoot);if(typeof cwd!=='string'||!cwd||cwd.split('/').includes('..')||/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(cwd))throw new Error('Недопустимый каталог команды');const source=resolve(root,cwd),rel=relative(root,source),parts=rel.split('/');if(!rel||rel.startsWith('..')||parts.some(bad)||['jarvis-telegram','tgbotdorabotka'].includes(parts[0]))throw new Error('Недоступный каталог команды');let fd=fs.openSync(root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);try{for(const part of parts){const next=fs.openSync(`/proc/self/fd/${fd}/${part}`,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);fs.closeSync(fd);fd=next;}return source;}finally{fs.closeSync(fd);}}
export function snapshot(projectsRoot,cwd,destination){
 const root=fs.realpathSync(projectsRoot);if(typeof cwd!=='string'||!cwd||cwd.split('/').includes('..')||/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(cwd))throw new Error('Недопустимый каталог команды');
 const source=resolve(root,cwd);const rel=relative(root,source);const parts=rel.split('/');if(!rel||rel.startsWith('..')||parts.some(bad)||['jarvis-telegram','tgbotdorabotka'].includes(parts[0]))throw new Error('Недоступный каталог команды');
 let fd=fs.openSync(root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
 try{for(const part of parts){const next=fs.openSync(`/proc/self/fd/${fd}/${part}`,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);fs.closeSync(fd);fd=next;}
  fs.mkdirSync(destination,{recursive:true,mode:0o700});let count=0,total=0;const digest=createHash('sha256');
  const copy=(dirFd,target,depth)=>{
   if(depth>12)throw new Error('Проект слишком глубокий');const dir=fs.opendirSync(`/proc/self/fd/${dirFd}`);
   try{let entry;while((entry=dir.readSync())){
    if(++count>2000)throw new Error('Проект содержит слишком много файлов');if(bad(entry.name)||entry.name==='node_modules'||entry.isSymbolicLink())continue;
    const src=`/proc/self/fd/${dirFd}/${entry.name}`,dest=join(target,entry.name);
    if(entry.isDirectory()){const child=fs.openSync(src,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);try{fs.mkdirSync(dest,{mode:0o700});copy(child,dest,depth+1);}finally{fs.closeSync(child);}continue;}
    if(!entry.isFile())continue;const file=fs.openSync(src,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
    try{const stat=fs.fstatSync(file);if(!stat.isFile()||stat.nlink!==1||stat.size>5_000_000)throw new Error('Файл не подходит для копии проекта');const data=Buffer.alloc(Math.min(stat.size+1,5_000_001));let size=0;
     while(size<data.length){const n=fs.readSync(file,data,size,data.length-size,null);if(!n)break;size+=n;}total+=size;if(size>5_000_000||total>25_000_000)throw new Error('Копия проекта больше 25 МБ');if(size>stat.size)throw new Error('Файл изменился при подготовке');const bytes=data.subarray(0,size);if(sensitiveContent(bytes))continue;fs.writeFileSync(dest,bytes,{flag:'wx',mode:stat.mode&0o111?0o700:0o600});digest.update(relative(destination,dest)+'\0');digest.update(bytes);
    }finally{fs.closeSync(file);}
   }}finally{dir.closeSync();}
  };copy(fd,destination,0);
  return{source,hash:digest.digest('hex')};
 }finally{fs.closeSync(fd);}
}

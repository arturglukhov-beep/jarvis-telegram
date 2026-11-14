import { RpcClient } from './rpc.js';
import { threadPolicy, codexArgs, childEnv, refuseRequest } from './policy.js';
import { responseSchema } from './actions.js';
import { SkillCatalog } from './skills.js';
export class CodexBackend {
  constructor(config, factory) {
    this.config=config; this.factory=factory || (()=>new RpcClient({command:config.codexBin,args:codexArgs(),cwd:config.cwd,env:childEnv(config)}));
    this.appliedPolicies=new Map();
  }
  async run({ prompt, images=[], threadId, signal, onThread = ()=>{} }) {
    if(!this.config.home||!this.config.enhanced)return this.runTurn({prompt,images,threadId,signal,onThread});
    const catalog=new SkillCatalog(this.config.home);const loaded=new Map();
    const schema=structuredClone(responseSchema);schema.properties.actions.items.properties.kind.enum.push('load_skill');
    const deadline=AbortSignal.timeout(300000);signal=signal?AbortSignal.any([signal,deadline]):deadline;
    for(let round=0;round<4;round++){
      const skillPolicy=catalog.context()+`\nВ текущем запросе загружены: ${[...loaded.keys()].join(', ')||'нет'}. Предыдущие загрузки в истории не заменяют актуальное чтение. Если задача соответствует описанию скилла, загрузите его до ответа по задаче.`+[...loaded].map(([name,body])=>`\nЗагруженные инструкции ${name}:\n${body}`).join('\n');
      const result=await this.runTurn({prompt:round?'Продолжите исходную задачу Артура с учётом загруженных инструкций. Не повторяйте load_skill для уже загруженного скилла.':prompt,images:round?[]:images,threadId,signal,onThread,skillPolicy,schema});
      threadId=result.threadId;
      const reply=JSON.parse(result.text);const requests=reply.actions?.filter(x=>x.kind==='load_skill')||[];
      if(!requests.length)return result;
      if(round===3||requests.length>3||requests.length!==reply.actions.length)throw new Error('Недопустимый запрос загрузки скиллов');
      for(const action of requests){
        if(loaded.has(action.path))throw new Error('Скилл уже загружен');
        const body=catalog.read(action.path);loaded.set(action.path,body);
        if([...loaded.values()].reduce((sum,text)=>sum+Buffer.byteLength(text),0)>192000)throw new Error('Инструкции скиллов слишком большие');
      }
    }
  }
  async runTurn({ prompt, images=[], threadId, signal, onThread = ()=>{},skillPolicy='',schema=responseSchema }) {
    if(signal?.aborted) throw new Error('Запрос остановлен');
    const rpc=this.factory(); let currentThread=threadId; let currentTurn=null; const messages=new Map();
    let resolveTurn,rejectTurn;
    const finished=new Promise((resolve,reject)=>{resolveTurn=resolve; rejectTurn=reject;});
    // Attach a handler before initialization so early process failures are never unhandled.
    finished.catch(()=>{});
    rpc.on('failure',error=>rejectTurn(error));
    rpc.on('request',m=>refuseRequest(rpc,m));
    const backlog=[];
    const handle=m=>{
      const p=m.params || {};
      if(p.threadId!==currentThread) return;
      if(!currentTurn) { backlog.push(m); return; }
      if(m.method==='item/completed' && p.turnId===currentTurn && p.item?.type==='agentMessage' && p.item.phase!=='commentary') messages.set(p.item.id,p.item.text);
      if(m.method==='turn/completed' && p.turn?.id===currentTurn) {
        if(p.turn.status==='completed') resolveTurn();
        else rejectTurn(new Error(p.turn.status==='interrupted'?'Запрос остановлен':'Codex не завершил запрос. Проверьте авторизацию и лимиты.'));
      }
    };
    rpc.on('notification',handle);
    const abort=()=>rpc.close();
    signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>rpc.close(),300000);
    try {
      await rpc.request('initialize',{clientInfo:{name:'jarvis_telegram',version:'0.1.0'},capabilities:{experimentalApi:false}});
      rpc.notify('initialized');
      const policy=threadPolicy(this.config.cwd,this.config.enhanced);
      policy.developerInstructions+='\n'+skillPolicy;
      const result=threadId ? await rpc.request('thread/resume',{threadId,excludeTurns:true,...policy}) : await rpc.request('thread/start',{...policy,ephemeral:false});
      currentThread=result.thread.id; onThread(currentThread);
      if(signal?.aborted) throw new Error('Запрос остановлен');
      // This CLI preserves initial developer instructions on resume. Append a trusted
      // capability update once per worker/policy instead of relying on resume overrides.
      if(threadId && this.appliedPolicies.get(currentThread)!==policy.developerInstructions){
        await rpc.request('thread/inject_items',{threadId:currentThread,items:[{type:'message',role:'developer',content:[{type:'input_text',text:policy.developerInstructions}]}]});
      }
      this.appliedPolicies.set(currentThread,policy.developerInstructions);
      if(signal?.aborted) throw new Error('Запрос остановлен');
      const started=await rpc.request('turn/start',{threadId:currentThread,input:[{type:'text',text:prompt},...images],...(this.config.enhanced?{outputSchema:schema}:{}),approvalPolicy:'on-request',approvalsReviewer:'user',sandboxPolicy:{type:'readOnly',networkAccess:false}});
      currentTurn=started.turn.id;
      for(const m of backlog) handle(m);
      await finished;
      if(signal?.aborted) throw new Error('Запрос остановлен');
      const text=[...messages.values()].filter(Boolean).join('\n\n');
      if(!text) throw new Error('Codex вернул пустой ответ');
      return {text,threadId:currentThread};
    } catch(error) {
      if(signal?.aborted) throw new Error('Запрос остановлен');
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort',abort); rpc.close(); }
  }
}

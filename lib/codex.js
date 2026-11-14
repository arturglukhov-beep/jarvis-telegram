import { RpcClient } from './rpc.js';
import { threadPolicy, codexArgs, childEnv, refuseRequest } from './policy.js';
export class CodexBackend {
  constructor(config, factory) {
    this.config=config; this.factory=factory || (()=>new RpcClient({command:config.codexBin,args:codexArgs(),cwd:config.cwd,env:childEnv(config)}));
  }
  async run({ prompt, threadId, signal, onThread = ()=>{} }) {
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
      const policy=threadPolicy(this.config.cwd);
      const result=threadId ? await rpc.request('thread/resume',{threadId,excludeTurns:true,...policy}) : await rpc.request('thread/start',{...policy,ephemeral:false});
      currentThread=result.thread.id; onThread(currentThread);
      if(signal?.aborted) throw new Error('Запрос остановлен');
      const started=await rpc.request('turn/start',{threadId:currentThread,input:[{type:'text',text:prompt}],approvalPolicy:'untrusted',approvalsReviewer:'user',sandboxPolicy:{type:'readOnly',networkAccess:false}});
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

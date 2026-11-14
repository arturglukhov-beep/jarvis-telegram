export class AgentService {
  constructor(backend,store) { this.backend=backend; this.store=store; this.tail=Promise.resolve(); this.generation=0; this.pending=0; this.active=null; }
  submit(chatId,prompt,options={}) {
    if(this.pending>=4) return Promise.reject(new Error('Очередь заполнена. Дождитесь ответа или отправьте /stop.'));
    const generation=this.generation; this.pending++;
    const result=this.tail.then(async()=>{
      if(generation!==this.generation) throw new Error('Запрос остановлен');
      const controller=new AbortController(); this.active=controller;
      try {
        const prepared=options.prepare?await options.prepare(controller.signal):{prompt,images:options.images||[]};
        if(controller.signal.aborted) throw new Error('Запрос остановлен');
        return await this.backend.run({...prepared,threadId:this.store.session(chatId),signal:controller.signal,onThread:id=>this.store.setSession(chatId,id)});
      } finally { if(this.active===controller) this.active=null; }
    }).finally(()=>this.pending--);
    this.tail=result.catch(()=>{}); return result;
  }
  stop() { this.generation++; this.active?.abort(); }
  newDialog(chatId) {
    if(this.pending) throw new Error('Сначала отправьте /stop и дождитесь остановки.');
    this.store.setSession(chatId,null);
  }
  async close() { this.stop(); await this.tail; }
}

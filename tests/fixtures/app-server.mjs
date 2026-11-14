import readline from 'node:readline';
let seq = 0; let turn = null;let currentPolicy=false;
const send = obj => process.stdout.write(JSON.stringify(obj)+'\n');
readline.createInterface({ input: process.stdin }).on('line', line => {
  const m = JSON.parse(line);
  if (!m.method) {
    if (m.id === 'approval' && m.result?.decision !== 'decline') process.exit(4);
    return;
  }
  if (m.method === 'fragment') { const s=JSON.stringify({id:m.id,result:{text:'Русский'}})+'\n'; const b=Buffer.from(s); const cut=b.indexOf(Buffer.from('Рус'))+1; process.stdout.write(b.subarray(0,cut)); setTimeout(()=>process.stdout.write(b.subarray(cut)),5); return; }
  if (m.method === 'malformed') { process.stdout.write('bad json\n'); return; }
  if (m.method === 'exit') { process.exit(3); }
  if (m.method === 'hang') return;
  if (m.method === 'initialize') { send({id:m.id,result:{userAgent:'fixture'}}); return; }
  if (m.method === 'initialized') return;
  if (m.method === 'thread/start') { currentPolicy=Boolean(m.params.developerInstructions?.includes('Можно предлагать command')); send({id:m.id,result:{thread:{id:'thread-'+(++seq)}}}); return; }
  if (m.method === 'thread/resume') { send({id:m.id,result:{thread:{id:m.params.threadId}}}); return; }
  if (m.method === 'thread/inject_items') {
    if(m.params.threadId==='inject-failure'){send({id:m.id,error:{code:-32000,message:'Policy injection rejected'}});return;}
    currentPolicy=m.params.items.some(x=>x.role==='developer'&&x.content?.some(c=>c.text?.includes('Можно предлагать command')));send({id:m.id,result:{}});return;
  }
  if (m.method === 'turn/start') {
    const text=m.params.input[0].text;
    if (text.includes('crash')) return process.exit(5);
    turn={id:'turn-'+(++seq),threadId:m.params.threadId};
    send({id:m.id,result:{turn:{id:turn.id,status:'inProgress'}}});
    const current=turn;
    if (text.includes('approval')) send({id:'approval',method:'item/commandExecution/requestApproval',params:{threadId:current.threadId,turnId:current.id,command:'rm -rf /'}});
    setTimeout(()=>{
      if (turn !== current) return;
      send({method:'item/completed',params:{threadId:current.threadId,turnId:current.id,item:{id:'msg',type:'agentMessage',text:text.includes('policy-refresh')?JSON.stringify({text:currentPolicy?'Подготовлена команда':'В этой сессии выполнить не могу',actions:currentPolicy?[{kind:'command',argv:['python3','--version'],cwd:'command-playground',path:null,content:null,text:null,at:null,daily:null,id:null}]:[]}):'Ответ Jarvis'}}});
      send({method:'turn/completed',params:{threadId:current.threadId,turn:{id:current.id,status:text.includes('failure')?'failed':'completed',error:text.includes('failure')?{message:'failure'}:null}}});
    },text.includes('slow')?5000:25); return;
  }
  if (m.method === 'turn/interrupt') { const old=turn; turn=null; send({id:m.id,result:{}}); if(old) send({method:'turn/completed',params:{threadId:old.threadId,turn:{id:old.id,status:'interrupted'}}}); return; }
  send({id:m.id,result:{}});
});

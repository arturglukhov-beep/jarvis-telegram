import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
export class RpcClient extends EventEmitter {
  constructor({ command, args = [], cwd, env, timeout = 30000 }) {
    super(); this.pending = new Map(); this.nextId = 0; this.buffer = ''; this.dead = false; this.timeout = timeout;
    this.child = spawn(command, args, { cwd, env, stdio: ['pipe','pipe','pipe'], shell: false });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => this.consume(chunk));
    // Do not log stderr: remote services may print credentials or private prompts.
    this.child.stderr.on('data', () => {});
    this.child.stdin.on('error', () => this.fail(new Error('Codex connection closed')));
    this.child.on('error', () => this.fail(new Error('Codex could not start')));
    this.child.on('close', () => this.fail(new Error('Codex process exited')));
  }
  consume(chunk) {
    if (this.dead) return;
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > 4*1024*1024) return this.fail(new Error('Codex protocol size limit'));
    while (this.buffer.includes('\n') && !this.dead) {
      const pos=this.buffer.indexOf('\n'); const line=this.buffer.slice(0,pos); this.buffer=this.buffer.slice(pos+1);
      if (!line.trim()) continue;
      let m; try { m=JSON.parse(line); } catch { return this.fail(new Error('Codex protocol invalid JSON')); }
      if (!m || typeof m !== 'object' || Array.isArray(m)) return this.fail(new Error('Codex protocol invalid message'));
      if (m.method && m.id !== undefined) { this.emit('request',m); continue; }
      if (m.method) { this.emit('notification',m); continue; }
      const pending=this.pending.get(m.id); if (!pending) continue;
      this.pending.delete(m.id); clearTimeout(pending.timer);
      if (m.error) pending.reject(new Error('Codex RPC request failed')); else pending.resolve(m.result);
    }
  }
  send(message) {
    if (this.dead) throw new Error('Codex connection closed');
    this.child.stdin.write(JSON.stringify(message)+'\n');
  }
  request(method, params = {}) {
    if (this.dead) return Promise.reject(new Error('Codex connection closed'));
    if (this.pending.size >= 32) return Promise.reject(new Error('Codex pending request limit'));
    const id=++this.nextId;
    return new Promise((resolve,reject) => {
      const timer=setTimeout(()=>this.fail(new Error('Codex RPC timeout')),this.timeout);
      this.pending.set(id,{resolve,reject,timer});
      try { this.send({id,method,params}); } catch(e) { this.fail(e); }
    });
  }
  notify(method, params = {}) { this.send({method,params}); }
  respond(id, result) { this.send({id,result}); }
  rejectRequest(id) { this.send({id,error:{code:-32601,message:'Tool unavailable in text-only mode'}}); }
  fail(error) {
    if (this.dead) return;
    this.dead=true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear(); this.emit('failure',error); this.child.kill('SIGTERM');
    const timer=setTimeout(()=>{ if(this.child.exitCode===null) this.child.kill('SIGKILL'); },1000); timer.unref();
  }
  close() { this.fail(new Error('Codex connection closed')); }
}

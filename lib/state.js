import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export class StateStore {
  constructor(dir) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.path = join(dir, 'state.json');
    this.value = { version: 1, ownerId: null, sessions: {}, lastUpdate: -1 };
    if (existsSync(this.path)) {
      try {
        if (lstatSync(this.path).isSymbolicLink()) throw new Error();
        const v = JSON.parse(readFileSync(this.path, 'utf8'));
        if (v.version !== 1 || !v.sessions || typeof v.sessions !== 'object' || Array.isArray(v.sessions) ||
            !Number.isSafeInteger(v.lastUpdate) || (v.ownerId !== null && !/^[1-9]\d{0,15}$/.test(v.ownerId))) throw new Error();
        for (const [key, val] of Object.entries(v.sessions)) if (!/^\d+$/.test(key) || (val !== null && typeof val !== 'string')) throw new Error();
        this.value = v;
      } catch { throw new Error('Invalid state: сохранённое состояние повреждено; запуск остановлен'); }
    }
  }
  save() {
    const temp = `${this.path}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(this.value), { mode: 0o600, flag: 'wx', flush: true });
    renameSync(temp, this.path);
  }
  session(id) { return this.value.sessions[String(id)] || null; }
  setSession(id, threadId) { this.value.sessions[String(id)] = threadId; this.save(); }
  seenUpdate(id) { return id <= this.value.lastUpdate; }
  markUpdate(id) { this.value.lastUpdate = Math.max(id, this.value.lastUpdate); this.save(); }
  owner() { return this.value.ownerId; }
  setOwner(id) { this.value.ownerId = String(id); this.save(); }
}

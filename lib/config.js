import { existsSync, realpathSync, lstatSync, readFileSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
export function canonical(path) {
  path = resolve(path);
  return existsSync(path) ? realpathSync(path) : join(canonical(dirname(path)), basename(path));
}
export function loadConfig(env = process.env) {
  const home = canonical(env.JARVIS_HOME || '/home/agent');
  const dataDir = canonical(env.DATA_DIR || join(home, '.local/share/jarvis-telegram'));
  if (dataDir === join(home, '.agent') || dataDir.startsWith(join(home, '.agent/')))
    throw new Error('Protected .agent: запрещённый каталог состояния');
  return { home, dataDir, codexHome: join(dataDir, 'codex'), cwd: join(dataDir, 'workspace'),
    token: env.BOT_TOKEN || '', ownerId: env.OWNER_ID || '', pairingHash: env.PAIRING_HASH || '',
    codexBin: env.CODEX_BIN || join(home, '.local/bin/jarvis-codex'),
    expectedBot: 'bestsled1126_bot', timezone: 'Asia/Kamchatka', mode: 'text-only' };
}
export function validateConfig(c) {
  const errors = [];
  if (!/^\d+:[\w-]+$/.test(c.token)) errors.push('BOT_TOKEN отсутствует или имеет неверный формат');
  if (!/^[1-9]\d{0,15}$/.test(c.ownerId) && !/^[a-f0-9]{64}$/.test(c.pairingHash)) errors.push('Нужен OWNER_ID либо PAIRING_HASH');
  if (c.ownerId && !/^[1-9]\d{0,15}$/.test(c.ownerId)) errors.push('OWNER_ID должен быть числовым');
  if (!existsSync(c.codexBin)) errors.push('CODEX_BIN не найден');
  for (const name of ['SOUL.md', 'MEMORY.md', 'GOALS.md']) if (!existsSync(join(c.home, name))) errors.push(`Нет ${name}`);
  return { ok: !errors.length, errors, mode: c.mode };
}
export function loadMemory(home, now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kamchatka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const names = ['AGENTS.md','SOUL.md','USER.md','MEMORY.md','MISSION.md','GOALS.md','PROJECTS.md','PREFERENCES.md','LEARNED.md'];
  for (let i = 0; i < 3; i++) names.push(`memory/${new Date(Date.parse(date+'T00:00:00Z') - i*86400000).toISOString().slice(0,10)}.md`);
  let total = 0;
  return names.flatMap(name => {
    const path = join(home, name); if (!existsSync(path)) return [];
    if (lstatSync(path).isSymbolicLink() || canonical(path) !== path) throw new Error('Symbolic link in memory: отказ');
    const stat = lstatSync(path); if (!stat.isFile() || stat.size > 128000) throw new Error('Memory document too large');
    const data = readFileSync(path, 'utf8'); total += data.length;
    if (total > 250000) throw new Error('Memory context too large');
    return [`\n--- ${name} ---\n${data}`];
  }).join('\n');
}

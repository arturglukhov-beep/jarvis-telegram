import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, validateConfig, loadMemory } from '../lib/config.js';
import { StateStore } from '../lib/state.js';
const fixture = () => mkdtempSync(join(tmpdir(), 'jarvis-test-'));
test('missing credentials block startup without disclosing token', () => {
  const c = loadConfig({ BOT_TOKEN: 'test-sensitive-token' });
  const report = validateConfig(c);
  assert.equal(report.ok, false);
  assert.match(report.errors.join(' '), /OWNER_ID|PAIRING/);
  assert.doesNotMatch(JSON.stringify(report), /test-sensitive-token/);
});
test('state cannot resolve into protected .agent through symlink', () => {
  const root = fixture(); mkdirSync(join(root, '.agent')); symlinkSync(join(root, '.agent'), join(root, 'alias'));
  assert.throws(() => loadConfig({ JARVIS_HOME: root, DATA_DIR: join(root, 'alias') }), /protected|запрещ/i);
});
test('memory loads explicit documents and Kamchatka last three dates only', () => {
  const root = fixture(); mkdirSync(join(root, 'memory'));
  writeFileSync(join(root, 'SOUL.md'), 'Jarvis identity');
  writeFileSync(join(root, 'memory/2026-11-15.md'), 'today Kamchatka');
  writeFileSync(join(root, 'memory/2026-11-13.md'), 'two days ago');
  writeFileSync(join(root, 'memory/2026-11-12.md'), 'too old');
  const memory = loadMemory(root, new Date('2026-11-14T13:00:00Z'));
  assert.match(memory, /Jarvis identity/); assert.match(memory, /today Kamchatka/);
  assert.match(memory, /two days ago/); assert.doesNotMatch(memory, /too old/);
});
test('memory refuses a symlink to an unapproved file', () => {
  const root = fixture(); const secret = join(fixture(), 'secret'); writeFileSync(secret, 'do not load');
  symlinkSync(secret, join(root, 'MEMORY.md'));
  assert.throws(() => loadMemory(root), /symbolic|ссылк/i);
});
test('state persists sessions and update cursor with private permissions', () => {
  const dir = fixture(); const store = new StateStore(dir);
  store.setSession('123', 'thread-1'); store.markUpdate(456);
  const loaded = new StateStore(dir);
  assert.equal(loaded.session('123'), 'thread-1'); assert.equal(loaded.seenUpdate(456), true);
  assert.equal(statSync(join(dir, 'state.json')).mode & 0o777, 0o600);
});
test('corrupt state fails closed instead of forgetting owner and deduplication', () => {
  const dir = fixture(); writeFileSync(join(dir, 'state.json'), 'bad json');
  assert.throws(() => new StateStore(dir), /state|состояни/i);
});

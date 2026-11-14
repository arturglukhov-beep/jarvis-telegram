import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareRuntime } from '../lib/runtime.js';
import { childEnv, threadPolicy, codexArgs } from '../lib/policy.js';
const root=()=>mkdtempSync(join(tmpdir(),'jarvis-runtime-'));
test('isolated Codex config does not inherit Telegram or OpenAI API tokens',()=>{
  const old=process.env.BOT_TOKEN; process.env.BOT_TOKEN='private-test-token';
  try {const e=childEnv({codexHome:'/isolated'}); assert.equal(e.BOT_TOKEN,undefined); assert.equal(e.OPENAI_API_KEY,undefined); assert.equal(e.CODEX_HOME,'/isolated');} finally {if(old===undefined)delete process.env.BOT_TOKEN;else process.env.BOT_TOKEN=old;}
});
test('runtime creates a private home and disables command, app and web tools',()=>{
  const base=root(); const source=join(base,'source'); mkdirSync(source); writeFileSync(join(source,'auth.json'),'{}');
  const c={dataDir:join(base,'data'),codexHome:join(base,'data/codex'),cwd:join(base,'data/workspace')};
  prepareRuntime(c,source);
  const config=readFileSync(join(c.codexHome,'config.toml'),'utf8');
  assert.match(config,/shell_tool = false/); assert.match(config,/web_search = "disabled"/);
  assert.equal(statSync(c.codexHome).mode&0o777,0o700);
  assert.equal(threadPolicy(c.cwd).sandbox,'read-only');
  assert.equal(codexArgs().includes('--dangerously-bypass-approvals-and-sandbox'),false);
});
test('missing auth fails before attempting model requests',()=>{
  const base=root(); const c={dataDir:join(base,'data'),codexHome:join(base,'data/codex'),cwd:join(base,'data/workspace')};
  assert.throws(()=>prepareRuntime(c,base),/авторизац/i);
});
test('runtime uses an approval policy accepted by installed Codex and routes approvals to user',()=>{
  assert.equal(threadPolicy('/tmp').approvalPolicy,'on-request');
  assert.equal(threadPolicy('/tmp').approvalsReviewer,'user');
});
test('Codex credential refresh may replace its symlink with a private cache file',()=>{
 const base=root();const source=join(base,'source');mkdirSync(source);writeFileSync(join(source,'auth.json'),'{}');
 const c={dataDir:join(base,'data'),codexHome:join(base,'data/codex'),cwd:join(base,'data/workspace')};
 mkdirSync(c.codexHome,{recursive:true});writeFileSync(join(c.codexHome,'auth.json'),'{}',{mode:0o600});
 assert.doesNotThrow(()=>prepareRuntime(c,source));
});

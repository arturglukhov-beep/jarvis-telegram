import { existsSync, lstatSync, realpathSync } from 'node:fs';
export const envFile='/home/agent/.config/jarvis-telegram/env';
export function loadSecrets(path=envFile) {
  if(!existsSync(path)) return false;
  const stat=lstatSync(path);
  if(!stat.isFile() || stat.isSymbolicLink() || realpathSync(path)!==path || (stat.mode & 0o077) || stat.uid!==process.getuid()) throw new Error('Небезопасные права файла конфигурации');
  process.loadEnvFile(path); return true;
}

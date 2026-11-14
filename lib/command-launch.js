import{join}from'node:path';
export function sandboxLaunch(job,runtimeRoot,codex,program){
 const bwrap='/home/agent/.local/bin/codex-resources/bwrap';
 return['/usr/bin/setpriv','--no-new-privs',bwrap,'--unshare-user','--unshare-pid','--unshare-net','--unshare-ipc','--unshare-uts','--die-with-parent','--new-session',
  '--ro-bind','/usr','/usr','--symlink','usr/bin','/bin','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--dir','/etc','--ro-bind','/etc/ld.so.cache','/etc/ld.so.cache',
  '--size','67108864','--tmpfs','/tmp','--dir','/run','--ro-bind',runtimeRoot,runtimeRoot,'--ro-bind',bwrap,bwrap,'--ro-bind',job.snapshotDir,job.snapshotDir,'--ro-bind',job.home,job.home,
  '--proc','/proc','--dev','/dev','--size','67108864','--tmpfs',job.workspace,'--remount-ro','/','--chdir',job.workspace,'--','/usr/bin/python3',join(runtimeRoot,'command-init.py'),job.snapshotDir,job.workspace,join(job.home,'config.toml'),codex,...program,...job.argv.slice(1)];
}

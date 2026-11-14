from pathlib import Path
import os,shutil,sys
source,workspace,profile,codex=map(Path,sys.argv[1:5])
shutil.copytree(source,workspace,dirs_exist_ok=True,symlinks=True)
config=workspace/'.command-config';config.mkdir(mode=0o700)
shutil.copy2(profile,config/'config.toml')
(workspace/'.tmp').mkdir(exist_ok=True,mode=0o700)
(workspace/'.jarvis-root').touch()
os.environ['CODEX_HOME']=str(config);os.chdir(workspace)
os.execv(str(codex),[str(codex),'sandbox','-P','command','-C',str(workspace),'/usr/bin/python3',str(codex.parent/'command-relay.py'),*sys.argv[5:]])

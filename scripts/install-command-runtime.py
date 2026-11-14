#!/usr/bin/env python3
"""Copy only public pinned executables outside denied home/tmp; never copy auth."""
from pathlib import Path
import hashlib
import json
import os
import shutil
root = Path('/var/tmp') / f'jarvis-command-runtime-{os.getuid()}'
root.mkdir(exist_ok=True, mode=0o700)
if root.is_symlink() or root.stat().st_uid != os.getuid():
    raise SystemExit('Unsafe command runtime directory')
root.chmod(0o700)
source = Path('/home/agent/.local/bin/jarvis-codex')
target = root / 'jarvis-codex'
if not target.exists():
    shutil.copy2(source, target)
node_source = Path('/home/agent/.local/opt/node-v24.22.3-linux-x64')
node_target = root / 'node'
if not node_target.exists():
    shutil.copytree(node_source, node_target, symlinks=True)
def sha(path):
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()
if sha(source) != sha(target) or sha(node_source / 'bin/node') != sha(node_target / 'bin/node'):
    raise SystemExit('Public runtime checksum mismatch')
for script in ['command-init.py', 'command-relay.py']:
    shutil.copy2(Path(__file__).resolve().parent / script, root / script)
(root / 'manifest.json').write_text(json.dumps({'cli_sha256': sha(target), 'node_sha256': sha(node_target / 'bin/node')}))
print('Pinned public runtime ready; credentials were not copied.')

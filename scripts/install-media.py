#!/usr/bin/env python3
"""Install pinned local media tools without sudo or paid APIs."""
from pathlib import Path
import os
import subprocess
import urllib.request
import venv
root = Path('/home/agent/.local/share/jarvis-telegram')
root.mkdir(parents=True, exist_ok=True, mode=0o700)
venv_path = root / 'voice-venv'
venv.EnvBuilder(with_pip=False).create(venv_path)
tools = root / 'tools'
tools.mkdir(exist_ok=True, mode=0o700)
pip = tools / 'pip.pyz'
if not pip.exists():
    urllib.request.urlretrieve('https://bootstrap.pypa.io/pip/pip.pyz', pip)
env = {key: os.environ[key] for key in ['PATH', 'HOME', 'LANG'] if key in os.environ}
python = str(venv_path / 'bin/python3')
requirements = Path(__file__).resolve().parents[1] / 'deploy/media-requirements.txt'
subprocess.run([python, str(pip), 'install', '--only-binary=:all:', '-r', str(requirements)], env=env, check=True)
code = "from faster_whisper.utils import download_model; download_model('base',output_dir='/home/agent/.local/share/jarvis-telegram/voice-models/base')"
subprocess.run([python, '-c', code], env=env, check=True)
print('Local speech and PDF runtime ready. No paid service configured.')

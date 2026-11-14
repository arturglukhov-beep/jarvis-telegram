#!/bin/sh
set -eu
if [ "$(id -u)" -ne 0 ]; then
  echo 'Run this script with sudo in your server terminal.' >&2
  exit 1
fi
profile_source=/home/agent/projects/jarvis-telegram/deploy/jarvis-bwrap.apparmor
profile_target=/etc/apparmor.d/jarvis-bwrap
if [ -e "$profile_target" ]; then
  if ! cmp -s "$profile_source" "$profile_target"; then
    echo 'Existing profile differs and was preserved. Review it before replacing.' >&2
    exit 1
  fi
else
  install -m 0644 -o root -g root "$profile_source" "$profile_target"
fi
apparmor_parser -r "$profile_target"
echo 'Exact bubblewrap profile loaded. Global AppArmor/userns settings were not changed.'
echo 'Run: node /home/agent/projects/jarvis-telegram/scripts/check-sandbox.js'

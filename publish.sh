#!/usr/bin/env bash
set -euo pipefail

message="${1:-Publish Folder Browser Stash plugin source}"

if [ ! -d .git ]; then
  echo "Run this script from the plugin source repository root." >&2
  exit 1
fi

git add .
git commit -m "$message" || true
git push origin main

echo
echo "Repository pushed."
echo "Stash source URL:"
echo "https://raw.githubusercontent.com/lwshen/stash-folder-browser-plugin-source/main/index.yml"

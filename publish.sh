#!/usr/bin/env bash
set -euo pipefail

repo="${1:-stash-folder-browser-plugin-source}"

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login -h github.com" >&2
  exit 1
fi

if [ ! -d .git ]; then
  git init
  git branch -M main
fi

git add .
git commit -m "Publish Folder Browser Stash plugin source" || true
gh repo create "$repo" --public --source . --push

echo
echo "Repository pushed."
echo "Add this source URL to Stash:"
echo "https://raw.githubusercontent.com/$(gh api user --jq .login)/${repo}/main/index.yml"

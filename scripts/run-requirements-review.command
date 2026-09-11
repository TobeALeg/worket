#!/bin/zsh
set -euo pipefail
REVIEW_PROJECT_ROOT="${0:A:h:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  REVIEW_NODE_CANDIDATES=("$HOME"/.nvm/versions/node/*/bin/node(Nn))
  if (( ${#REVIEW_NODE_CANDIDATES} == 0 )); then
    print '需要 Node.js 22 或更新版本才能打开本地审阅页面。'
    read -k 1 '?按任意键关闭'
    exit 1
  fi
  export PATH="${REVIEW_NODE_CANDIDATES[-1]:h}:$PATH"
fi
cd "$REVIEW_PROJECT_ROOT"
exec node experiments/conversation-requirements/review/launch.mjs

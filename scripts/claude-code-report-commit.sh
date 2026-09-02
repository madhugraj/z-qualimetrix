#!/usr/bin/env bash
# Reports an exact commit -> Claude Code session link to QualiMetrix.
#
# Installed as a PostToolUse hook (matcher: "Bash") via
# install-claude-code-hook.sh. Must never block or slow down the triggering
# `git commit` — every external call below is best-effort, backgrounded, and
# silenced. Requires QUALIMETRIX_CONNECTION_ID / QUALIMETRIX_CONNECTION_TOKEN
# in the environment (see install-claude-code-hook.sh) and `jq` on PATH.
set -u

input="$(cat)"

command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)

[ -z "$command" ] && exit 0
[ -z "$session_id" ] && exit 0
case "$command" in
  *git\ commit*) ;;
  *) exit 0 ;;
esac

[ -z "${QUALIMETRIX_CONNECTION_ID:-}" ] && exit 0
[ -z "${QUALIMETRIX_CONNECTION_TOKEN:-}" ] && exit 0

sha=$(git rev-parse HEAD 2>/dev/null) || exit 0
remote_url=$(git remote get-url origin 2>/dev/null) || exit 0
repo=$(printf '%s' "$remote_url" | sed -E 's#^(git@|https://)([^:/]+)[:/]##; s#\.git$##')
[ -z "$repo" ] && exit 0

api_base="${QUALIMETRIX_API_BASE:-https://app.qualimetrix.ai/api/v1}"

(
  curl --max-time 2 --fail --silent \
    -X POST "${api_base}/ai-usage/commit-attribution/${QUALIMETRIX_CONNECTION_ID}" \
    -H "Content-Type: application/json" \
    -H "x-qualimetrix-connection-token: ${QUALIMETRIX_CONNECTION_TOKEN}" \
    -d "{\"sha\":\"${sha}\",\"repo\":\"${repo}\",\"sessionId\":\"${session_id}\"}" \
    >/dev/null 2>&1 || true
) &
disown

exit 0

#!/usr/bin/env bash
# Opt-in installer for the Claude Code commit-attribution hook. Run manually
# per developer — never applied automatically. Wires
# claude-code-report-commit.sh into this repo's .claude/settings.json as a
# PostToolUse hook, so an exact (non-heuristic) attribution record is reported
# whenever Claude Code runs `git commit` in this repo.
#
# Before running: set QUALIMETRIX_CONNECTION_ID and QUALIMETRIX_CONNECTION_TOKEN
# in your shell profile — get both from your tenant's Integrations page under
# the connected Claude Code provider connection.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK_SCRIPT="$REPO_ROOT/scripts/claude-code-report-commit.sh"
SETTINGS_FILE="$REPO_ROOT/.claude/settings.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (brew install jq / apt-get install jq)" >&2
  exit 1
fi

mkdir -p "$REPO_ROOT/.claude"
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

tmp="$(mktemp)"
jq --arg cmd "$HOOK_SCRIPT" '
  .hooks //= {} |
  .hooks.PostToolUse //= [] |
  if ([.hooks.PostToolUse[].hooks[]?.command] | index($cmd)) then .
  else .hooks.PostToolUse += [{"matcher": "Bash", "hooks": [{"type": "command", "command": $cmd}]}]
  end
' "$SETTINGS_FILE" > "$tmp" && mv "$tmp" "$SETTINGS_FILE"

chmod +x "$HOOK_SCRIPT"

echo "Installed commit-attribution hook into $SETTINGS_FILE"
echo "Make sure QUALIMETRIX_CONNECTION_ID and QUALIMETRIX_CONNECTION_TOKEN are set in your shell profile, then restart Claude Code."

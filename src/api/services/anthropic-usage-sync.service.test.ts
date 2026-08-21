import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEnterpriseClaudeCodeActivity } from "./anthropic-usage-sync.service";

test("Enterprise activity normalization follows Anthropic's nested Claude Code schema", () => {
  const normalized = normalizeEnterpriseClaudeCodeActivity({
    user: { id: "user_01", email_address: "developer@example.com" },
    claude_code_metrics: {
      core_metrics: {
        distinct_session_count: 7,
        commit_count: 4,
        pull_request_count: 2,
        lines_of_code: { added_count: 125, removed_count: 31 },
      },
      tool_actions: {
        Edit: { accepted: 9, rejected: 1 },
        Write: { accepted: 3, rejected: 2 },
      },
    },
  });

  assert.deepEqual(normalized, {
    sessionCount: 7,
    commits: 4,
    pullRequests: 2,
    linesAdded: 125,
    linesRemoved: 31,
    suggestionsAccepted: 12,
    suggestionsRejected: 3,
    toolMetrics: {
      Edit: { accepted: 9, rejected: 1 },
      Write: { accepted: 3, rejected: 2 },
    },
  });
});

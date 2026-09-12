import assert from "node:assert/strict";
import test from "node:test";
import { resolveSelectedUserEmails, deriveProductKey, type JiraUserSummary } from "./integration.controller";

function user(overrides: Partial<JiraUserSummary>): JiraUserSummary {
  return { accountId: "acc-1", displayName: "Someone", emailAddress: null, avatarUrl: null, ...overrides };
}

test("resolves emails for selected accounts that have a public Jira email", () => {
  const available = [
    user({ accountId: "acc-1", displayName: "Madhu", emailAddress: "madhu.r@yavar.ai" }),
    user({ accountId: "acc-2", displayName: "Karthikeyan", emailAddress: "karthikeyan@yavar.ai" }),
  ];

  const result = resolveSelectedUserEmails(["acc-1", "acc-2"], available);

  assert.deepEqual(result, {
    emails: ["madhu.r@yavar.ai", "karthikeyan@yavar.ai"],
    unresolvedAccountIds: [],
  });
});

test("reports privacy-restricted selections instead of silently dropping them", () => {
  // Reproduces the real bug: 26 selected, only 1 has a public email because
  // Jira's per-user email-visibility setting hides the rest from
  // /rest/api/3/users/search — the exact shape seen against the live
  // yavar-tech-team.atlassian.net site.
  const available = [
    user({ accountId: "acc-madhu", displayName: "Madhu", emailAddress: "madhu.r@yavar.ai" }),
    user({ accountId: "acc-bragadeesh", displayName: "Bragadeesh Sundararajan", emailAddress: null }),
    user({ accountId: "acc-karthikeyan", displayName: "karthikeyan", emailAddress: null }),
  ];

  const result = resolveSelectedUserEmails(
    ["acc-madhu", "acc-bragadeesh", "acc-karthikeyan"],
    available
  );

  assert.deepEqual(result.emails, ["madhu.r@yavar.ai"]);
  assert.deepEqual(new Set(result.unresolvedAccountIds), new Set(["acc-bragadeesh", "acc-karthikeyan"]));
});

test("a selected accountId no longer present in the Jira directory is also reported as unresolved, not silently dropped", () => {
  const available = [user({ accountId: "acc-1", displayName: "Madhu", emailAddress: "madhu.r@yavar.ai" })];

  const result = resolveSelectedUserEmails(["acc-1", "acc-deactivated"], available);

  assert.deepEqual(result.emails, ["madhu.r@yavar.ai"]);
  assert.deepEqual(result.unresolvedAccountIds, ["acc-deactivated"]);
});

test("duplicate accountIds in the selection are deduplicated", () => {
  const available = [user({ accountId: "acc-1", displayName: "Madhu", emailAddress: "madhu.r@yavar.ai" })];

  const result = resolveSelectedUserEmails(["acc-1", "acc-1"], available);

  assert.deepEqual(result.emails, ["madhu.r@yavar.ai"]);
});

test("empty selection resolves to no emails and no unresolved entries", () => {
  const result = resolveSelectedUserEmails([], []);
  assert.deepEqual(result, { emails: [], unresolvedAccountIds: [] });
});

test("deriveProductKey lowercases and hyphenates an Azure DevOps project name", () => {
  assert.equal(deriveProductKey("Contoso Web Platform"), "contoso-web-platform");
});

test("deriveProductKey collapses special characters and punctuation into single hyphens", () => {
  assert.equal(deriveProductKey("Acme & Co. — Payments API!"), "acme-co-payments-api");
});

test("deriveProductKey trims leading/trailing hyphens left by leading/trailing punctuation", () => {
  assert.equal(deriveProductKey("  (Legacy) Billing  "), "legacy-billing");
});

test("deriveProductKey truncates to the 50-char VarChar limit on Product.key", () => {
  const longName = "A".repeat(80);
  const key = deriveProductKey(longName);
  assert.equal(key.length, 50);
  assert.equal(key, "a".repeat(50));
});

test("deriveProductKey falls back to a non-empty placeholder for a name with no alphanumeric characters", () => {
  assert.equal(deriveProductKey("*** ---"), "project");
});

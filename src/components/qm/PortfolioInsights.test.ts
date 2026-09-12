import assert from "node:assert/strict";
import test from "node:test";
import { buildPortfolioInsights } from "./PortfolioInsights";

test("no insights when nothing is wrong", () => {
  const insights = buildPortfolioInsights({
    backlogSummary: {
      total: 10, byPriority: {}, byType: {}, byStatus: {},
      oldestCreatedAt: null, unassignedCriticalHigh: 0, hasData: true,
    },
    epicSummary: {
      totalEpics: 5, epicsWithNoChildren: 0, avgPercentComplete: 80,
      byHealth: { on_track: 5, at_risk: 0, blocked: 0 }, byStatus: {},
      byProgressBucket: { no_data: 0, "0-25": 0, "25-50": 0, "50-75": 0, "75-100": 5 },
      orphanBugCount: 1, totalBugCount: 20,
    },
  });
  assert.deepEqual(insights, []);
});

test("flags unassigned critical/high backlog as the top priority", () => {
  const insights = buildPortfolioInsights({
    backlogSummary: {
      total: 10, byPriority: {}, byType: {}, byStatus: {},
      oldestCreatedAt: null, unassignedCriticalHigh: 135, hasData: true,
    },
  });
  assert.equal(insights.length, 1);
  assert.equal(insights[0].tone, "critical");
  assert.match(insights[0].headline, /135 critical\/high-priority items unassigned/);
});

test("singular phrasing for a count of exactly 1", () => {
  const insights = buildPortfolioInsights({
    backlogSummary: {
      total: 1, byPriority: {}, byType: {}, byStatus: {},
      oldestCreatedAt: null, unassignedCriticalHigh: 1, hasData: true,
    },
  });
  assert.match(insights[0].headline, /^1 critical\/high-priority item unassigned$/);
});

test("orphan bug rate below the 20% threshold is not surfaced as noise", () => {
  const insights = buildPortfolioInsights({
    epicSummary: {
      totalEpics: 5, epicsWithNoChildren: 0, avgPercentComplete: 80,
      byHealth: { on_track: 5, at_risk: 0, blocked: 0 }, byStatus: {},
      byProgressBucket: { no_data: 0, "0-25": 0, "25-50": 0, "50-75": 0, "75-100": 5 },
      orphanBugCount: 10, totalBugCount: 100,
    },
  });
  assert.deepEqual(insights, []);
});

test("orphan bug rate at or above 50% is escalated from ops to warning tone", () => {
  const insights = buildPortfolioInsights({
    epicSummary: {
      totalEpics: 5, epicsWithNoChildren: 0, avgPercentComplete: 80,
      byHealth: { on_track: 5, at_risk: 0, blocked: 0 }, byStatus: {},
      byProgressBucket: { no_data: 0, "0-25": 0, "25-50": 0, "50-75": 0, "75-100": 5 },
      orphanBugCount: 345, totalBugCount: 558,
    },
  });
  const orphanInsight = insights.find((i) => i.id === "orphan-bugs");
  assert.equal(orphanInsight?.tone, "warning");
  assert.match(orphanInsight!.headline, /62% of bugs \(345 of 558\)/);
});

test("blocked epics and stale epics are reported separately, both surfaced", () => {
  const insights = buildPortfolioInsights({
    epicSummary: {
      totalEpics: 20, epicsWithNoChildren: 0, avgPercentComplete: 60,
      byHealth: { on_track: 10, at_risk: 3, blocked: 7 }, byStatus: {},
      byProgressBucket: { no_data: 0, "0-25": 0, "25-50": 0, "50-75": 0, "75-100": 0 },
      orphanBugCount: 0, totalBugCount: 0,
    },
  });
  const ids = insights.map((i) => i.id);
  assert.ok(ids.includes("blocked-epics"));
  assert.ok(ids.includes("stale-epics"));
  assert.equal(insights.find((i) => i.id === "blocked-epics")?.tone, "critical");
  assert.equal(insights.find((i) => i.id === "stale-epics")?.tone, "warning");
});

test("flags the slowest workflow stage only once it's a real multi-day drag", () => {
  const noFlag = buildPortfolioInsights({
    cycleTime: {
      stages: [{ status: "Code Review", avgDays: 1.2, medianDays: 1, transitionCount: 40, totalDays: 48 }],
      bottleneckStage: "Code Review",
      hasData: true,
    },
  });
  assert.equal(noFlag.find((i) => i.id === "cycle-time-bottleneck"), undefined);

  const flagged = buildPortfolioInsights({
    cycleTime: {
      stages: [{ status: "Code Review", avgDays: 8.4, medianDays: 6, transitionCount: 228, totalDays: 1915 }],
      bottleneckStage: "Code Review",
      hasData: true,
    },
  });
  const insight = flagged.find((i) => i.id === "cycle-time-bottleneck");
  assert.equal(insight?.tone, "warning");
  assert.match(insight!.headline, /"Code Review" is the biggest systemic bottleneck — 1915 team-days lost/);
});

test("total-days ranking prevents a rare outlier stage from outranking a high-volume bottleneck", () => {
  // Reproduces exactly what live data surfaced: "Reopened" (9 transitions,
  // 2.7d avg) should NOT outrank "Ready for QA" (138 transitions, 2.4d avg)
  // just because its average happens to be slightly higher.
  const insights = buildPortfolioInsights({
    cycleTime: {
      stages: [
        { status: "Ready for QA", avgDays: 2.4, medianDays: 2, transitionCount: 138, totalDays: 331 },
        { status: "Reopened", avgDays: 2.7, medianDays: 2.5, transitionCount: 9, totalDays: 24 },
      ],
      bottleneckStage: "Ready for QA",
      hasData: true,
    },
  });
  const insight = insights.find((i) => i.id === "cycle-time-bottleneck");
  assert.match(insight!.headline, /"Ready for QA"/);
});

test("zero totalBugCount never divides by zero into a fabricated percentage", () => {
  const insights = buildPortfolioInsights({
    epicSummary: {
      totalEpics: 0, epicsWithNoChildren: 0, avgPercentComplete: null,
      byHealth: { on_track: 0, at_risk: 0, blocked: 0 }, byStatus: {},
      byProgressBucket: { no_data: 0, "0-25": 0, "25-50": 0, "50-75": 0, "75-100": 0 },
      orphanBugCount: 0, totalBugCount: 0,
    },
  });
  assert.equal(insights.find((i) => i.id === "orphan-bugs"), undefined);
});

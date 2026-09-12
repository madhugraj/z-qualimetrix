/**
 * Shared "how many days without movement counts as stale" convention.
 * Previously hardcoded independently in getEpicRollups, getComplianceSignals,
 * epics.index.tsx, and getAgeDistribution's backlog bucket edge — all
 * agreeing on 14 by coincidence, not because they shared a source. Change
 * it here once if the org's definition of "stale" ever changes.
 */
export const STALE_ITEM_THRESHOLD_DAYS = 14;

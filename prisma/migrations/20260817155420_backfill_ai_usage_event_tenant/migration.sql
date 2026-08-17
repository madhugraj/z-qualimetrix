-- ai_usage_events.tenant_id has existed since the reconciliation migration,
-- but nothing ever backfilled it for rows created before tenant-scoping was
-- wired into the application layer (src/lib/ai-usage.server.ts). Derives each
-- event's tenant from its owning user — correct in general, not just for the
-- 9 rows that exist today.
UPDATE "ai_usage_events" e
SET "tenant_id" = u."tenant_id"
FROM "users" u
WHERE e."user_id" = u."id" AND e."tenant_id" IS NULL;

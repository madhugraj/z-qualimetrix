-- Replace email-keyed User.hourlyRateCents (unused — no rows were ever set)
-- with an accountId-keyed rate, so a PM can rate any real Jira worklog
-- author regardless of whether Jira exposes their email or they have a
-- QualiMetrix login.

-- AlterTable
ALTER TABLE "users" DROP COLUMN "hourly_rate_cents";

-- CreateTable
CREATE TABLE "worklog_author_rates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "author_account_id" TEXT NOT NULL,
    "author_name" VARCHAR(255),
    "hourly_rate_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "worklog_author_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "worklog_author_rates_tenant_id_author_account_id_key" ON "worklog_author_rates"("tenant_id", "author_account_id");

-- AddForeignKey
ALTER TABLE "worklog_author_rates" ADD CONSTRAINT "worklog_author_rates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

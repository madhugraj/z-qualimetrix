-- Commit-sync scheduling fields on GitHubIntegration (github-commit-sync.service.ts)
ALTER TABLE "github_integrations" ADD COLUMN "last_synced_at" TIMESTAMPTZ;
ALTER TABLE "github_integrations" ADD COLUMN "sync_frequency_minutes" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "commits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_repository_id" UUID NOT NULL,
    "sha" VARCHAR(64) NOT NULL,
    "message" TEXT NOT NULL,
    "author_name" VARCHAR(255),
    "author_email" VARCHAR(255),
    "authored_at" TIMESTAMPTZ NOT NULL,
    "url" TEXT NOT NULL,
    "additions" INTEGER,
    "deletions" INTEGER,
    "stats_synced_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "commits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commits_product_repository_id_sha_key" ON "commits"("product_repository_id", "sha");

-- CreateIndex
CREATE INDEX "commits_tenant_id_authored_at_idx" ON "commits"("tenant_id", "authored_at");

-- CreateIndex
CREATE INDEX "commits_stats_synced_at_idx" ON "commits"("stats_synced_at");

-- AddForeignKey
ALTER TABLE "commits" ADD CONSTRAINT "commits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commits" ADD CONSTRAINT "commits_product_repository_id_fkey" FOREIGN KEY ("product_repository_id") REFERENCES "product_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "commit_attributions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "commit_id" UUID NOT NULL,
    "confidence" VARCHAR(20) NOT NULL,
    "tool" VARCHAR(50) NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "session_id" VARCHAR(255),
    "detected_trailer" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "commit_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commit_attributions_commit_id_source_key" ON "commit_attributions"("commit_id", "source");

-- CreateIndex
CREATE INDEX "commit_attributions_tenant_id_idx" ON "commit_attributions"("tenant_id");

-- CreateIndex
CREATE INDEX "commit_attributions_session_id_idx" ON "commit_attributions"("session_id");

-- AddForeignKey
ALTER TABLE "commit_attributions" ADD CONSTRAINT "commit_attributions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commit_attributions" ADD CONSTRAINT "commit_attributions_commit_id_fkey" FOREIGN KEY ("commit_id") REFERENCES "commits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

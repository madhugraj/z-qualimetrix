-- CreateTable
CREATE TABLE "deployments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_repository_id" UUID NOT NULL,
    "source" VARCHAR(30) NOT NULL,
    "external_id" VARCHAR(100) NOT NULL,
    "sha" VARCHAR(40) NOT NULL,
    "ref" VARCHAR(255),
    "environment" VARCHAR(50),
    "deployed_at" TIMESTAMPTZ NOT NULL,
    "pr_number" INTEGER,
    "pr_first_commit_at" TIMESTAMPTZ,
    "pr_author_login" VARCHAR(255),
    "url" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_user_mappings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "github_login" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_user_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repo_pull_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_repository_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "state" VARCHAR(20) NOT NULL,
    "author_login" VARCHAR(255) NOT NULL,
    "author_user_id" UUID,
    "opened_at" TIMESTAMPTZ NOT NULL,
    "github_updated_at" TIMESTAMPTZ NOT NULL,
    "closed_at" TIMESTAMPTZ,
    "merged_at" TIMESTAMPTZ,
    "additions" INTEGER,
    "deletions" INTEGER,
    "changed_files" INTEGER,
    "review_comments_count" INTEGER,
    "issue_comments_count" INTEGER,
    "reviews_count" INTEGER,
    "first_review_at" TIMESTAMPTZ,
    "cycle_time_hours" DOUBLE PRECISION,
    "ai_confidence_score" DOUBLE PRECISION,
    "ai_signals" JSONB,
    "ai_confidence_computed_at" TIMESTAMPTZ,
    "last_seen_at_source_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "repo_pull_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repo_commits" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_repository_id" UUID NOT NULL,
    "pull_request_id" UUID,
    "sha" VARCHAR(40) NOT NULL,
    "author_login" VARCHAR(255),
    "author_name" VARCHAR(255) NOT NULL,
    "author_email" VARCHAR(255),
    "author_user_id" UUID,
    "authored_at" TIMESTAMPTZ NOT NULL,
    "message" TEXT NOT NULL,
    "additions" INTEGER,
    "deletions" INTEGER,
    "changed_file_paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ai_confidence_score" DOUBLE PRECISION,
    "ai_signals" JSONB,
    "last_seen_at_source_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "repo_commits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deployments_tenant_id_idx" ON "deployments"("tenant_id");

-- CreateIndex
CREATE INDEX "deployments_product_repository_id_idx" ON "deployments"("product_repository_id");

-- CreateIndex
CREATE INDEX "deployments_deployed_at_idx" ON "deployments"("deployed_at");

-- CreateIndex
CREATE UNIQUE INDEX "deployments_product_repository_id_source_external_id_key" ON "deployments"("product_repository_id", "source", "external_id");

-- CreateIndex
CREATE INDEX "github_user_mappings_tenant_id_idx" ON "github_user_mappings"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "github_user_mappings_tenant_id_github_login_key" ON "github_user_mappings"("tenant_id", "github_login");

-- CreateIndex
CREATE INDEX "repo_pull_requests_tenant_id_idx" ON "repo_pull_requests"("tenant_id");

-- CreateIndex
CREATE INDEX "repo_pull_requests_product_repository_id_idx" ON "repo_pull_requests"("product_repository_id");

-- CreateIndex
CREATE INDEX "repo_pull_requests_author_user_id_idx" ON "repo_pull_requests"("author_user_id");

-- CreateIndex
CREATE INDEX "repo_pull_requests_merged_at_idx" ON "repo_pull_requests"("merged_at");

-- CreateIndex
CREATE INDEX "repo_pull_requests_ai_confidence_score_idx" ON "repo_pull_requests"("ai_confidence_score");

-- CreateIndex
CREATE UNIQUE INDEX "repo_pull_requests_product_repository_id_number_key" ON "repo_pull_requests"("product_repository_id", "number");

-- CreateIndex
CREATE INDEX "repo_commits_tenant_id_idx" ON "repo_commits"("tenant_id");

-- CreateIndex
CREATE INDEX "repo_commits_product_repository_id_idx" ON "repo_commits"("product_repository_id");

-- CreateIndex
CREATE INDEX "repo_commits_pull_request_id_idx" ON "repo_commits"("pull_request_id");

-- CreateIndex
CREATE INDEX "repo_commits_author_user_id_idx" ON "repo_commits"("author_user_id");

-- CreateIndex
CREATE INDEX "repo_commits_authored_at_idx" ON "repo_commits"("authored_at");

-- CreateIndex
CREATE UNIQUE INDEX "repo_commits_product_repository_id_sha_key" ON "repo_commits"("product_repository_id", "sha");

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_product_repository_id_fkey" FOREIGN KEY ("product_repository_id") REFERENCES "product_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_user_mappings" ADD CONSTRAINT "github_user_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_user_mappings" ADD CONSTRAINT "github_user_mappings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_pull_requests" ADD CONSTRAINT "repo_pull_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_pull_requests" ADD CONSTRAINT "repo_pull_requests_product_repository_id_fkey" FOREIGN KEY ("product_repository_id") REFERENCES "product_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_pull_requests" ADD CONSTRAINT "repo_pull_requests_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_commits" ADD CONSTRAINT "repo_commits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_commits" ADD CONSTRAINT "repo_commits_product_repository_id_fkey" FOREIGN KEY ("product_repository_id") REFERENCES "product_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_commits" ADD CONSTRAINT "repo_commits_pull_request_id_fkey" FOREIGN KEY ("pull_request_id") REFERENCES "repo_pull_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_commits" ADD CONSTRAINT "repo_commits_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

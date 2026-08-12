-- CreateTable
CREATE TABLE "product_repositories" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "github_repo" VARCHAR(255) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "product_repositories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_repositories_product_id_idx" ON "product_repositories"("product_id");

-- CreateIndex
CREATE INDEX "product_repositories_github_repo_idx" ON "product_repositories"("github_repo");

-- CreateIndex
CREATE INDEX "product_repositories_is_active_idx" ON "product_repositories"("is_active");

-- AddForeignKey
ALTER TABLE "product_repositories" ADD CONSTRAINT "product_repositories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Stage 10: A/B experiments, judgments and the cost ledger.
-- Generated with `prisma migrate diff`, then reviewed by hand. Adding NOT NULL
-- columns to experiments / experiment_results is safe only because no code
-- wrote to those tables before this release (they were created empty in
-- Stage 4). On a table with data this would need the add → backfill → NOT NULL
-- sequence used in the auth_and_audit_log migration.

-- DropForeignKey
ALTER TABLE "experiments" DROP CONSTRAINT "experiments_created_by_fkey";

-- DropForeignKey
ALTER TABLE "experiments" DROP CONSTRAINT "experiments_prompt_a_id_fkey";

-- DropForeignKey
ALTER TABLE "experiments" DROP CONSTRAINT "experiments_prompt_b_id_fkey";

-- DropIndex
DROP INDEX "experiment_results_experiment_id_idx";

-- DropIndex
DROP INDEX "experiments_created_by_idx";

-- AlterTable
ALTER TABLE "experiment_results" ADD COLUMN     "input_index" INTEGER NOT NULL,
ADD COLUMN     "input_tokens" INTEGER NOT NULL,
ADD COLUMN     "model" TEXT NOT NULL,
ADD COLUMN     "output_tokens" INTEGER NOT NULL,
ALTER COLUMN "cost_usd" SET NOT NULL,
ALTER COLUMN "latency_ms" SET NOT NULL;

-- AlterTable
ALTER TABLE "experiments" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "inputs" JSONB NOT NULL,
ADD COLUMN     "name" VARCHAR(100) NOT NULL,
ADD COLUMN     "prompt_a_content" TEXT NOT NULL,
ADD COLUMN     "prompt_b_content" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'pending';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "monthly_budget_usd" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "experiment_judgments" (
    "id" UUID NOT NULL,
    "experiment_id" UUID NOT NULL,
    "input_index" INTEGER NOT NULL,
    "winner" VARCHAR(3) NOT NULL,
    "reasoning" TEXT NOT NULL,
    "a_shown_first" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_judgments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_logs" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cost_usd" DECIMAL(10,6) NOT NULL,
    "resource_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "experiment_judgments_experiment_id_input_index_key" ON "experiment_judgments"("experiment_id", "input_index");

-- CreateIndex
CREATE INDEX "cost_logs_user_id_created_at_idx" ON "cost_logs"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_results_experiment_id_input_index_prompt_version_key" ON "experiment_results"("experiment_id", "input_index", "prompt_version");

-- CreateIndex
CREATE INDEX "experiments_created_by_created_at_idx" ON "experiments"("created_by", "created_at");

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_prompt_a_id_fkey" FOREIGN KEY ("prompt_a_id") REFERENCES "prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_prompt_b_id_fkey" FOREIGN KEY ("prompt_b_id") REFERENCES "prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_judgments" ADD CONSTRAINT "experiment_judgments_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_logs" ADD CONSTRAINT "cost_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

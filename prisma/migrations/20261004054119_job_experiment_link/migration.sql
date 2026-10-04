-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "experiment_id" UUID;

-- CreateIndex
CREATE INDEX "jobs_experiment_id_idx" ON "jobs"("experiment_id");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

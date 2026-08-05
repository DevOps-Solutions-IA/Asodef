-- CreateEnum
CREATE TYPE "approval_gate_status" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "approval_gates" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "approval_gate_status" NOT NULL DEFAULT 'PENDING',
    "approved_by_user_id" UUID,
    "approval_date" TIMESTAMPTZ(3),
    "supporting_document_path" TEXT,
    "notes" TEXT,
    "expiration_date" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "approval_gates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approval_gates_key_key" ON "approval_gates"("key");

-- AddForeignKey
ALTER TABLE "approval_gates" ADD CONSTRAINT "approval_gates_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

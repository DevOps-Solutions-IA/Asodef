import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(__dirname, "../../../prisma/migrations/20260819133000_add_structured_audit_context/migration.sql"),
  "utf8",
);
const schema = readFileSync(join(__dirname, "../../../prisma/schema.prisma"), "utf8");

describe("structured audit context migration", () => {
  it("is additive and preserves domain-specific audit foreign keys", () => {
    expect(migration).toMatch(/ALTER TABLE "security_events"[\s\S]*ADD COLUMN "actor_user_id"/);
    expect(migration).toMatch(/ALTER TABLE "audit_logs"[\s\S]*ADD COLUMN "correlation_id"/);
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)|TRUNCATE/i);
    expect(migration).not.toMatch(/ADD COLUMN "entity_(type|id)"/i);
  });

  it("backfills only from the explicit applied flag and never interprets metadata", () => {
    expect(migration).toMatch(/UPDATE "audit_logs"[\s\S]*WHEN "applied" THEN 'SUCCESS'/);
    expect(migration).not.toMatch(/metadata\s*(->|#>)/i);
  });

  it("keeps legacy SecurityEvent.userId while adding explicit actor and subject relations", () => {
    const model = schema.match(/model SecurityEvent \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(model).toContain("userId");
    expect(model).toContain("actorUserId");
    expect(model).toContain("subjectUserId");
    expect(model).toContain('relation("SecurityEventActor"');
    expect(model).toContain('relation("SecurityEventSubject"');
  });
});

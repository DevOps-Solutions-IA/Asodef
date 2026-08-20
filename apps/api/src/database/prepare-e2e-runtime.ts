import { createCipheriv, createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { publishLegalCorrections } from "./publish-legal-corrections";

const E2E_PUBLISHER_EMAIL = "admin@asodef.com.co";
const E2E_RECOVERY_EMAIL = "asodefsas@gmail.com";

interface E2EAdminFactors {
  password: string;
  mfaSecret: string;
  recoveryCodes: string[];
}

function requiredEphemeralValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for guarded E2E preparation.`);
  return value;
}

export function readE2EAdminFactors(environment: NodeJS.ProcessEnv): E2EAdminFactors {
  const password = requiredEphemeralValue(environment, "ASODEF_E2E_ADMIN_PASSWORD");
  const mfaSecret = requiredEphemeralValue(environment, "ASODEF_E2E_ADMIN_MFA_SECRET").toUpperCase();
  const recoveryCodes = requiredEphemeralValue(environment, "ASODEF_E2E_ADMIN_RECOVERY_CODES")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  if (password.length < 16) throw new Error("ASODEF_E2E_ADMIN_PASSWORD must contain at least 16 characters.");
  if (!/^[A-Z2-7]{32,}$/.test(mfaSecret)) throw new Error("ASODEF_E2E_ADMIN_MFA_SECRET is not valid Base32 test material.");
  if (recoveryCodes.length < 8 || recoveryCodes.some((code) => !/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2}$/.test(code))) {
    throw new Error("ASODEF_E2E_ADMIN_RECOVERY_CODES must contain at least eight valid test codes.");
  }
  if (new Set(recoveryCodes).size !== recoveryCodes.length) {
    throw new Error("ASODEF_E2E_ADMIN_RECOVERY_CODES must be unique.");
  }
  return { password, mfaSecret, recoveryCodes };
}

/** Matches MfaSecretProtectorService's v1 envelope for an isolated E2E
 * credential. The key and factors are generated afresh by CI and never
 * written to source, output, screenshots, or artifacts. */
function encryptE2EMfaSecret(secret: string, encryptionKey: string): string {
  const key = createHash("sha256")
    .update("asodef:admin-mfa:v1\0", "utf8")
    .update(encryptionKey, "utf8")
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function assertSafeE2EPreparation(environment: NodeJS.ProcessEnv): void {
  if (environment.NODE_ENV === "production") {
    throw new Error("E2E runtime preparation is forbidden in production.");
  }
  if (environment.CI !== "true" && environment.ASODEF_E2E_PREPARE !== "true") {
    throw new Error("E2E runtime preparation requires CI=true or ASODEF_E2E_PREPARE=true.");
  }

  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for E2E runtime preparation.");
  const hostname = new URL(databaseUrl).hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error("E2E runtime preparation is restricted to a local isolated database.");
  }
}

export async function prepareE2ERuntime(environment: NodeJS.ProcessEnv = process.env): Promise<number> {
  assertSafeE2EPreparation(environment);
  const factors = readE2EAdminFactors(environment);
  const encryptionKey = requiredEphemeralValue(environment, "ENCRYPTION_KEY");
  const prisma = new PrismaClient({ datasourceUrl: environment.DATABASE_URL });
  try {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
    const passwordHash = await argon2.hash(factors.password, { type: argon2.argon2id });
    const actor = await prisma.user.upsert({
      where: { email: E2E_PUBLISHER_EMAIL },
      update: { passwordHash, recoveryEmail: E2E_RECOVERY_EMAIL, status: "ACTIVE" },
      create: {
        email: E2E_PUBLISHER_EMAIL,
        recoveryEmail: E2E_RECOVERY_EMAIL,
        fullName: "CI Legal Workflow Actor",
        passwordHash,
        status: "ACTIVE",
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: actor.id, roleId: role.id } },
      create: { userId: actor.id, roleId: role.id },
      update: {},
    });
    const credential = await prisma.adminMfaCredential.upsert({
      where: { userId: actor.id },
      create: {
        userId: actor.id,
        status: "ACTIVE",
        secretEncrypted: encryptE2EMfaSecret(factors.mfaSecret, encryptionKey),
        confirmedAt: new Date(),
      },
      update: {
        status: "ACTIVE",
        secretEncrypted: encryptE2EMfaSecret(factors.mfaSecret, encryptionKey),
        lastUsedCounter: null,
        pendingExpiresAt: null,
        confirmedAt: new Date(),
        revokedAt: null,
      },
    });
    const recoveryCodeHashes = await Promise.all(
      factors.recoveryCodes.map((code) => argon2.hash(code, { type: argon2.argon2id })),
    );
    await prisma.$transaction([
      prisma.adminMfaRecoveryCode.deleteMany({ where: { credentialId: credential.id } }),
      prisma.adminMfaRecoveryCode.createMany({
        data: recoveryCodeHashes.map((codeHash) => ({ credentialId: credential.id, codeHash })),
      }),
    ]);
  } finally {
    await prisma.$disconnect();
  }

  const results = await publishLegalCorrections();
  const published = results.filter((result) => result.status === "PUBLISHED" && result.current).length;
  if (published !== 21) throw new Error(`Expected 21 published legal documents, received ${published}.`);
  return published;
}

if (require.main === module) {
  prepareE2ERuntime()
    .then((published) => process.stdout.write(`E2E runtime preparation complete: ${published} legal documents published.\n`))
    .catch((error: unknown) => {
      process.stderr.write(`E2E runtime preparation failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
      process.exitCode = 1;
    });
}

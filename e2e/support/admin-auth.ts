import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { PRIVILEGED_TEST_EMAIL, getPrivilegedTestPassword } from "./test-actors";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for privileged E2E authentication.`);
  return value;
}

function decodeBase32(value: string): Buffer {
  let bits = "";
  for (const character of value.replace(/=+$/u, "").toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Ephemeral E2E MFA material is not valid Base32.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

export function currentAdminTotp(timestamp = Date.now()): string {
  const secret = requiredEnvironment("ASODEF_E2E_ADMIN_MFA_SECRET");
  const counter = Math.floor(timestamp / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return binary.toString().padStart(6, "0");
}

export function adminRecoveryCode(index: number): string {
  const codes = requiredEnvironment("ASODEF_E2E_ADMIN_RECOVERY_CODES")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const code = codes[index];
  if (!code) throw new Error(`Missing ephemeral E2E recovery code at index ${index}.`);
  return code;
}

export async function loginPrivilegedAdmin(
  page: Page,
  factor: { kind: "totp" } | { kind: "recovery"; index: number },
): Promise<void> {
  await page.goto("/iniciar-sesion");
  await page.getByLabel("Correo electrónico", { exact: false }).fill(PRIVILEGED_TEST_EMAIL);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(getPrivilegedTestPassword());
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("heading", { name: "Verificación administrativa" })).toBeVisible();
  await page.getByLabel("Código de verificación", { exact: false }).fill(
    factor.kind === "totp" ? currentAdminTotp() : adminRecoveryCode(factor.index),
  );
  await page.getByRole("button", { name: "Verificar e ingresar" }).click();
  await expect(page).not.toHaveURL(/\/iniciar-sesion/u);
}

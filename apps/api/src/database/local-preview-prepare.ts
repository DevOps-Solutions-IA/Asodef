import { connect, createServer } from "node:net";
import { prepareE2ERuntime } from "./prepare-e2e-runtime";

async function main(): Promise<void> {
  if (process.env.LOCAL_PREVIEW !== "true") {
    throw new Error("Local preview preparation requires LOCAL_PREVIEW=true.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const target = new URL(databaseUrl);
  if (
    target.protocol !== "postgresql:" ||
    target.hostname !== "postgres" ||
    target.port !== "5432"
  ) {
    throw new Error(
      "Local preview preparation is restricted to the isolated Compose PostgreSQL service.",
    );
  }
  if (!target.pathname.startsWith("/asodef_preview_")) {
    throw new Error(
      "Local preview database name must use the asodef_preview_ prefix.",
    );
  }

  const proxy = createServer((client) => {
    const upstream = connect({
      host: target.hostname,
      port: Number(target.port),
    });
    client.pipe(upstream);
    upstream.pipe(client);
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
  });

  await new Promise<void>((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const address = proxy.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not allocate the local database safety proxy.");
    }
    const localUrl = new URL(databaseUrl);
    localUrl.hostname = "127.0.0.1";
    localUrl.port = String(address.port);
    const published = await prepareE2ERuntime({
      ...process.env,
      NODE_ENV: "test",
      ASODEF_E2E_PREPARE: "true",
      DATABASE_URL: localUrl.toString(),
    });
    process.stdout.write(
      `Local preview preparation complete: ${published} legal documents published.\n`,
    );
  } finally {
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Local preview preparation failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});

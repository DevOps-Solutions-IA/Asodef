import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("FirebirdReadClient security boundary", () => {
  it("exposes only the static-catalog query operation", () => {
    const source = readFileSync(join(__dirname, "../ports/firebird-read-client.ts"), "utf8");
    const interfaceBody = source.match(/export interface FirebirdReadClient\s*{([\s\S]*?)\n}/)?.[1] ?? "";
    expect(interfaceBody).toMatch(/\bquery<.*FirebirdQueryDefinition/s);
    expect(interfaceBody).not.toMatch(/^\s*(?:execute|executeRaw|executeProcedure|write|mutate|transactionWrite|runSql|queryFromUserInput)\s*\(/m);
  });

  it("does not reference an administrative Firebird identity in runtime source", () => {
    const administrativeIdentity = ["SYS", "DBA"].join("");
    const runtimeSources = [
      "firebird.client.ts",
      "firebird.config.ts",
      "node-firebird-pool.factory.ts",
    ].map((file) => readFileSync(join(__dirname, file), "utf8")).join("\n");
    expect(runtimeSources).not.toContain(administrativeIdentity);
    expect(runtimeSources).not.toContain("RDB$ADMIN");
  });
});

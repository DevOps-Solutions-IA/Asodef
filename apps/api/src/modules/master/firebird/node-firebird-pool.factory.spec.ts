import * as Firebird from "node-firebird";
import { NodeFirebirdPoolFactory } from "./node-firebird-pool.factory";
import { requireReadyQuery } from "./firebird-query.catalog";

jest.mock("node-firebird", () => ({
  pool: jest.fn(),
  ISOLATION_READ_COMMITTED_READ_ONLY: [1, 2, 3],
}));

describe("NodeFirebirdPoolFactory", () => {
  it("is reproducible without native bindings and opens explicit read-only transactions", async () => {
    const queryAsync = jest.fn(async () => [{ IDCONTRATO: 10 }]);
    const rollbackAsync = jest.fn(async () => undefined);
    const transactionAsync = jest.fn(async () => ({ queryAsync, rollbackAsync }));
    const detachAsync = jest.fn(async () => undefined);
    const getAsync = jest.fn(async () => ({ transactionAsync, detachAsync }));
    const destroyAsync = jest.fn(async () => undefined);
    jest.mocked(Firebird.pool).mockReturnValue({ getAsync, destroyAsync } as never);

    const factory = new NodeFirebirdPoolFactory();
    const pool = factory.create({
      host: "master.example.invalid",
      port: 3051,
      database: "sanitized-database-alias",
      user: "ASODEF_READONLY",
      password: "synthetic-test-secret",
      charset: "UTF8",
      connectionTimeoutMs: 3000,
      maxConnections: 4,
    });
    const connection = await pool.acquire();
    const transaction = await connection.beginReadOnly();
    const signal = new AbortController().signal;
    await transaction.query(requireReadyQuery("getContract"), ["10"], signal);
    await transaction.rollback();
    await connection.release();
    await pool.close();

    expect(Firebird.pool).toHaveBeenCalledWith(4, expect.objectContaining({
      port: 3051,
      user: "ASODEF_READONLY",
      encoding: "UTF8",
      connectTimeout: 3000,
    }));
    expect(transactionAsync).toHaveBeenCalledWith(Firebird.ISOLATION_READ_COMMITTED_READ_ONLY);
    expect(queryAsync).toHaveBeenCalledWith(
      requireReadyQuery("getContract").sql,
      ["10"],
      { signal },
    );
    expect(rollbackAsync).toHaveBeenCalledTimes(1);
    expect(detachAsync).toHaveBeenCalledTimes(1);
    expect(destroyAsync).toHaveBeenCalledTimes(1);
  });
});

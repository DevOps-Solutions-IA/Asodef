import { MasterUnavailableError } from "../domain/master.errors";
import {
  MasterReadOnlyGateConfigurationError,
} from "./master-read-only-gate.config";
import {
  runMasterReadOnlyGate,
  type MasterReadOnlyGateRuntime,
} from "./verify-read-only-connection";

function runtimeWith(overrides: Partial<MasterReadOnlyGateRuntime>): {
  runtime: MasterReadOnlyGateRuntime;
  stdout: jest.Mock;
  stderr: jest.Mock;
  close: jest.Mock;
} {
  const stdout = jest.fn();
  const stderr = jest.fn();
  const close = jest.fn().mockResolvedValue(undefined);
  return {
    runtime: {
      createApplicationContext: jest.fn().mockResolvedValue({
        get: () => ({
          run: jest.fn().mockResolvedValue({
            currentUser: "ASODEF_READONLY",
            healthValue: 1,
            contractCount: "42",
          }),
        }),
        close,
      }),
      writeStdout: stdout,
      writeStderr: stderr,
      ...overrides,
    },
    stdout,
    stderr,
    close,
  };
}

describe("runMasterReadOnlyGate", () => {
  it("writes a machine-readable success result and closes the context", async () => {
    const harness = runtimeWith({});
    await expect(runMasterReadOnlyGate(harness.runtime)).resolves.toBe(0);
    expect(harness.stdout).toHaveBeenCalledWith(
      '{"status":"ok","currentUser":"ASODEF_READONLY","healthValue":1,"contractCount":"42"}\n',
    );
    expect(harness.stderr).not.toHaveBeenCalled();
    expect(harness.close).toHaveBeenCalledTimes(1);
  });

  it("sanitizes failures raised while bootstrapping before a context exists", async () => {
    const secret = "firebird-password-must-never-escape";
    const connection = "firebird://readonly:secret@private-master/alias";
    const harness = runtimeWith({
      createApplicationContext: jest.fn().mockRejectedValue(new Error(`${secret} ${connection}`)),
    });

    await expect(runMasterReadOnlyGate(harness.runtime)).resolves.toBe(1);
    expect(harness.stdout).not.toHaveBeenCalled();
    expect(harness.stderr).toHaveBeenCalledWith(
      '{"status":"error","code":"MASTER_UNAVAILABLE"}\n',
    );
    expect(JSON.stringify(harness.stderr.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(harness.stderr.mock.calls)).not.toContain(connection);
    expect(harness.close).not.toHaveBeenCalled();
  });

  it("reports standalone configuration failures without validation details", async () => {
    const harness = runtimeWith({
      createApplicationContext: jest.fn().mockRejectedValue(
        new MasterReadOnlyGateConfigurationError(),
      ),
    });

    await expect(runMasterReadOnlyGate(harness.runtime)).resolves.toBe(1);
    expect(harness.stderr).toHaveBeenCalledWith(
      '{"status":"error","code":"MASTER_CONFIGURATION_INVALID"}\n',
    );
  });

  it("preserves safe Master domain codes and closes the initialized context", async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const harness = runtimeWith({
      createApplicationContext: jest.fn().mockResolvedValue({
        get: () => ({ run: jest.fn().mockRejectedValue(new MasterUnavailableError()) }),
        close,
      }),
    });

    await expect(runMasterReadOnlyGate(harness.runtime)).resolves.toBe(1);
    expect(harness.stderr).toHaveBeenCalledWith(
      '{"status":"error","code":"MASTER_UNAVAILABLE"}\n',
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not expose a native error thrown while closing the context", async () => {
    const closeSecret = "secret-contained-in-native-close-error";
    const close = jest.fn().mockRejectedValue(new Error(closeSecret));
    const harness = runtimeWith({
      createApplicationContext: jest.fn().mockResolvedValue({
        get: () => ({
          run: jest.fn().mockResolvedValue({
            currentUser: "ASODEF_READONLY",
            healthValue: 1,
            contractCount: "1",
          }),
        }),
        close,
      }),
    });

    await expect(runMasterReadOnlyGate(harness.runtime)).resolves.toBe(0);
    expect(JSON.stringify(harness.stdout.mock.calls)).not.toContain(closeSecret);
    expect(JSON.stringify(harness.stderr.mock.calls)).not.toContain(closeSecret);
  });
});

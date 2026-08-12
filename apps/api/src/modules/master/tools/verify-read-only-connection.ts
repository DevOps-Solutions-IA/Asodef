import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { MasterConnectionGateService } from "../application/master-connection-gate.service";
import { MasterDomainError } from "../domain/master.errors";
import { MasterModule } from "../master.module";
import {
  MasterReadOnlyGateConfigurationError,
  validateMasterReadOnlyGateEnvironment,
} from "./master-read-only-gate.config";

function createMasterReadOnlyGateModule(): new (...args: never[]) => unknown {
  @Module({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        cache: true,
        validate: validateMasterReadOnlyGateEnvironment,
      }),
      MasterModule,
    ],
  })
  class MasterReadOnlyGateModule {}

  return MasterReadOnlyGateModule;
}

interface MasterReadOnlyGateApplicationContext {
  get<T>(type: new (...args: never[]) => T): T;
  close(): Promise<void>;
}

export interface MasterReadOnlyGateRuntime {
  createApplicationContext(): Promise<MasterReadOnlyGateApplicationContext>;
  writeStdout(line: string): void;
  writeStderr(line: string): void;
}

const defaultRuntime: MasterReadOnlyGateRuntime = {
  createApplicationContext: () => NestFactory.createApplicationContext(
    createMasterReadOnlyGateModule(),
    { logger: false, abortOnError: false },
  ),
  writeStdout: (line) => process.stdout.write(line),
  writeStderr: (line) => process.stderr.write(line),
};

function safeErrorCode(error: unknown): string {
  if (error instanceof MasterReadOnlyGateConfigurationError) return error.code;
  if (error instanceof MasterDomainError) return error.code;
  return "MASTER_UNAVAILABLE";
}

/** Runs the standalone diagnostic and returns a process-compatible exit code. */
export async function runMasterReadOnlyGate(
  runtime: MasterReadOnlyGateRuntime = defaultRuntime,
): Promise<number> {
  let application: MasterReadOnlyGateApplicationContext | undefined;
  try {
    application = await runtime.createApplicationContext();
    const result = await application.get(MasterConnectionGateService).run();
    runtime.writeStdout(`${JSON.stringify({ status: "ok", ...result })}\n`);
    return 0;
  } catch (error) {
    runtime.writeStderr(`${JSON.stringify({ status: "error", code: safeErrorCode(error) })}\n`);
    return 1;
  } finally {
    if (application) {
      try {
        await application.close();
      } catch {
        // Native shutdown errors can contain connection details. The gate has
        // already produced its authoritative result, so never surface them.
      }
    }
  }
}

if (require.main === module) {
  void runMasterReadOnlyGate().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

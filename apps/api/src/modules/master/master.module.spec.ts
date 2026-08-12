import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { MasterQueryService } from "./application/master-query.service";
import { MasterDisabledError } from "./domain/master.errors";
import { MasterModule } from "./master.module";

describe("MasterModule", () => {
  it("boots disabled and performs no Firebird lookup", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({
            MASTER_FIREBIRD_ENABLED: false,
            MASTER_FIREBIRD_CONNECTION_TIMEOUT_MS: 3000,
            MASTER_FIREBIRD_QUERY_TIMEOUT_MS: 5000,
            MASTER_FIREBIRD_MAX_CONNECTIONS: 4,
            MASTER_FIREBIRD_CIRCUIT_FAILURE_THRESHOLD: 3,
            MASTER_FIREBIRD_CIRCUIT_RESET_MS: 30000,
          })],
        }),
        MasterModule,
      ],
    }).compile();

    const service = moduleRef.get(MasterQueryService);
    await expect(service.getContract("10")).rejects.toBeInstanceOf(MasterDisabledError);
    await moduleRef.close();
  });
});

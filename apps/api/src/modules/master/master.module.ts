import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import { MasterQueryService } from "./application/master-query.service";
import { MasterContractSummaryService } from "./application/master-contract-summary.service";
import { MasterConnectionGateService } from "./application/master-connection-gate.service";
import { NodeFirebirdReadClient } from "./firebird/firebird.client";
import { DisabledMasterReadRepository } from "./firebird/disabled-master-read.repository";
import { FirebirdMasterReadRepository } from "./firebird/firebird-master-read.repository";
import { FirebirdReadExecutor } from "./firebird/firebird-read.executor";
import { getMasterFirebirdRuntimeConfig } from "./firebird/firebird.config";
import {
  NODE_FIREBIRD_POOL_FACTORY,
  NodeFirebirdPoolFactory,
} from "./firebird/node-firebird-pool.factory";
import { MasterHealthController } from "./health/master-health.controller";
import { MasterContractsController } from "./http/master-contracts.controller";
import { MasterHealthService } from "./health/master-health.service";
import { FIREBIRD_READ_CLIENT } from "./ports/firebird-read-client";
import { MASTER_READ_REPOSITORY, type MasterReadRepository } from "./ports/master-read.repository";

@Module({
  controllers: [MasterHealthController, MasterContractsController],
  providers: [
    MasterQueryService,
    MasterContractSummaryService,
    MasterConnectionGateService,
    MasterHealthService,
    FirebirdReadExecutor,
    NodeFirebirdReadClient,
    NodeFirebirdPoolFactory,
    DisabledMasterReadRepository,
    FirebirdMasterReadRepository,
    { provide: NODE_FIREBIRD_POOL_FACTORY, useExisting: NodeFirebirdPoolFactory },
    { provide: FIREBIRD_READ_CLIENT, useExisting: NodeFirebirdReadClient },
    {
      provide: MASTER_READ_REPOSITORY,
      inject: [ConfigService, DisabledMasterReadRepository, FirebirdMasterReadRepository],
      useFactory: (
        config: ConfigService<EnvConfig, true>,
        disabled: DisabledMasterReadRepository,
        firebird: FirebirdMasterReadRepository,
      ): MasterReadRepository => getMasterFirebirdRuntimeConfig(config).enabled ? firebird : disabled,
    },
  ],
  exports: [MasterQueryService, MasterConnectionGateService, MASTER_READ_REPOSITORY],
})
export class MasterModule {}

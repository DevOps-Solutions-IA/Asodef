import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";

import type { EnvConfig } from "../../../config/env.validation";

export const BINGO_SURFACES = ["module", "admin", "affiliate", "public", "realtime"] as const;
export type BingoSurface = (typeof BINGO_SURFACES)[number];

export const BINGO_SURFACES_METADATA = "bingo:required-surfaces";

type BingoFlagName =
  | "BINGO_ENABLED"
  | "BINGO_ADMIN_ENABLED"
  | "BINGO_AFFILIATE_ENABLED"
  | "BINGO_PUBLIC_ENABLED"
  | "BINGO_REALTIME_ENABLED";

const SURFACE_FLAG: Readonly<Record<BingoSurface, BingoFlagName>> = {
  module: "BINGO_ENABLED",
  admin: "BINGO_ADMIN_ENABLED",
  affiliate: "BINGO_AFFILIATE_ENABLED",
  public: "BINGO_PUBLIC_ENABLED",
  realtime: "BINGO_REALTIME_ENABLED",
};

/**
 * Marks a route or controller as belonging to one or more Bingo surfaces and
 * installs the fail-closed guard. The master BINGO_ENABLED flag is implicit.
 */
export function RequireBingoSurfaces(...surfaces: readonly BingoSurface[]) {
  return applyDecorators(
    SetMetadata(BINGO_SURFACES_METADATA, [...surfaces]),
    UseGuards(BingoFeatureFlagGuard),
  );
}

export const RequireBingoSurface = (surface: BingoSurface) => RequireBingoSurfaces(surface);

@Injectable()
export class BingoFeatureFlagsService {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  /**
   * Operational contract for guards, publishers and workers. A surface is
   * enabled only when the validated master flag and its own flag are true.
   */
  isEnabled(surface: BingoSurface): boolean {
    if (!this.flag("BINGO_ENABLED")) return false;
    return surface === "module" || this.flag(SURFACE_FLAG[surface]);
  }

  private flag(name: BingoFlagName): boolean {
    return this.config.get(name, { infer: true }) === true;
  }
}

@Injectable()
export class BingoFeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: BingoFeatureFlagsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const declared = this.reflector.getAll<BingoSurface[]>(BINGO_SURFACES_METADATA, [
      context.getClass(),
      context.getHandler(),
    ]);
    const required = [...new Set(declared.flatMap((surfaces) => surfaces ?? []))];

    // The guard must never become permissive because a future controller
    // forgot its metadata or because a config value was not validated.
    if (!required?.length) {
      throw this.disabled();
    }

    for (const surface of required) {
      if (!BINGO_SURFACES.includes(surface) || !this.flags.isEnabled(surface)) {
        throw this.disabled();
      }
    }

    return true;
  }

  private disabled(): NotFoundException {
    return new NotFoundException({
      statusCode: 404,
      code: "BINGO_FEATURE_DISABLED",
      message: "Bingo no está disponible.",
    });
  }
}

import type { ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";

import type { EnvConfig } from "../../../config/env.validation";
import { BingoAdminController } from "../admin/bingo-admin.controller";
import { BingoAffiliateReadController } from "../affiliate/bingo-affiliate-read.controller";
import { BingoPublicReadController } from "../public/bingo-public-read.controller";
import {
  BINGO_SURFACES_METADATA,
  BingoFeatureFlagGuard,
  BingoFeatureFlagsService,
  type BingoSurface,
} from "./bingo-feature-flags";

describe("BingoFeatureFlagGuard", () => {
  class TestController {}
  const handler = () => undefined;

  function context(): ExecutionContext {
    return {
      getClass: () => TestController,
      getHandler: () => handler,
    } as unknown as ExecutionContext;
  }

  function guard(
    flags: Partial<Pick<EnvConfig,
      | "BINGO_ENABLED"
      | "BINGO_ADMIN_ENABLED"
      | "BINGO_AFFILIATE_ENABLED"
      | "BINGO_PUBLIC_ENABLED"
      | "BINGO_REALTIME_ENABLED"
    >>,
    surfaces?: readonly BingoSurface[],
  ): BingoFeatureFlagGuard {
    Reflect.deleteMetadata(BINGO_SURFACES_METADATA, handler);
    Reflect.deleteMetadata(BINGO_SURFACES_METADATA, TestController);
    if (surfaces) Reflect.defineMetadata(BINGO_SURFACES_METADATA, surfaces, handler);
    const service = new BingoFeatureFlagsService(new ConfigService<EnvConfig, true>(flags));
    return new BingoFeatureFlagGuard(new Reflector(), service);
  }

  it("fails closed when metadata is absent", () => {
    const featureGuard = guard({ BINGO_ENABLED: true, BINGO_ADMIN_ENABLED: true });

    expect(() => featureGuard.canActivate(context())).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: "BINGO_FEATURE_DISABLED" }) }),
    );
  });

  it("fails closed when the master flag is absent or disabled", () => {
    expect(() => guard({ BINGO_ADMIN_ENABLED: true }, ["admin"]).canActivate(context())).toThrow();
    expect(() => guard({ BINGO_ENABLED: false, BINGO_ADMIN_ENABLED: true }, ["admin"]).canActivate(context())).toThrow();
  });

  it.each([
    ["admin", "BINGO_ADMIN_ENABLED"],
    ["affiliate", "BINGO_AFFILIATE_ENABLED"],
    ["public", "BINGO_PUBLIC_ENABLED"],
    ["realtime", "BINGO_REALTIME_ENABLED"],
  ] as const)("requires the %s surface flag explicitly", (surface, flag) => {
    expect(() => guard({ BINGO_ENABLED: true }, [surface]).canActivate(context())).toThrow();
    expect(guard({ BINGO_ENABLED: true, [flag]: true }, [surface]).canActivate(context())).toBe(true);
  });

  it("requires every declared surface so realtime cannot bypass its audience flag", () => {
    expect(() => guard(
      { BINGO_ENABLED: true, BINGO_REALTIME_ENABLED: true, BINGO_PUBLIC_ENABLED: false },
      ["public", "realtime"],
    ).canActivate(context())).toThrow();

    expect(guard(
      { BINGO_ENABLED: true, BINGO_REALTIME_ENABLED: true, BINGO_PUBLIC_ENABLED: true },
      ["public", "realtime"],
    ).canActivate(context())).toBe(true);
  });

  it("unions controller and handler requirements so a method cannot weaken its surface", () => {
    const featureGuard = guard(
      { BINGO_ENABLED: true, BINGO_REALTIME_ENABLED: true, BINGO_PUBLIC_ENABLED: false },
      ["realtime"],
    );
    Reflect.defineMetadata(BINGO_SURFACES_METADATA, ["public"], TestController);

    expect(() => featureGuard.canActivate(context())).toThrow();
  });

  it("supports the master module surface without requiring another flag", () => {
    expect(guard({ BINGO_ENABLED: true }, ["module"]).canActivate(context())).toBe(true);
  });

  it("wires the correct fail-closed surface into every current Bingo controller", () => {
    expect(Reflect.getMetadata(BINGO_SURFACES_METADATA, BingoAdminController)).toEqual(["admin"]);
    expect(Reflect.getMetadata(BINGO_SURFACES_METADATA, BingoAffiliateReadController)).toEqual(["affiliate"]);
    expect(Reflect.getMetadata(BINGO_SURFACES_METADATA, BingoPublicReadController)).toEqual(["public"]);
  });

  it("exposes a fail-closed service contract for future realtime publishers", () => {
    const disabled = new BingoFeatureFlagsService(new ConfigService<EnvConfig, true>({
      BINGO_ENABLED: true,
      BINGO_REALTIME_ENABLED: false,
    }));
    const enabled = new BingoFeatureFlagsService(new ConfigService<EnvConfig, true>({
      BINGO_ENABLED: true,
      BINGO_REALTIME_ENABLED: true,
    }));

    expect(disabled.isEnabled("realtime")).toBe(false);
    expect(enabled.isEnabled("realtime")).toBe(true);
  });
});

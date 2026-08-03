import { Test, type TestingModule } from "@nestjs/testing";
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { PATH_METADATA } from "@nestjs/common/constants";
import { AppModule } from "../../app.module";
import { IS_PUBLIC_KEY } from "../../modules/auth/decorators/public.decorator";
import { PERMISSIONS_KEY } from "../../modules/auth/decorators/permissions.decorator";
import { ROLES_KEY } from "../../modules/auth/decorators/roles.decorator";

/**
 * Every entry here is an *authenticated* route (JwtAuthGuard still
 * requires a valid session) that intentionally requires no specific
 * @RequirePermissions()/@RequireRoles() beyond "being logged in",
 * because it acts on the caller's own identity/session rather than a
 * business resource that RBAC needs to gate. Adding a new controller
 * route that is neither @Public() nor permission/role-guarded fails the
 * test below until it is either given a permission/role requirement or
 * explicitly, deliberately added here with a reason (US-008 section 2).
 */
const DOCUMENTED_NO_PERMISSION_EXCEPTIONS = new Map<string, string>([
  ["AuthController.me", "Reads only the caller's own session/profile - no business resource involved."],
  ["AuthController.logoutAll", "Revokes only the caller's own sessions - no other user's data is touched."],
  ["AuthController.changePassword", "Changes only the caller's own password, after re-verifying it - self-service, not a business resource."],
]);

describe("Route inventory: deny-by-default enforcement (US-008)", () => {
  let moduleRef: TestingModule;
  let discoveryService: DiscoveryService;
  let metadataScanner: MetadataScanner;
  let reflector: Reflector;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    discoveryService = moduleRef.get(DiscoveryService);
    metadataScanner = moduleRef.get(MetadataScanner);
    reflector = moduleRef.get(Reflector);
    void app; // only needed to run app.init()'s lifecycle hooks once; closed via moduleRef.close() in afterAll
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it("requires every non-public controller route to declare a permission, a role, or an explicit documented exception", () => {
    const controllers = discoveryService.getControllers();
    const violations: string[] = [];
    let totalRoutesChecked = 0;

    for (const wrapper of controllers) {
      const instance = wrapper.instance as object | undefined;
      const metatype = wrapper.metatype as (new (...args: unknown[]) => unknown) | undefined;
      if (!instance || !metatype) continue;

      const prototype = Object.getPrototypeOf(instance) as object;
      const methodNames = metadataScanner.getAllMethodNames(prototype);

      for (const methodName of methodNames) {
        const handler = (prototype as Record<string, unknown>)[methodName] as (...args: unknown[]) => unknown;

        // Only methods Nest actually registered as an HTTP route handler
        // (via @Get/@Post/etc, which stamps PATH_METADATA) count here -
        // plain helper methods on a controller class are not routes.
        const routePath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (routePath === undefined) continue;

        totalRoutesChecked += 1;

        const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, metatype]);
        if (isPublic) continue;

        const permissions = reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [handler, metatype]);
        const roles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [handler, metatype]);
        if ((permissions && permissions.length > 0) || (roles && roles.length > 0)) continue;

        const identifier = `${metatype.name}.${methodName}`;
        if (DOCUMENTED_NO_PERMISSION_EXCEPTIONS.has(identifier)) continue;

        violations.push(identifier);
      }
    }

    // Sanity check that this test is actually inspecting real routes,
    // not silently passing because discovery found nothing.
    expect(totalRoutesChecked).toBeGreaterThan(5);
    expect(violations).toEqual([]);
  });

  it("keeps the documented-exception allowlist itself honest - every entry must still exist as a real, currently-registered route", () => {
    const controllers = discoveryService.getControllers();
    const realIdentifiers = new Set<string>();

    for (const wrapper of controllers) {
      const instance = wrapper.instance as object | undefined;
      const metatype = wrapper.metatype as (new (...args: unknown[]) => unknown) | undefined;
      if (!instance || !metatype) continue;
      const prototype = Object.getPrototypeOf(instance) as object;
      for (const methodName of metadataScanner.getAllMethodNames(prototype)) {
        const handler = (prototype as Record<string, unknown>)[methodName] as (...args: unknown[]) => unknown;
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
        realIdentifiers.add(`${metatype.name}.${methodName}`);
      }
    }

    for (const identifier of DOCUMENTED_NO_PERMISSION_EXCEPTIONS.keys()) {
      expect(realIdentifiers.has(identifier)).toBe(true);
    }
  });
});

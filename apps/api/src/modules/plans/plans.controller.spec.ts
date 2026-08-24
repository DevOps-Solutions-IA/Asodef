import { PERMISSIONS_KEY } from "../auth/decorators/permissions.decorator";
import { REQUIRE_STEP_UP_KEY } from "../auth/decorators/require-step-up.decorator";
import { PlansController } from "./plans.controller";

describe("PlansController governance metadata", () => {
  it("separates reads, draft authoring and step-up publication permissions", () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PlansController.prototype.listAdmin)).toEqual(["plans.read"]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PlansController.prototype.listKoral)).toEqual(["koral.plans.read"]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PlansController.prototype.create)).toEqual(["plans.manage"]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PlansController.prototype.submitReview)).toEqual(["plans.manage"]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PlansController.prototype.publish)).toEqual(["plans.publish"]);
    expect(Reflect.getMetadata(REQUIRE_STEP_UP_KEY, PlansController.prototype.publish)).toBe(true);
    expect(Reflect.getMetadata(REQUIRE_STEP_UP_KEY, PlansController.prototype.retire)).toBe(true);
  });
});

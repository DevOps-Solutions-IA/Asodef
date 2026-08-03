import { shouldEnableSwagger } from "./swagger";

describe("shouldEnableSwagger", () => {
  it("enables Swagger in development", () => {
    expect(shouldEnableSwagger("development")).toBe(true);
  });

  it("enables Swagger in test", () => {
    expect(shouldEnableSwagger("test")).toBe(true);
  });

  it("disables Swagger in production", () => {
    expect(shouldEnableSwagger("production")).toBe(false);
  });
});

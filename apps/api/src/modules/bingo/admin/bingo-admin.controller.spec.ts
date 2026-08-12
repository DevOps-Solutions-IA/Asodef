import { PERMISSIONS_KEY } from "../../auth/decorators/permissions.decorator";
import { BingoAdminController } from "./bingo-admin.controller";

describe("BingoAdminController authorization contract", () => {
  const permission = (method: keyof BingoAdminController) =>
    Reflect.getMetadata(
      PERMISSIONS_KEY,
      BingoAdminController.prototype[method],
    );

  it("uses read/audit capabilities for query surfaces", () => {
    expect(permission("listEvents")).toEqual(["bingo.read"]);
    expect(permission("getEvent")).toEqual(["bingo.read"]);
    expect(permission("getExecution")).toEqual(["bingo.read"]);
    expect(permission("listAudit")).toEqual(["bingo.audit.read"]);
  });

  it("maps critical commands to their exact capabilities", () => {
    for (const method of [
      "start",
      "pause",
      "resume",
      "complete",
      "cancel",
      "draw",
    ] as const) {
      expect(permission(method)).toEqual(["bingo.operate"]);
    }
    expect(permission("restart")).toEqual(["bingo.manage"]);
    expect(permission("validateCandidate")).toEqual(["bingo.validate"]);
    expect(permission("rejectCandidate")).toEqual(["bingo.validate"]);
    expect(permission("confirmWinners")).toEqual(["bingo.validate"]);
  });
});

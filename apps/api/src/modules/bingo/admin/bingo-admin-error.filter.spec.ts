import { BingoApplicationError, BingoApplicationErrorCode } from "../application/kernel";
import { BingoAdminErrorFilter } from "./bingo-admin-error.filter";

describe("BingoAdminErrorFilter", () => {
  it("maps application errors to the standard safe ASODEF envelope", () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          originalUrl: "/api/v1/admin/bingo/executions/id/start",
          url: "/ignored",
          requestId: "request-1",
        }),
        getResponse: () => ({ status, json }),
      }),
    };
    new BingoAdminErrorFilter().catch(
      new BingoApplicationError(BingoApplicationErrorCode.INVALID_STATE, {
        internalState: "must-not-leak",
      }),
      host as never,
    );
    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        error: "Unprocessable Entity",
        code: "BINGO_INVALID_STATE_TRANSITION",
        requestId: "request-1",
      }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain("must-not-leak");
  });
});

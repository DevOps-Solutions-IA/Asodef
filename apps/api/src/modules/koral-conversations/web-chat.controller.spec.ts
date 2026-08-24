import { HttpException, HttpStatus, UnauthorizedException } from "@nestjs/common";
import { WEB_CHAT_SESSION_COOKIE } from "./contracts/web-chat.contract";
import { WebChatController } from "./web-chat.controller";

describe("WebChatController cookie boundary", () => {
  const snapshot = {
    version: "1.0.0",
    conversation: {
      status: "AI_ACTIVE",
      aiAutoReplyAllowed: false,
      assuranceLevel: "ANONYMOUS",
      updatedAt: "2026-08-24T12:00:00.000Z",
    },
    messages: [],
  };
  const webChat = {
    bootstrap: jest.fn(),
    history: jest.fn(),
    send: jest.fn(),
    claim: jest.fn(),
  };
  const controller = new WebChatController(webChat as never);

  function response() {
    return { setHeader: jest.fn(), cookie: jest.fn(), clearCookie: jest.fn() };
  }

  beforeEach(() => jest.clearAllMocks());

  it("sets a Secure HttpOnly host-only __Host cookie without exposing the capability in the body", async () => {
    webChat.bootstrap.mockResolvedValue({ rawToken: "a".repeat(43), created: true, session: {}, snapshot, cookieMaxAgeMs: 42_000 });
    const res = response();
    const result = await controller.bootstrap(
      { version: "1.0.0" },
      { ip: "127.0.0.1", cookies: {}, headers: {}, requestId: "request-1" } as never,
      res as never,
    );
    expect(result).toEqual(snapshot);
    expect(JSON.stringify(result)).not.toContain("a".repeat(43));
    expect(res.cookie).toHaveBeenCalledWith(WEB_CHAT_SESSION_COOKIE, "a".repeat(43), {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 42_000,
    });
    expect(res.cookie.mock.calls[0]![2]).not.toHaveProperty("domain");
  });

  it("clears the host-only cookie on every generic session 401", async () => {
    webChat.history.mockRejectedValue(new UnauthorizedException({
      code: "WEB_CHAT_SESSION_UNAVAILABLE",
      message: "La sesión del chat no está disponible.",
    }));
    const res = response();
    await expect(controller.history(
      {},
      { ip: "127.0.0.1", cookies: { [WEB_CHAT_SESSION_COOKIE]: "b".repeat(43) } } as never,
      res as never,
    )).rejects.toMatchObject({ status: 401 });
    expect(res.clearCookie).toHaveBeenCalledWith(WEB_CHAT_SESSION_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
    });
  });

  it("sets Retry-After from the safe 429 envelope", async () => {
    webChat.history.mockRejectedValue(new HttpException({
      code: "RATE_LIMITED",
      message: "Intenta nuevamente más tarde.",
      retryAfterSeconds: 17,
    }, HttpStatus.TOO_MANY_REQUESTS));
    const res = response();
    await expect(controller.history(
      {},
      { ip: "127.0.0.1", cookies: { [WEB_CHAT_SESSION_COOKIE]: "c".repeat(43) } } as never,
      res as never,
    )).rejects.toMatchObject({ status: 429 });
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", 17);
  });
});

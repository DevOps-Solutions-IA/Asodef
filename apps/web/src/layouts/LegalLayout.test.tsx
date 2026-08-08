import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { LegalLayout } from "./LegalLayout";

function CurrentLegalRoute() {
  const location = useLocation();
  return <p>{location.pathname}</p>;
}

describe("LegalLayout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the canonical public header and starts each legal document at the top", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/legal/terminos-y-condiciones"]}>
        <Routes>
          <Route path="/legal" element={<LegalLayout />}>
            <Route path=":slug" element={<CurrentLegalRoute />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: "auto", left: 0, top: 0 });

    scrollTo.mockClear();
    await user.click(screen.getAllByRole("link", { name: "Política de privacidad" })[0]!);

    expect(screen.getByText("/legal/politica-de-privacidad")).toBeInTheDocument();
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: "auto", left: 0, top: 0 });
  });
});

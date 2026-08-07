import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { Link, MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useFocusMainOnRouteChange } from "./useFocusMainOnRouteChange";

function FocusTarget() {
  const mainRef = createRef<HTMLElement>();
  useFocusMainOnRouteChange(mainRef, { preventScroll: true });
  return <><Link to="/siguiente">Continuar</Link><main ref={mainRef} tabIndex={-1}>Contenido</main></>;
}

describe("useFocusMainOnRouteChange", () => {
  it("focuses the new main landmark without overriding scroll restoration", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/inicial"]}><FocusTarget /></MemoryRouter>);

    await user.click(screen.getByRole("link", { name: "Continuar" }));

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(screen.getByRole("main")).toHaveFocus();
  });
});

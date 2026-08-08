import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { useScrollToHash } from "./useScrollToHash";

function Target() {
  useScrollToHash();
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output aria-label="Ruta actual">{`${location.pathname}${location.search}${location.hash}`}</output>
    <div id="quienes-somos">Sección objetivo</div>
    <Link to="/segunda">Navegar</Link>
    <Link to="/reemplazo" replace>Reemplazar</Link>
    <button type="button" onClick={() => navigate(-1)}>Volver</button>
  </>;
}

describe("useScrollToHash", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("scrolls the matching element into view when the URL has a hash", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <MemoryRouter initialEntries={["/#quienes-somos"]}>
        <Target />
      </MemoryRouter>,
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("starts a direct load without a hash at the top", () => {
    const scrollIntoView = vi.fn();
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    vi.stubGlobal("scrollTo", scrollTo);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Target />
      </MemoryRouter>,
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith({ behavior: "auto", left: 0, top: 0 });
  });

  it("starts at the top when a direct-load hash has no matching element id", () => {
    const scrollIntoView = vi.fn();
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    vi.stubGlobal("scrollTo", scrollTo);

    render(
      <MemoryRouter initialEntries={["/#no-existe"]}>
        <Target />
      </MemoryRouter>,
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith({ behavior: "auto", left: 0, top: 0 });
  });

  it("starts PUSH and REPLACE navigations at the top", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/primera"]}><Target /></MemoryRouter>);

    await user.click(screen.getByRole("link", { name: "Navegar" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: "auto", left: 0, top: 0 });

    await user.click(screen.getByRole("link", { name: "Reemplazar" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: "auto", left: 0, top: 0 });
  });

  it("starts at the top on POP navigation instead of leaking the prior page position", async () => {
    let top = 0;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => top });
    Object.defineProperty(window, "scrollX", { configurable: true, get: () => 0 });
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/primera"]}><Target /></MemoryRouter>);

    top = 420;
    await user.click(screen.getByRole("link", { name: "Navegar" }));
    top = 900;
    await user.click(screen.getByRole("button", { name: "Volver" }));

    expect(screen.getByLabelText("Ruta actual")).toHaveTextContent("/primera");
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: "auto", left: 0, top: 0 });
  });
});

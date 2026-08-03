import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Drawer } from "./Drawer";

describe("Drawer", () => {
  it("renders as a dialog with the correct accessible name", () => {
    render(
      <Drawer open onClose={() => {}} title="Menú de navegación">
        <nav>Contenido</nav>
      </Drawer>,
    );
    expect(screen.getByRole("dialog", { name: "Menú de navegación" })).toBeInTheDocument();
  });

  it("closes when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Menú de navegación">
        <button>Elemento</button>
      </Drawer>,
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the close button is activated via keyboard", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Menú de navegación">
        <button>Elemento</button>
      </Drawer>,
    );

    const closeButton = screen.getByRole("button", { name: "Cerrar" });
    closeButton.focus();
    await user.keyboard("{Enter}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is not present in the accessibility tree when closed", () => {
    render(
      <Drawer open={false} onClose={() => {}} title="Menú de navegación">
        <button>Elemento</button>
      </Drawer>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("slides in from the right by default and from the left when side='left'", () => {
    const { rerender } = render(
      <Drawer open onClose={() => {}} title="Menú">
        <button>Elemento</button>
      </Drawer>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("right-0");

    rerender(
      <Drawer open onClose={() => {}} title="Menú" side="left">
        <button>Elemento</button>
      </Drawer>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("left-0");
  });
});

import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "./Dialog";

function TriggerAndDialog({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Abrir diálogo</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Confirmar acción" description="¿Deseas continuar?">
        <button>Confirmar</button>
      </Dialog>
    </div>
  );
}

describe("Dialog", () => {
  it("renders as a real <dialog> with the correct accessible name and description", () => {
    render(
      <Dialog open onClose={() => {}} title="Confirmar acción" description="¿Deseas continuar?">
        <p>Contenido</p>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Confirmar acción" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAccessibleDescription("¿Deseas continuar?");
  });

  it("moves focus into the dialog when it opens", async () => {
    const user = userEvent.setup();
    render(<TriggerAndDialog />);

    await user.click(screen.getByRole("button", { name: "Abrir diálogo" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    });
    expect(document.activeElement?.tagName).not.toBe("BODY");
  });

  it("restores focus to the triggering element when closed", async () => {
    const user = userEvent.setup();
    render(<TriggerAndDialog />);

    const trigger = screen.getByRole("button", { name: "Abrir diálogo" });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement));

    await user.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Confirmar acción">
        <button>Confirmar</button>
      </Dialog>,
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the close button is activated", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Confirmar acción">
        <button>Confirmar</button>
      </Dialog>,
    );

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render dialog content in the accessibility tree when closed", () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Confirmar acción">
        <button>Confirmar</button>
      </Dialog>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

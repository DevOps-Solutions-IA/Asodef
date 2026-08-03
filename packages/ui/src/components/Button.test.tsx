import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button", () => {
  it("is a real <button> reachable and activatable purely via keyboard", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);

    await user.tab();
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);

    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("shows a visible focus ring class when focused via focus-visible styles", () => {
    render(<Button>Enviar</Button>);
    expect(screen.getByRole("button", { name: "Enviar" })).toHaveClass("focus-visible:ring-2");
  });

  it("does not fire onClick and cannot receive focus via tab when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>Enviar</Button>);

    await user.tab();
    expect(screen.getByRole("button", { name: "Enviar" })).not.toHaveFocus();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("marks itself aria-busy and disables interaction while loading", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        Procesando
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Procesando" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("announces loading via aria-busy on the button itself, not a duplicate visible status region", () => {
    // The nested Spinner is deliberately aria-hidden here - the button's
    // own aria-busy is the single source of truth for assistive tech, so
    // the two don't announce the same "loading" state twice.
    render(<Button loading>Procesando</Button>);
    const button = screen.getByRole("button", { name: "Procesando" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

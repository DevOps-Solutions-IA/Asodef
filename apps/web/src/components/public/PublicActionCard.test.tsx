import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PublicActionCard } from "./PublicActionCard";

describe("PublicActionCard", () => {
  it("uses one equal-height native link for route actions", () => {
    render(<MemoryRouter><PublicActionCard to="/pagos" title="Consultar un pago" description="Abre la consulta." actionLabel="Continuar" /></MemoryRouter>);
    const card = screen.getByRole("link", { name: /consultar un pago/i });
    expect(card).toHaveAttribute("href", "/pagos");
    expect(card).toHaveClass("h-full", "w-full");
  });

  it("keeps selection actions operable with the keyboard", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<MemoryRouter><PublicActionCard onClick={onClick} title="Otro asunto" description="Abre el formulario." ariaExpanded={false} ariaControls="formulario" /></MemoryRouter>);
    const card = screen.getByRole("button", { name: /otro asunto/i });
    card.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

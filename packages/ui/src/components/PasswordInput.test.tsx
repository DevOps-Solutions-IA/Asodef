import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordInput } from "./PasswordInput";

describe("PasswordInput", () => {
  it("renders as a password field by default", () => {
    render(<PasswordInput aria-label="Contraseña" />);
    const input = screen.getByLabelText("Contraseña");
    expect(input).toHaveAttribute("type", "password");
  });

  it("toggles to a visible text field via an accessible, keyboard-operable button", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Contraseña" defaultValue="secreto123" />);

    const toggle = screen.getByRole("button", { name: "Mostrar contraseña" });
    await user.click(toggle);

    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ocultar contraseña" })).toBeInTheDocument();
  });

  it("is reachable and operable purely via keyboard, and never clears the value when toggled", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Contraseña" defaultValue="secreto123" />);

    await user.tab();
    expect(screen.getByLabelText("Contraseña")).toHaveFocus();

    await user.tab();
    const toggle = screen.getByRole("button", { name: "Mostrar contraseña" });
    expect(toggle).toHaveFocus();

    await user.keyboard("{Enter}");
    const input = screen.getByLabelText("Contraseña");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("secreto123");
  });

  it("toggles back to hidden on a second activation", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Contraseña" />);

    const toggle = screen.getByRole("button", { name: "Mostrar contraseña" });
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }));

    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");
  });
});

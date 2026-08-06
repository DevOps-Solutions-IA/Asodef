import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChoiceGrid, CompactStatusTimeline, CopyReferenceAction } from "./TransactionalFlow";

describe("transactional public actions", () => {
  it("provides visible manual-copy guidance when the clipboard API is unavailable", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(<CopyReferenceAction value="REF-123" />);

    await user.click(screen.getByRole("button", { name: /Copiar referencia/ }));

    expect(screen.getByText(/Usa las opciones de copia de tu dispositivo/)).toBeVisible();
  });

  it("uses fixed process phases while exposing the exact current status accessibly", () => {
    render(<CompactStatusTimeline status="IN_REVIEW" label="En revisión" />);

    expect(screen.getByRole("list", { name: /Estado actual: En revisión/ })).toBeInTheDocument();
    expect(screen.getByText("Radicado")).toBeInTheDocument();
    expect(screen.getByText("En gestión")).toBeInTheDocument();
    expect(screen.getByText("Finalizado")).toBeInTheDocument();
  });

  it("implements the radio keyboard contract with roving focus", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChoiceGrid label="Tipo" value="first" onChange={onChange} options={[{ value: "first", label: "Primera" }, { value: "second", label: "Segunda" }, { value: "third", label: "Tercera" }]} />);

    screen.getByRole("radio", { name: "Primera" }).focus();
    await user.keyboard("{ArrowDown}");

    expect(onChange).toHaveBeenCalledWith("second");
    expect(screen.getByRole("radio", { name: "Segunda" })).toHaveFocus();
  });
});

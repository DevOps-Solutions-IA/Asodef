import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CopyReferenceAction } from "./CopyReferenceAction";
import { MobileActionSwitcher } from "./MobileActionSwitcher";
import { ProgressiveStepShell } from "./ProgressiveStepShell";
import { useRecoverableFormState } from "./useRecoverableFormState";

describe("mobile public patterns", () => {
  it("offers large semantic choices without relying on motion", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MobileActionSwitcher label="Elige una gestión" value="create" onChange={onChange} options={[{ value: "create", label: "Crear solicitud" }, { value: "track", label: "Consultar referencia" }]} />);
    const selected = screen.getByRole("radio", { name: "Crear solicitud" });
    expect(selected).toHaveAttribute("aria-checked", "true");
    expect(selected).toHaveClass("min-h-14");
    await user.click(screen.getByRole("radio", { name: "Consultar referencia" }));
    expect(onChange).toHaveBeenCalledWith("track");
  });

  it("announces progress and moves focus when a step changes", async () => {
    const { rerender } = render(<ProgressiveStepShell currentStep={1} totalSteps={4} title="Categoría"><p>Contenido</p></ProgressiveStepShell>);
    expect(screen.getByRole("heading", { name: "Categoría" })).toHaveFocus();
    expect(screen.getByText("Paso 1 de 4: Categoría")).toHaveAttribute("aria-live", "polite");
    rerender(<ProgressiveStepShell currentStep={2} totalSteps={4} title="Descripción"><p>Contenido</p></ProgressiveStepShell>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Descripción" })).toHaveFocus());
  });

  it("copies a public reference and confirms the action accessibly", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<MemoryRouter><CopyReferenceAction value="PQR-2026-001" /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: /Copiar referencia: PQR-2026-001/ }));
    expect(writeText).toHaveBeenCalledWith("PQR-2026-001");
    expect(await screen.findByText("Referencia copiada", { selector: "button" })).toBeInTheDocument();
  });

  it("offers a manual-copy recovery message when the Clipboard API rejects", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("blocked"));
    render(<MemoryRouter><CopyReferenceAction value="DSR-2026-001" /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: /Copiar referencia: DSR-2026-001/ }));
    expect(await screen.findByText(/No fue posible copiar automáticamente/)).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: /Copiar referencia: DSR-2026-001/ })).toHaveTextContent("No se pudo copiar");
  });

  it("recovers session state and clears it without affecting other keys", () => {
    sessionStorage.clear();
    sessionStorage.setItem("other", "keep");
    const initial = { step: 1, category: "" };
    const { result, unmount } = renderHook(() => useRecoverableFormState("asodef:test-flow", initial));
    act(() => result.current.setValue({ step: 2, category: "consulta" }));
    expect(JSON.parse(sessionStorage.getItem("asodef:test-flow") ?? "{}")).toMatchObject({ version: 1, value: { step: 2, category: "consulta" } });
    unmount();
    const recovered = renderHook(() => useRecoverableFormState("asodef:test-flow", initial));
    expect(recovered.result.current.value).toEqual({ step: 2, category: "consulta" });
    act(() => recovered.result.current.clear());
    expect(recovered.result.current.value).toEqual(initial);
    expect(sessionStorage.getItem("other")).toBe("keep");
  });
});

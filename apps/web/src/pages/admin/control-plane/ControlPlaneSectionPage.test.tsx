import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ControlPlaneSectionPage } from "./ControlPlaneSectionPage";

function renderSection(path: string, area: "koral" | "comunicaciones") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin/:area/:sectionSlug"
          element={<ControlPlaneSectionPage area={area} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ControlPlaneSectionPage", () => {
  it("presents Inbox safety without fake cases or enabled actions", () => {
    renderSection("/admin/koral/inbox", "koral");
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(
      screen.getByText("Adaptador al contrato canónico requerido"),
    ).toBeInTheDocument();
    expect(screen.getByText("Asignación no verificable")).toBeInTheDocument();
    expect(
      screen.getByText("Handoff UNAVAILABLE en esta UI"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /tomar caso/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps model credentials out of the agents foundation", () => {
    renderSection("/admin/koral/agentes", "koral");
    expect(
      screen.getByRole("heading", { name: "Perfiles de modelo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nunca renderizadas en el cliente"),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("sk-or-v1-");
  });

  it("includes preview, diff and audit in editable communications", () => {
    renderSection("/admin/comunicaciones/plantillas", "comunicaciones");
    expect(screen.getByText("Vista previa")).toBeInTheDocument();
    expect(screen.getByText("Diferencias")).toBeInTheDocument();
    expect(screen.getByText("Auditoría")).toBeInTheDocument();
    expect(
      screen.getByText("Communications runtime NOT_CONFIGURED"),
    ).toBeInTheDocument();
  });

  it("exposes the canonical automation surfaces without enabling a runtime", () => {
    renderSection("/admin/koral/automatizaciones", "koral");
    for (const capability of [
      "Trigger",
      "Condiciones",
      "Acciones",
      "Versiones",
      "Historial de ejecución",
      "Dead-letter",
    ])
      expect(screen.getByText(capability)).toBeInTheDocument();
    expect(
      screen.getByText("Automation runtime NOT_CONFIGURED"),
    ).toBeInTheDocument();
  });

  it("keeps plan-dependent recommendations blocked by Plans", () => {
    renderSection("/admin/koral/recomendaciones", "koral");
    expect(
      screen.getByText("Bloqueado por el contrato de Planes"),
    ).toBeInTheDocument();
  });
});

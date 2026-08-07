import { describe, expect, it } from "vitest";
import type { RouteObject } from "react-router-dom";
import { AFFILIATE_SELF_SERVICE_NAV } from "../layouts/AffiliateSelfServiceLayout";
import { COMPANY_SELF_SERVICE_NAV } from "../layouts/CompanySelfServiceLayout";
import { affiliateSelfServiceRoute } from "./affiliate-self-service-routes";
import { companySelfServiceRoute } from "./company-self-service-routes";

function paths(route: RouteObject, prefix = ""): string[] {
  const current = route.path ? `${prefix}/${route.path}`.replace(/\/+/g, "/") : prefix;
  return [current, ...(route.children ?? []).flatMap((child) => paths(child, current))];
}

describe("self-service route manifests", () => {
  it("covers every affiliate route and exact navigation label", () => {
    const manifest = paths(affiliateSelfServiceRoute);
    expect(manifest).toEqual(expect.arrayContaining(["/mi-cuenta/acceso", "/mi-cuenta/afiliacion", "/mi-cuenta/beneficiarios", "/mi-cuenta/beneficiarios/nueva-solicitud", "/mi-cuenta/beneficiarios/solicitudes/:requestId", "/mi-cuenta/estado-de-cuenta", "/mi-cuenta/pagos", "/mi-cuenta/documentos", "/mi-cuenta/solicitudes", "/mi-cuenta/notificaciones"]));
    expect(AFFILIATE_SELF_SERVICE_NAV.map((item) => item.label)).toEqual(["Resumen", "Mi afiliación", "Beneficiarios", "Estado de cuenta", "Pagos y comprobantes", "Documentos", "Solicitudes", "Notificaciones"]);
  });

  it("covers the complete company portal", () => {
    const manifest = paths(companySelfServiceRoute);
    expect(manifest).toEqual(expect.arrayContaining(["/empresa/acceso", "/empresa/resumen", "/empresa/beneficios", "/empresa/contratos", "/empresa/pagos", "/empresa/documentos", "/empresa/solicitudes", "/empresa/reportes"]));
    expect(COMPANY_SELF_SERVICE_NAV).toHaveLength(7);
  });
});

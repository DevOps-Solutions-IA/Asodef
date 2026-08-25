import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { PublicLayout } from "./PublicLayout";
import { CookieConsentProvider } from "../lib/cookie-consent/CookieConsentContext";

function renderLayout() {
  const router = createMemoryRouter([{ path: "/", element: <PublicLayout/>, children: [{ index: true, element: <p>Contenido</p> }, { path: "beneficios", element: <p>Beneficios</p> }] }]);
  return render(<CookieConsentProvider><RouterProvider router={router}/></CookieConsentProvider>);
}

describe("premium public navigation", () => {
  beforeEach(()=>{localStorage.clear();vi.stubGlobal("fetch",vi.fn(()=>Promise.resolve(new Response(null,{status:204}))));});
  afterEach(()=>vi.unstubAllGlobals());

  it("uses the official brand and flagship top-level destinations", () => {
    renderLayout();
    expect(within(screen.getByRole("link", { name: /ASODEF S.A.S., inicio/i })).getByRole("img", { name: "ASODEF S.A.S." })).toBeInTheDocument();
    const nav=screen.getByRole("navigation",{name:"Principal"});
    for(const label of ["Inicio","Quiénes somos","Beneficios","Soluciones","Empresas"]) expect(within(nav).getByRole("link",{name:label})).toBeInTheDocument();
    const pagar=screen.getByRole("link",{name:"Pagar"});
    expect(pagar).toHaveAttribute("href","/pagos");
    expect(screen.getByRole("link",{name:"Recibir orientación"})).toHaveAttribute("href","/comenzar");
    expect(screen.getByRole("button", { name: "Abrir chat con Koral" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("separates affiliate, company and administrative access", async()=>{
    const user=userEvent.setup();renderLayout();const trigger=screen.getByRole("button",{name:"Accesos"});await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded","true");
    const panel=document.getElementById("access-menu");expect(panel).not.toBeNull();
    expect(within(panel!).getAllByRole("link")).toHaveLength(3);
    expect(within(panel!).getByRole("link",{name:/Afiliados/})).toHaveAttribute("href","/mi-cuenta/acceso");
    expect(within(panel!).getByRole("link",{name:/Empresas/})).toHaveAttribute("href","/empresa/acceso");
    expect(within(panel!).getByRole("link",{name:/Acceso administrativo/})).toHaveAttribute("href","/iniciar-sesion");
    await user.tab();
    expect(within(panel!).getByRole("link",{name:/Afiliados/})).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded","false");
    await waitFor(()=>expect(trigger).toHaveFocus());
  });

  it("opens a focused resources panel containing only PQR and data requests", async()=>{
    const user=userEvent.setup();renderLayout();const trigger=screen.getByRole("button",{name:"Recursos"});await user.click(trigger);
    const panel=document.getElementById("resource-menu");
    expect(trigger).toHaveAttribute("aria-expanded","true");expect(panel).not.toBeNull();
    expect(within(panel!).getAllByRole("link")).toHaveLength(2);
    expect(within(panel!).getByRole("link",{name:/PQR/})).toHaveAttribute("href","/pqr");
    expect(within(panel!).getByRole("link",{name:/Solicitudes de datos/})).toHaveAttribute("href","/solicitudes-de-datos");
    expect(within(panel!).queryByText("Contacto")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");expect(trigger).toHaveAttribute("aria-expanded","false");
  });

  it("groups mobile destinations, exposes one close action, and restores trigger focus",async()=>{
    const user=userEvent.setup();renderLayout();const trigger=screen.getByRole("button",{name:"Abrir menú de navegación"});await user.click(trigger);
    const dialog=await screen.findByRole("dialog");
    for(const group of ["Conocer ASODEF","Recursos"])expect(within(dialog).getByText(group)).toBeInTheDocument();
    expect(within(dialog).getAllByRole("button",{name:"Cerrar"})).toHaveLength(1);
    await user.click(within(dialog).getByRole("button",{name:"Accesos"}));
    expect(within(dialog).getByRole("link",{name:/Acceso administrativo/})).toHaveAttribute("href","/iniciar-sesion");
    const accessPanel=within(dialog).getByRole("button",{name:"Accesos"}).getAttribute("aria-controls");
    const accessList=document.getElementById(accessPanel!);expect(accessList).not.toBeNull();
    expect(within(accessList!).getByRole("link",{name:/Afiliados/})).toHaveAttribute("href","/mi-cuenta/acceso");
    expect(within(accessList!).getByRole("link",{name:/Empresas/})).toHaveAttribute("href","/empresa/acceso");
    await user.keyboard("{Escape}");await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());expect(trigger).toHaveFocus();
  });

  it("keeps the exact mobile resources and action hierarchy without duplicates",async()=>{
    const user=userEvent.setup();renderLayout();await user.click(screen.getByRole("button",{name:"Abrir menú de navegación"}));
    const dialog=await screen.findByRole("dialog");
    const mobileNav=within(dialog).getByRole("navigation",{name:"Principal móvil"});
    const accessTrigger=within(mobileNav).getByRole("button",{name:"Accesos"});
    expect(accessTrigger).toHaveClass("min-h-12");
    expect(accessTrigger).toHaveAttribute("aria-expanded","false");
    await user.click(accessTrigger);
    expect(accessTrigger).toHaveAttribute("aria-expanded","true");
    expect(within(mobileNav).getAllByRole("link")).toHaveLength(9);
    expect(within(mobileNav).getByRole("link",{name:"PQR"})).toHaveClass("min-h-14");
    expect(within(mobileNav).getByRole("link",{name:"Solicitudes de datos"})).toBeInTheDocument();
    expect(within(mobileNav).queryByRole("link",{name:"Contacto"})).not.toBeInTheDocument();
    const actions=within(dialog).getByLabelText("Acciones principales");
    const links=within(actions).getAllByRole("link");
    expect(links.map(link=>link.textContent?.trim())).toEqual(["Pagar","Recibir orientación"]);
    expect(links.every(link=>link.className.includes("w-full"))).toBe(true);
  });

  it("keeps cookie preferences and institutional resource routes in the footer",()=>{
    renderLayout();const footer=screen.getByRole("contentinfo");
    expect(within(footer).getByRole("button",{name:"Preferencias de cookies"})).toBeInTheDocument();
    expect(within(footer).getByRole("link",{name:"Centro Legal"})).toHaveAttribute("href","/legal");
    expect(within(footer).getByRole("link",{name:"PQR"})).toHaveAttribute("href","/pqr");
    expect(within(footer).getByRole("link",{name:"Contacto y atención"})).toHaveAttribute("href","/contacto");
  });
});

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
    expect(screen.getByRole("link",{name:"Comenzar"})).toHaveAttribute("href","/comenzar");
  });

  it("opens an accessible resources panel and closes it with Escape", async()=>{
    const user=userEvent.setup();renderLayout();const trigger=screen.getByRole("button",{name:"Recursos"});await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded","true");expect(screen.getAllByText("Preguntas frecuentes").length).toBeGreaterThan(0);
    await user.keyboard("{Escape}");expect(trigger).toHaveAttribute("aria-expanded","false");
  });

  it("groups mobile destinations and restores trigger focus on Escape",async()=>{
    const user=userEvent.setup();renderLayout();const trigger=screen.getByRole("button",{name:"Abrir menú de navegación"});await user.click(trigger);
    const dialog=await screen.findByRole("dialog");
    for(const group of ["Conocer ASODEF","Gestionar","Consultar"])expect(within(dialog).getByText(group)).toBeInTheDocument();
    expect(within(dialog).getByRole("link",{name:"Ingresar"})).toHaveAttribute("href","/iniciar-sesion");
    await user.keyboard("{Escape}");await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());expect(trigger).toHaveFocus();
  });

  it("keeps cookie preferences and institutional resource routes in the footer",()=>{
    renderLayout();const footer=screen.getByRole("contentinfo");
    expect(within(footer).getByRole("button",{name:"Preferencias de cookies"})).toBeInTheDocument();
    expect(within(footer).getByRole("link",{name:"Centro Legal"})).toHaveAttribute("href","/legal");
    expect(within(footer).getByRole("link",{name:"PQR"})).toHaveAttribute("href","/pqr");
  });
});

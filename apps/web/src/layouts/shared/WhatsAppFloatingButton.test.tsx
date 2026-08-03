import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WhatsAppFloatingButton } from "./WhatsAppFloatingButton";

const props = {
  phoneNumber: "573232733927",
  tooltip: "Escríbenos por WhatsApp",
  ariaLabel: "Contactar por WhatsApp (se abre en una pestaña nueva)",
};

describe("WhatsAppFloatingButton", () => {
  it("links to the correct WhatsApp number with no prefilled message", () => {
    render(<WhatsAppFloatingButton {...props} />);
    const link = screen.getByRole("link", { name: props.ariaLabel });
    expect(link).toHaveAttribute("href", "https://wa.me/573232733927");
  });

  it("opens in a new tab safely", () => {
    render(<WhatsAppFloatingButton {...props} />);
    const link = screen.getByRole("link", { name: props.ariaLabel });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows a tooltip on focus", async () => {
    render(<WhatsAppFloatingButton {...props} />);
    const link = screen.getByRole("link", { name: props.ariaLabel });
    link.focus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Escríbenos por WhatsApp");
  });

  it("has a decorative pulse element that respects reduced motion via motion-safe", () => {
    const { container } = render(<WhatsAppFloatingButton {...props} />);
    const pulse = container.querySelector('[aria-hidden="true"].motion-safe\\:animate-pulse');
    expect(pulse).toBeInTheDocument();
  });

  it("shows a visible focus outline on the link", () => {
    render(<WhatsAppFloatingButton {...props} />);
    const link = screen.getByRole("link", { name: props.ariaLabel });
    expect(link.className).toMatch(/focus-visible:ring/);
  });
});

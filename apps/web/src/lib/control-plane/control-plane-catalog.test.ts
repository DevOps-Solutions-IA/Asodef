import { describe, expect, it } from "vitest";
import {
  COMMUNICATION_SECTIONS,
  getContractClassification,
  getControlPlanePermission,
  KORAL_SECTIONS,
} from "./control-plane-catalog";

describe("Control Plane consumer catalog", () => {
  it.each(["conversaciones", "inbox"])(
    "uses Koral Core's canonical read permission for %s",
    (slug) => {
      expect(getControlPlanePermission("koral", slug)).toBe(
        "koral.conversations.read",
      );
      expect(getContractClassification("koral", slug)).toBe("MATCHES_CANONICAL");
    },
  );

  it("marks visible Koral projections as canonical and hides recommendations", () => {
    for (const section of KORAL_SECTIONS.filter(
      ({ slug }) =>
        slug !== "conversaciones" &&
        slug !== "inbox" &&
        slug !== "conocimiento",
    )) {
      expect(getControlPlanePermission("koral", section.slug)).toBe(
        "settings.manage",
      );
      expect(getContractClassification("koral", section.slug)).toBe(
        "MATCHES_CANONICAL",
      );
    }
    expect(KORAL_SECTIONS.some(({ slug }) => slug === "recomendaciones")).toBe(false);
    expect(getContractClassification("koral", "recomendaciones")).toBe(
      "BACKEND_RUNTIME_MISSING",
    );
    expect(getControlPlanePermission("koral", "conocimiento")).toBe("knowledge.read");
    expect(getContractClassification("koral", "conocimiento")).toBe("MATCHES_CANONICAL");
    for (const section of COMMUNICATION_SECTIONS) {
      expect(getControlPlanePermission("comunicaciones", section.slug)).toBe(
        "settings.manage",
      );
      expect(getContractClassification("comunicaciones", section.slug)).toBe(
        "BACKEND_RUNTIME_MISSING",
      );
    }
  });
});

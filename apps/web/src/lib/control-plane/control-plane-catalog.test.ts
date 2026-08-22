import { describe, expect, it } from "vitest";
import {
  COMMUNICATION_SECTIONS,
  getContractClassification,
  getControlPlanePermission,
  KORAL_SECTIONS,
} from "./control-plane-catalog";

describe("Control Plane consumer catalog", () => {
  it.each(["conversaciones", "inbox"])(
    "uses Agent 1's canonical read permission for %s",
    (slug) => {
      expect(getControlPlanePermission("koral", slug)).toBe(
        "koral.conversations.read",
      );
      expect(getContractClassification("koral", slug)).toBe("ADAPTER_REQUIRED");
    },
  );

  it("keeps unmaterialized configuration APIs fail-closed", () => {
    for (const section of KORAL_SECTIONS.filter(
      ({ slug }) => slug !== "conversaciones" && slug !== "inbox",
    )) {
      expect(getControlPlanePermission("koral", section.slug)).toBe(
        "settings.manage",
      );
      expect(getContractClassification("koral", section.slug)).toBe(
        "BACKEND_MISSING",
      );
    }
    for (const section of COMMUNICATION_SECTIONS) {
      expect(getControlPlanePermission("comunicaciones", section.slug)).toBe(
        "settings.manage",
      );
      expect(getContractClassification("comunicaciones", section.slug)).toBe(
        "BACKEND_MISSING",
      );
    }
  });
});

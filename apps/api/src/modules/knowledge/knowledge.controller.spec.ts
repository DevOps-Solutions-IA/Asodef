import { PATH_METADATA } from "@nestjs/common/constants";
import { PERMISSIONS_KEY } from "../auth/decorators/permissions.decorator";
import { REQUIRE_STEP_UP_KEY } from "../auth/decorators/require-step-up.decorator";
import { KnowledgeController } from "./knowledge.controller";

describe("KnowledgeController governance metadata", () => {
  const manageOperations = [
    "createManualDraft",
    "createFileDraft",
    "registerOfficialWebImport",
    "submitReview",
    "returnToDraft",
  ] as const;
  const publishOperations = [
    "approve",
    "publish",
    "retire",
    "preview",
  ] as const;

  it("keeps the entire administrative surface authenticated and non-public", () => {
    expect(Reflect.getMetadata(PATH_METADATA, KnowledgeController)).toBe(
      "admin/knowledge",
    );
    expect(
      Object.getOwnPropertyNames(KnowledgeController.prototype),
    ).not.toContain("search");
  });

  it.each(manageOperations)(
    "%s requires knowledge.manage and step-up",
    (operation) => {
      const handler = KnowledgeController.prototype[operation];
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
        "knowledge.manage",
      ]);
      expect(Reflect.getMetadata(REQUIRE_STEP_UP_KEY, handler)).toBe(true);
    },
  );

  it.each(publishOperations)(
    "%s requires knowledge.publish and step-up",
    (operation) => {
      const handler = KnowledgeController.prototype[operation];
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
        "knowledge.publish",
      ]);
      expect(Reflect.getMetadata(REQUIRE_STEP_UP_KEY, handler)).toBe(true);
    },
  );

  it("keeps preview governed and separate from publication", () => {
    const previewPath = Reflect.getMetadata(
      PATH_METADATA,
      KnowledgeController.prototype.preview,
    );
    const publishPath = Reflect.getMetadata(
      PATH_METADATA,
      KnowledgeController.prototype.publish,
    );
    expect(previewPath).toBe("versions/:id/preview");
    expect(publishPath).toBe("versions/:id/publish");
    expect(previewPath).not.toBe(publishPath);
  });
});

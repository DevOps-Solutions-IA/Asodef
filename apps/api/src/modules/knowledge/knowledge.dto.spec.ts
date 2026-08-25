import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ListKnowledgeItemsQueryDto } from "./knowledge.dto";

describe("ListKnowledgeItemsQueryDto", () => {
  it("transforms valid pagination query strings into numbers", async () => {
    const dto = plainToInstance(ListKnowledgeItemsQueryDto, {
      page: "1",
      pageSize: "30",
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto).toMatchObject({ page: 1, pageSize: 30 });
    expect(typeof dto.page).toBe("number");
    expect(typeof dto.pageSize).toBe("number");
  });

  it.each(["0", "101", "no-numerico"])(
    "rejects invalid pageSize=%s after canonical transformation",
    async (pageSize) => {
      const dto = plainToInstance(ListKnowledgeItemsQueryDto, {
        page: "1",
        pageSize,
      });

      const errors = await validate(dto);
      expect(errors.some(({ property }) => property === "pageSize")).toBe(true);
    },
  );
});

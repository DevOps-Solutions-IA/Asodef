import { parseCorsOrigins } from "./cors";

describe("parseCorsOrigins", () => {
  it("parses a single origin", () => {
    expect(parseCorsOrigins("https://asodef.com.co")).toEqual(["https://asodef.com.co"]);
  });

  it("parses a comma-separated list and trims whitespace", () => {
    expect(parseCorsOrigins("https://asodef.com.co, https://www.asodef.com.co ,http://localhost:5173")).toEqual([
      "https://asodef.com.co",
      "https://www.asodef.com.co",
      "http://localhost:5173",
    ]);
  });

  it("drops empty entries caused by a trailing comma", () => {
    expect(parseCorsOrigins("https://asodef.com.co,")).toEqual(["https://asodef.com.co"]);
  });

  it("returns an empty array for a blank string", () => {
    expect(parseCorsOrigins("")).toEqual([]);
  });
});

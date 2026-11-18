import { describe, expect, it } from "vitest";
import { parseModelIds } from "../modelListText";

describe("parseModelIds()", () => {
  it("should split on newlines and commas", () => {
    expect(parseModelIds("gpt-4o\nllama-3.1, m2")).toEqual(["gpt-4o", "llama-3.1", "m2"]);
  });

  it("should trim whitespace and drop empty items", () => {
    expect(parseModelIds("  a ,\n\n , b \n")).toEqual(["a", "b"]);
  });

  it("should dedupe, case-sensitively", () => {
    expect(parseModelIds("m1, m1, M1")).toEqual(["m1", "M1"]);
  });

  it("should return an empty list for blank input", () => {
    expect(parseModelIds("")).toEqual([]);
  });
});

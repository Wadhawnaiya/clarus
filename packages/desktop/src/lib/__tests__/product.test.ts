import { describe, expect, it } from "vitest";
import { PRODUCT_NAME, UI_STORAGE_PREFIX } from "../product";

describe("product identity (renderer)", () => {
  it("should use Clarus as the product name", () => {
    expect(PRODUCT_NAME).toBe("Clarus");
  });

  it("should prefix UI storage keys with clarus", () => {
    expect(UI_STORAGE_PREFIX).toBe("clarus");
  });
});

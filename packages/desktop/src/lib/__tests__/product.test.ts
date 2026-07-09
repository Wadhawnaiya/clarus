import { describe, expect, it } from "vitest";
import { PRODUCT_NAME, RELEASES_URL, UI_STORAGE_PREFIX } from "../product";

describe("product identity (renderer)", () => {
  it("should use Clarus as the product name", () => {
    expect(PRODUCT_NAME).toBe("Clarus");
  });

  it("should point the changelog at the firm Clarus releases page", () => {
    expect(RELEASES_URL).toContain("Wadhawnaiya/clarus");
    expect(RELEASES_URL).not.toContain("machulav/accountant24");
  });

  it("should prefix UI storage keys with clarus", () => {
    expect(UI_STORAGE_PREFIX).toBe("clarus");
  });
});

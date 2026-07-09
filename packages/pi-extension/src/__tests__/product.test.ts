import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_DIR_NAME,
  EXTENSION_BUNDLE_NAME,
  HOME_ENV,
  LEGACY_HOME_ENV,
  PRODUCT_NAME,
  SCAFFOLD_COMMIT_MESSAGE,
} from "../product";

describe("product identity", () => {
  it("should use Clarus as the product name", () => {
    expect(PRODUCT_NAME).toBe("Clarus");
  });

  it("should prefer CLARUS_HOME as the workspace env key", () => {
    expect(HOME_ENV).toBe("CLARUS_HOME");
  });

  it("should keep ACCOUNTANT24_HOME as the legacy workspace env key", () => {
    expect(LEGACY_HOME_ENV).toBe("ACCOUNTANT24_HOME");
  });

  it("should default the workspace folder name to Clarus", () => {
    expect(DEFAULT_WORKSPACE_DIR_NAME).toBe("Clarus");
  });

  it("should name the extension bundle clarus-extension.js", () => {
    expect(EXTENSION_BUNDLE_NAME).toBe("clarus-extension.js");
  });

  it("should use a Clarus scaffold commit message", () => {
    expect(SCAFFOLD_COMMIT_MESSAGE).toBe("Initial Clarus setup");
  });
});

import { describe, expect, it } from "vitest";
import {
  APP_ID,
  APTABASE_APP_KEY,
  AUTO_UPDATE_ENABLED,
  DEFAULT_WORKSPACE_DIR_NAME,
  EXTENSION_BUNDLE_NAME,
  HOME_ENV,
  isAnalyticsConfigured,
  LEGACY_HOME_ENV,
  PRODUCT_NAME,
  UPDATE_FEED_GITHUB_OWNER,
  UPDATE_FEED_GITHUB_REPO,
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

  it("should use a Clarus appId", () => {
    expect(APP_ID).toBe("com.clarus.desktop");
  });

  it("should not ship the upstream Accountant24 Aptabase key by default", () => {
    expect(APTABASE_APP_KEY).toBe("");
    expect(isAnalyticsConfigured()).toBe(false);
  });

  it("should keep silent auto-update off for pilot until firm enables it", () => {
    expect(AUTO_UPDATE_ENABLED).toBe(false);
  });

  it("should point the update feed at the firm Clarus GitHub repo", () => {
    expect(UPDATE_FEED_GITHUB_OWNER).toBe("Wadhawnaiya");
    expect(UPDATE_FEED_GITHUB_REPO).toBe("clarus");
    expect(UPDATE_FEED_GITHUB_OWNER).not.toBe("machulav");
    expect(UPDATE_FEED_GITHUB_REPO).not.toBe("accountant24");
  });
});

import { describe, expect, it } from "vitest";
import { clientFolderLabel } from "@/lib/clientFolder";

describe("clientFolderLabel()", () => {
  it("should return the last path segment for a Unix path", () => {
    expect(clientFolderLabel("/home/firm/clients/Acme Corp")).toBe("Acme Corp");
  });

  it("should ignore a trailing slash", () => {
    expect(clientFolderLabel("/home/firm/clients/Acme/")).toBe("Acme");
  });

  it("should handle a Windows-style path", () => {
    expect(clientFolderLabel("C:\\Clients\\Beta Ltd")).toBe("Beta Ltd");
  });

  it("should return the path itself when there is no separator", () => {
    expect(clientFolderLabel("solo")).toBe("solo");
  });
});

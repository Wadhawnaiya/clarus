import { describe, expect, it } from "vitest";
import {
  DARWIN_TOOLS,
  resolveVendorTarget,
  WIN_HLEDGER,
  WIN_POPPLER,
  WIN_TESSDATA_ENG,
  windowsToolExes,
} from "../vendor-bin-sources";

describe("resolveVendorTarget()", () => {
  it("should return win32 when VENDOR_TARGET=win32 regardless of host platform", () => {
    expect(resolveVendorTarget({ VENDOR_TARGET: "win32" }, "linux")).toBe("win32");
    expect(resolveVendorTarget({ VENDOR_TARGET: "windows" }, "darwin")).toBe("win32");
    expect(resolveVendorTarget({ VENDOR_TARGET: "WIN" }, "darwin")).toBe("win32");
  });

  it("should return darwin when VENDOR_TARGET=darwin regardless of host platform", () => {
    expect(resolveVendorTarget({ VENDOR_TARGET: "darwin" }, "linux")).toBe("darwin");
    expect(resolveVendorTarget({ VENDOR_TARGET: "mac" }, "win32")).toBe("darwin");
  });

  it("should follow process.platform when VENDOR_TARGET is unset", () => {
    expect(resolveVendorTarget({}, "win32")).toBe("win32");
    expect(resolveVendorTarget({}, "darwin")).toBe("darwin");
  });

  it("should throw on unsupported host platforms without an override", () => {
    expect(() => resolveVendorTarget({}, "linux")).toThrow(/VENDOR_TARGET/);
  });
});

describe("Windows download pins", () => {
  it("should pin hledger 1.52.1 Windows x64 zip on GitHub releases", () => {
    expect(WIN_HLEDGER.version).toBe("1.52.1");
    expect(WIN_HLEDGER.exe).toBe("hledger.exe");
    expect(WIN_HLEDGER.url).toBe(
      "https://github.com/simonmichael/hledger/releases/download/1.52.1/hledger-windows-x64.zip",
    );
  });

  it("should pin a poppler-windows Release zip with pdftotext.exe", () => {
    expect(WIN_POPPLER.exe).toBe("pdftotext.exe");
    expect(WIN_POPPLER.url).toContain("poppler-windows");
    expect(WIN_POPPLER.url).toContain("Release-24.08.0-0.zip");
  });

  it("should pin eng.traineddata from tessdata for TESSDATA_PREFIX", () => {
    expect(WIN_TESSDATA_ENG.file).toBe("eng.traineddata");
    expect(WIN_TESSDATA_ENG.url).toContain("eng.traineddata");
  });

  it("should list the three Windows tool exes the app expects on PATH", () => {
    expect(windowsToolExes()).toEqual(["hledger.exe", "pdftotext.exe", "tesseract.exe"]);
  });
});

describe("DARWIN_TOOLS", () => {
  it("should map the three Homebrew formulae to the CLIs the app shells out to", () => {
    expect(DARWIN_TOOLS.map((t) => t.exe)).toEqual(["hledger", "pdftotext", "tesseract"]);
  });
});

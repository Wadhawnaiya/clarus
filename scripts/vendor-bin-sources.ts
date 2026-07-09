// Pinned download sources for Windows-native CLI tools vendored into
// packages/desktop/resources. Kept separate from vendor-bin.ts so unit tests
// can assert URLs/versions without running network or brew.

export type VendorTarget = "darwin" | "win32";

/** Resolve which platform's tool layout to vendor.
 *  VENDOR_TARGET=win32|darwin overrides process.platform (for cross-prep on CI/Linux). */
export function resolveVendorTarget(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): VendorTarget {
  const raw = (env.VENDOR_TARGET ?? "").trim().toLowerCase();
  if (raw === "win32" || raw === "windows" || raw === "win") return "win32";
  if (raw === "darwin" || raw === "mac" || raw === "macos") return "darwin";
  if (platform === "win32") return "win32";
  if (platform === "darwin") return "darwin";
  throw new Error(
    `vendor-bin: unsupported platform "${platform}". Run on macOS or Windows, ` +
      `or set VENDOR_TARGET=win32|darwin to cross-prepare binaries.`,
  );
}

/** Windows tool download pins (reproduceable CI/pilot builds). */
export const WIN_HLEDGER = {
  version: "1.52.1",
  url: "https://github.com/simonmichael/hledger/releases/download/1.52.1/hledger-windows-x64.zip",
  exe: "hledger.exe",
  homepage: "https://hledger.org/",
  license: "GPL-3.0-or-later",
  source: "https://github.com/simonmichael/hledger/releases/tag/1.52.1",
} as const;

export const WIN_POPPLER = {
  version: "24.08.0-0",
  url: "https://github.com/oschwartz10612/poppler-windows/releases/download/v24.08.0-0/Release-24.08.0-0.zip",
  exe: "pdftotext.exe",
  /** Path segment under the zip that holds pdftotext.exe + DLLs. */
  binGlobSuffix: `${"Library"}/bin`,
  homepage: "https://github.com/oschwartz10612/poppler-windows",
  license: "GPL-2.0-or-later",
  source: "https://github.com/oschwartz10612/poppler-windows/releases/tag/v24.08.0-0",
} as const;

export const WIN_TESSDATA_ENG = {
  url: "https://github.com/tesseract-ocr/tessdata/raw/4.1.0/eng.traineddata",
  file: "eng.traineddata",
  homepage: "https://github.com/tesseract-ocr/tessdata",
  license: "Apache-2.0",
  source: "https://github.com/tesseract-ocr/tessdata/tree/4.1.0",
} as const;

/** macOS Homebrew formulae → executable names (existing vendor path). */
export const DARWIN_TOOLS = [
  { formula: "hledger", exe: "hledger" },
  { formula: "poppler", exe: "pdftotext" },
  { formula: "tesseract", exe: "tesseract" },
] as const;

/** Windows executable names the app looks up under resources/bin. */
export function windowsToolExes(): string[] {
  return [WIN_HLEDGER.exe, WIN_POPPLER.exe, "tesseract.exe"];
}

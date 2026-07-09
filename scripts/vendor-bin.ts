// Vendors the external CLI tools the app shells out to (hledger, pdftotext,
// tesseract) into packages/desktop/resources so electron-builder bundles them
// under extraResources → resources/bin (+ tessdata).
//
// Targets:
//   darwin (default on macOS) — Homebrew install + dylibbundler + ad-hoc codesign
//   win32  (default on Windows, or VENDOR_TARGET=win32) — download pinned zips
//
// Usage:
//   tsx scripts/vendor-bin.ts
//   VENDOR_TARGET=win32 tsx scripts/vendor-bin.ts   # cross-prep Windows bins on Linux/mac

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import {
  DARWIN_TOOLS,
  resolveVendorTarget,
  type VendorTarget,
  WIN_HLEDGER,
  WIN_POPPLER,
  WIN_TESSDATA_ENG,
} from "./vendor-bin-sources";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RES = join(ROOT, "packages", "desktop", "resources");
const BIN = join(RES, "bin");
const LIB = join(BIN, "lib");
const TESSDATA = join(RES, "tessdata");
const LICENSES = join(RES, "THIRD-PARTY-LICENSES.txt");
const TMP = join(RES, ".vendor-tmp");

/** Run a command, inheriting stdio; throw on non-zero. */
function run(cmd: string, args: string[], opts: { input?: string; cwd?: string } = {}): void {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    stdio: opts.input ? ["pipe", "inherit", "inherit"] : "inherit",
    input: opts.input,
    cwd: opts.cwd,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(" ")}`);
}

/** Run a command and return trimmed stdout. */
function capture(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(" ")}`);
  return (r.stdout ?? "").trim();
}

async function download(url: string, dest: string): Promise<void> {
  console.log(`[vendor-bin] download ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(dest));
}

function unzip(zipPath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  if (process.platform === "win32") {
    // PowerShell Expand-Archive is always available on modern Windows runners.
    run("powershell", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ]);
    return;
  }
  // unzip is present on macOS/Linux CI images and most dev machines.
  run("unzip", ["-o", "-q", zipPath, "-d", destDir]);
}

/** Walk a directory tree; return absolute paths of files matching predicate. */
function walkFiles(root: string, pred: (name: string) => boolean): string[] {
  const out: string[] = [];
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, pred));
    else if (pred(entry.name)) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Darwin (Homebrew) path — existing production flow
// ---------------------------------------------------------------------------

type BrewMeta = { version: string; license: string; source: string; homepage: string };

function brewInfo(formulae: string[]): Map<string, BrewMeta> {
  const json = JSON.parse(capture("brew", ["info", "--json=v2", ...formulae]));
  const out = new Map<string, BrewMeta>();
  for (const f of json.formulae ?? []) {
    out.set(f.name, {
      version: f.versions?.stable ?? "unknown",
      license: f.license ?? "see source",
      source: f.urls?.stable?.url ?? f.homepage ?? "",
      homepage: f.homepage ?? "",
    });
  }
  return out;
}

function licenseText(formula: string): string {
  const prefix = capture("brew", ["--prefix", formula]);
  const found = capture("bash", [
    "-c",
    `find -L "${prefix}" -maxdepth 4 -type f \\( -iname 'LICENSE*' -o -iname 'COPYING*' -o -iname 'NOTICE*' \\) 2>/dev/null | head -n1`,
  ]);
  return found ? readFileSync(found, "utf8").trim() : "";
}

function writeDarwinLicenses(): void {
  const meta = brewInfo(DARWIN_TOOLS.map((t) => t.formula));
  const lines: string[] = [
    "Clarus — Third-Party Licenses",
    "",
    "This application bundles the command-line tools below. Their full license text",
    "follows each entry, and the corresponding source for the exact bundled version",
    "is available at the listed URL (this is the GPL written offer of source).",
    "",
  ];
  for (const { formula, exe } of DARWIN_TOOLS) {
    const m = meta.get(formula);
    const text = licenseText(formula);
    lines.push(
      "================================================================",
      `${formula} (${exe}) ${m?.version ?? "?"} — ${m?.license ?? "?"}`,
      `Project: ${m?.homepage ?? ""}`,
      `Corresponding source: ${m?.source ?? ""}`,
      "----------------------------------------------------------------",
      text || `(Full license text: see the source above; SPDX: ${m?.license ?? "?"}.)`,
      "",
    );
  }
  const libs = existsSync(LIB) ? readdirSync(LIB).filter((f) => f.endsWith(".dylib")) : [];
  lines.push(
    "================================================================",
    "Bundled shared libraries",
    "----------------------------------------------------------------",
    "These dynamic libraries are dependencies of the tools above and are",
    "redistributed under their respective upstream open-source licenses, with",
    "corresponding source available from each project (see the tool sources above):",
    "",
    ...libs.map((f) => `  - ${f}`),
    "",
  );
  writeFileSync(LICENSES, lines.join("\n"));
  console.log(`[vendor-bin] wrote ${LICENSES} (${libs.length} bundled libs listed)`);
}

function vendorDarwin(): void {
  if (existsSync(LIB)) rmSync(LIB, { recursive: true, force: true });
  mkdirSync(LIB, { recursive: true });
  mkdirSync(TESSDATA, { recursive: true });

  run("brew", ["install", "hledger", "poppler", "tesseract", "dylibbundler"]);

  const bins: string[] = [];
  for (const { formula, exe } of DARWIN_TOOLS) {
    const prefix = capture("brew", ["--prefix", formula]);
    const src = join(prefix, "bin", exe);
    if (!existsSync(src)) throw new Error(`Expected ${exe} at ${src} after brew install`);
    const dest = join(BIN, exe);
    copyFileSync(src, dest);
    bins.push(dest);
    run("bash", [
      "-c",
      `dylibbundler --bundle-deps --overwrite-files --create-dir ` +
        `--dest-dir "${LIB}" --install-path @executable_path/lib ` +
        `--search-path "${join(prefix, "lib")}" --fix-file "${dest}" < /dev/null`,
    ]);
  }

  const tessShare = join(capture("brew", ["--prefix", "tesseract"]), "share", "tessdata");
  const eng = join(tessShare, "eng.traineddata");
  if (!existsSync(eng)) throw new Error(`eng.traineddata not found at ${eng}`);
  copyFileSync(eng, join(TESSDATA, "eng.traineddata"));

  const dylibs = readdirSync(LIB)
    .filter((f) => f.endsWith(".dylib"))
    .map((f) => join(LIB, f));
  for (const f of [...dylibs, ...bins]) run("codesign", ["--force", "--sign", "-", f]);

  writeDarwinLicenses();
  console.log(`[vendor-bin] ✓ darwin: ${DARWIN_TOOLS.map((t) => t.exe).join(", ")} + eng.traineddata`);
}

// ---------------------------------------------------------------------------
// Windows (download pins) path
// ---------------------------------------------------------------------------

function writeWindowsLicenses(extraNotes: string[]): void {
  const lines: string[] = [
    "Clarus — Third-Party Licenses",
    "",
    "This application bundles the command-line tools below for Windows. Their",
    "licenses and corresponding source locations are listed for each entry.",
    "",
    "================================================================",
    `hledger (${WIN_HLEDGER.exe}) ${WIN_HLEDGER.version} — ${WIN_HLEDGER.license}`,
    `Project: ${WIN_HLEDGER.homepage}`,
    `Corresponding source: ${WIN_HLEDGER.source}`,
    "----------------------------------------------------------------",
    "Full license text: see the GPL-3.0 text in the hledger source repository.",
    "",
    "================================================================",
    `poppler (${WIN_POPPLER.exe}) ${WIN_POPPLER.version} — ${WIN_POPPLER.license}`,
    `Project: ${WIN_POPPLER.homepage}`,
    `Corresponding source: ${WIN_POPPLER.source}`,
    "----------------------------------------------------------------",
    "Full license text: see the GPL-2.0 text in the poppler source distribution.",
    "DLLs beside pdftotext.exe are redistributed with the poppler-windows build.",
    "",
    "================================================================",
    `tesseract eng.traineddata — ${WIN_TESSDATA_ENG.license}`,
    `Project: ${WIN_TESSDATA_ENG.homepage}`,
    `Corresponding source: ${WIN_TESSDATA_ENG.source}`,
    "----------------------------------------------------------------",
    "OCR language data (eng). tesseract.exe itself is vendored when available",
    "from the build host (winget/choco) or left to PATH.",
    "",
    ...extraNotes,
  ];
  writeFileSync(LICENSES, lines.join("\n"));
  console.log(`[vendor-bin] wrote ${LICENSES}`);
}

async function vendorWindows(): Promise<void> {
  mkdirSync(TESSDATA, { recursive: true });
  mkdirSync(TMP, { recursive: true });
  mkdirSync(BIN, { recursive: true });

  // Clean previous Windows binaries (keep README.md).
  for (const name of readdirSync(BIN)) {
    if (name === "README.md") continue;
    const p = join(BIN, name);
    rmSync(p, { recursive: true, force: true });
  }

  // 1. hledger.exe
  const hledgerZip = join(TMP, "hledger-windows-x64.zip");
  await download(WIN_HLEDGER.url, hledgerZip);
  const hledgerExtract = join(TMP, "hledger");
  if (existsSync(hledgerExtract)) rmSync(hledgerExtract, { recursive: true, force: true });
  unzip(hledgerZip, hledgerExtract);
  const hledgerSrc = walkFiles(hledgerExtract, (n) => n.toLowerCase() === "hledger.exe")[0];
  if (!hledgerSrc) throw new Error("hledger.exe not found in downloaded zip");
  copyFileSync(hledgerSrc, join(BIN, WIN_HLEDGER.exe));

  // 2. pdftotext.exe + DLLs from poppler-windows Library/bin
  const popplerZip = join(TMP, "poppler-windows.zip");
  await download(WIN_POPPLER.url, popplerZip);
  const popplerExtract = join(TMP, "poppler");
  if (existsSync(popplerExtract)) rmSync(popplerExtract, { recursive: true, force: true });
  unzip(popplerZip, popplerExtract);
  const pdftotextSrc = walkFiles(popplerExtract, (n) => n.toLowerCase() === "pdftotext.exe")[0];
  if (!pdftotextSrc) throw new Error("pdftotext.exe not found in poppler zip");
  const popplerBinDir = dirname(pdftotextSrc);
  for (const name of readdirSync(popplerBinDir)) {
    const src = join(popplerBinDir, name);
    if (!statSync(src).isFile()) continue;
    // Keep the bin dir flat: all DLLs next to pdftotext.exe (Windows loader).
    copyFileSync(src, join(BIN, name));
  }

  // 3. eng.traineddata (always)
  await download(WIN_TESSDATA_ENG.url, join(TESSDATA, WIN_TESSDATA_ENG.file));

  // 4. tesseract.exe — best-effort on Windows hosts only
  const tessNotes: string[] = [];
  let tessCopied = false;
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
      "C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
    ];
    // Try winget install if missing (non-fatal if it fails).
    const onPath = (() => {
      try {
        return capture("where", ["tesseract"]);
      } catch {
        return "";
      }
    })();
    if (!onPath && !candidates.some((p) => existsSync(p))) {
      try {
        run("winget", [
          "install",
          "--id",
          "UB-Mannheim.TesseractOCR",
          "-e",
          "--accept-source-agreements",
          "--accept-package-agreements",
        ]);
      } catch (e) {
        console.warn(`[vendor-bin] winget tesseract install failed (OCR optional for pilot): ${e}`);
      }
    }
    const found =
      candidates.find((p) => existsSync(p)) ??
      (onPath ? onPath.split(/\r?\n/).find((l) => l.toLowerCase().endsWith("tesseract.exe")) : undefined);
    if (found && existsSync(found)) {
      const tessDir = dirname(found);
      for (const name of readdirSync(tessDir)) {
        if (!/\.(exe|dll)$/i.test(name)) continue;
        copyFileSync(join(tessDir, name), join(BIN, name));
      }
      tessCopied = true;
      tessNotes.push(`tesseract.exe vendored from ${found}`);
    }
  }
  if (!tessCopied) {
    console.warn(
      "[vendor-bin] tesseract.exe not vendored — image OCR will use PATH if available. " +
        "hledger + pdftotext are bundled.",
    );
    tessNotes.push(
      "tesseract.exe was not bundled in this build; install Tesseract OCR on the host for image OCR,",
      "or re-run vendor-bin on a Windows machine with Tesseract installed.",
    );
  }

  writeWindowsLicenses(tessNotes.map((n) => `Note: ${n}`));

  // Drop temp downloads (keep tree small in CI workspaces).
  rmSync(TMP, { recursive: true, force: true });

  const listed = readdirSync(BIN).filter((n) => n !== "README.md");
  console.log(
    `[vendor-bin] ✓ win32: ${listed.length} files in bin/ (incl. DLLs); ` +
      `tessdata=${WIN_TESSDATA_ENG.file}; tesseract=${tessCopied ? "bundled" : "PATH fallback"}`,
  );
  console.log(`[vendor-bin] sample: ${listed.slice(0, 8).map((n) => relative(ROOT, join(BIN, n))).join(", ")}`);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const target: VendorTarget = resolveVendorTarget();
  console.log(`[vendor-bin] target=${target} host=${process.platform}/${process.arch}`);

  mkdirSync(BIN, { recursive: true });

  if (target === "darwin") {
    vendorDarwin();
    return;
  }
  await vendorWindows();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

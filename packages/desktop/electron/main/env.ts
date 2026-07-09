// Resource paths + the environment passed to the pi agent child.
//
// Two roots matter:
//   appConfigDir()  — stable ~/Clarus for app-settings, auth.json, models.json
//   workspaceDir()  — active client folder (ledger, files, sessions, memory)
//
// CLARUS_HOME (and legacy ACCOUNTANT24_HOME) still override the default client
// root when no folder has been opened this session / restored from settings.
// PATH exposes the vendored native tools (hledger/pdftotext/tesseract);
// TESSDATA_PREFIX points at the OCR data.
// pi runs from node_modules, so PI_PACKAGE_DIR is no longer needed (its assets
// sit beside it) — add it back here only if a future pi version requires it.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import { DEFAULT_WORKSPACE_DIR_NAME, EXTENSION_BUNDLE_NAME, HOME_ENV, LEGACY_HOME_ENV } from "./product";

/** Resolve default client root from env (CLARUS_HOME preferred, legacy fallback). */
function resolveHomeFromEnv(): string {
  const preferred = process.env[HOME_ENV];
  if (preferred && preferred.length > 0) return preferred;
  const legacy = process.env[LEGACY_HOME_ENV];
  if (legacy && legacy.length > 0) return legacy;
  return path.join(homedir(), DEFAULT_WORKSPACE_DIR_NAME);
}

/** Stable app home: settings, provider auth, and models — not the active client. */
export function appConfigDir(): string {
  return path.join(homedir(), DEFAULT_WORKSPACE_DIR_NAME);
}

/** In-memory override for the active client folder (set on open / restore). */
let activeWorkspace: string | undefined;

/** Set or clear the active client workspace (absolute path). */
export function setActiveWorkspace(dir: string | undefined): void {
  activeWorkspace = dir ? path.resolve(dir) : undefined;
}

/** Active client folder: open-folder override, else env, else ~/Clarus. */
export function workspaceDir(): string {
  if (activeWorkspace) return activeWorkspace;
  return resolveHomeFromEnv();
}

/** Dir holding vendored bin/ + tessdata/ + the extension bundle.
 *  Dev: packages/desktop/resources. Packaged: the app's resources dir
 *  (electron-builder extraResources land directly under it). */
function resourceDir(): string {
  return app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), "resources");
}

/** Absolute path to pi's Node CLI entry (run with Electron-as-Node). pi is
 *  ESM-only (its package "exports" has no `require` condition), so resolve via
 *  import.meta.resolve (the "." entry → dist/index.js) and take sibling cli.js. */
export function piCliPath(): string {
  const main = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
  return path.join(path.dirname(main), "cli.js");
}

/** Dir holding the vendored native tools (hledger/pdftotext/tesseract). Prepended
 *  to the agent child's PATH; also used to resolve a tool's absolute path when we
 *  run one directly from the main process (which does NOT inherit that PATH). */
export function binDir(): string {
  return path.join(resourceDir(), "bin");
}

/** The bundled extension passed to `pi -e`. Loaded as JS in both dev and
 *  packaged (Electron-as-Node can't parse the TS source); produced by
 *  scripts/bundle-extension.ts. */
export function extensionPath(): string {
  return path.join(resourceDir(), EXTENSION_BUNDLE_NAME);
}

/** Binary for running pi as Node (ELECTRON_RUN_AS_NODE). On macOS, use the
 *  bundled Helper app's binary instead of the main app binary: pi touches
 *  AppKit at startup, which makes LaunchServices register the child under its
 *  bundle's Info.plist — for the main binary that's a regular app, i.e. a
 *  second (generic "exec") Dock icon. The helper bundles are LSUIElement, so
 *  the same process stays invisible. Falls back to the main binary if the
 *  helper isn't at the expected path. */
export function nodeRuntimePath(): string {
  if (process.platform !== "darwin") return process.execPath;
  // <App>.app/Contents/MacOS/<App> -> <App>.app (also matches dev's Electron.app)
  const bundle = path.resolve(process.execPath, "..", "..", "..");
  const name = path.basename(bundle, ".app");
  const helper = path.join(
    bundle,
    "Contents",
    "Frameworks",
    `${name} Helper (Plugin).app`,
    "Contents",
    "MacOS",
    `${name} Helper (Plugin)`,
  );
  return existsSync(helper) ? helper : process.execPath;
}

/** Env overrides for the pi child + in-process SDK: client workspace + app config + tools. */
export function agentEnv(): NodeJS.ProcessEnv {
  const workspace = workspaceDir();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [HOME_ENV]: workspace,
    // Auth/models stay in the app home so provider login survives client switches.
    PI_CODING_AGENT_DIR: appConfigDir(),
  };
  const res = resourceDir();
  const bin = binDir();
  if (existsSync(bin)) env.PATH = `${bin}${path.delimiter}${env.PATH ?? ""}`;
  const tessdata = path.join(res, "tessdata");
  if (existsSync(tessdata)) env.TESSDATA_PREFIX = tessdata;
  return env;
}

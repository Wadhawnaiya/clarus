// Client folder open / switch. One folder per client holds ledger, files,
// sessions, and memory. App-level settings (and provider auth) stay in
// appConfigDir(); this module only moves the active workspace pointer.

import { existsSync, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { type BrowserWindow, dialog, ipcMain } from "electron";
import { setActiveWorkspace, workspaceDir } from "./env";
import { getSettings, recordClientOpened } from "./settings";

export interface OpenClientResult {
  path: string;
}

/** Validate that `dir` exists and is a directory; return its absolute path. */
export function validateClientPath(dir: string): string {
  const absolute = resolve(dir);
  if (!existsSync(absolute)) {
    throw new Error(`Client folder does not exist: ${absolute}`);
  }
  let isDir = false;
  try {
    isDir = statSync(absolute).isDirectory();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot access client folder: ${message}`);
  }
  if (!isDir) {
    throw new Error(`Client path is not a directory: ${absolute}`);
  }
  return absolute;
}

/** Ensure the standard client layout directories exist (ledger/files/sessions/reviews).
 *  Journal/memory templates are filled by the agent extension on session_start
 *  when the folder is empty — we never overwrite existing books. */
export function ensureClientLayout(dir: string): void {
  for (const name of ["ledger", "files", "sessions", "reviews"]) {
    mkdirSync(join(dir, name), { recursive: true });
  }
}

/** Switch to a client folder: validate, layout dirs, persist recents, activate. */
export async function openClientFolder(dir: string): Promise<OpenClientResult> {
  const absolute = validateClientPath(dir);
  ensureClientLayout(absolute);
  setActiveWorkspace(absolute);
  recordClientOpened(absolute);
  return { path: absolute };
}

/** Restore last opened client from settings at app start (if the path still exists). */
export function applySavedWorkspace(): void {
  const last = getSettings().lastClientPath;
  if (!last) return;
  try {
    const absolute = validateClientPath(last);
    setActiveWorkspace(absolute);
  } catch {
    // Stale path — leave default/env workspace; user can re-open from Recents later.
  }
}

/** Register workspace IPC. `restartAgent` respawns the pi child under the new cwd/env. */
export function registerWorkspaceIpc(opts: { restartAgent: () => void; getWindow?: () => BrowserWindow | null }): void {
  ipcMain.handle("workspace_get", () => ({ path: workspaceDir() }));

  ipcMain.handle("workspace_open_path", async (_e, dir: unknown) => {
    if (typeof dir !== "string" || dir.length === 0) {
      throw new Error("Client folder path is required");
    }
    const result = await openClientFolder(dir);
    opts.restartAgent();
    return result;
  });

  ipcMain.handle("workspace_open", async () => {
    const win = opts.getWindow?.() ?? undefined;
    const dialogOpts = {
      title: "Open Client Folder",
      properties: ["openDirectory" as const, "createDirectory" as const],
    };
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, dialogOpts)
      : await dialog.showOpenDialog(dialogOpts);
    if (canceled || !filePaths[0]) return null;
    const result = await openClientFolder(filePaths[0]);
    opts.restartAgent();
    return result;
  });
}

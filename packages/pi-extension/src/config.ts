import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_WORKSPACE_DIR_NAME, HOME_ENV, LEGACY_HOME_ENV } from "./product";

// Resolved at module-eval time. The desktop app sets CLARUS_HOME (or legacy
// CLARUS_HOME) in the sidecar env before spawning pi, so the bundled
// extension picks up the right workspace dir; standalone/dev falls back to
// ~/Clarus.
function resolveHomeFromEnv(): string {
  const preferred = process.env[HOME_ENV];
  if (preferred && preferred.length > 0) return preferred;
  const legacy = process.env[LEGACY_HOME_ENV];
  if (legacy && legacy.length > 0) return legacy;
  return join(homedir(), DEFAULT_WORKSPACE_DIR_NAME);
}

export let CLARUS_HOME = resolveHomeFromEnv();
export let MEMORY_PATH = join(CLARUS_HOME, "memory.md");
export let LEDGER_DIR = join(CLARUS_HOME, "ledger");
export let FILES_DIR = join(CLARUS_HOME, "files");

export function setBaseDir(dir: string): void {
  CLARUS_HOME = dir;
  MEMORY_PATH = join(dir, "memory.md");
  LEDGER_DIR = join(dir, "ledger");
  FILES_DIR = join(dir, "files");
}

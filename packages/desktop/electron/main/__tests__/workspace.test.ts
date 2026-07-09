import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// workspace.ts validates client folders, persists recents, and switches the
// active workspace used by agent/ledger. fs + dialog + agent restart are I/O
// boundaries; path rules and settings merge run for real.

type Handler = (event: unknown, payload?: unknown) => unknown;

const h = vi.hoisted(() => ({
  files: new Map<string, string>(),
  dirs: new Set<string>(),
  handlers: new Map<string, Handler>(),
  setActiveWorkspace: vi.fn(),
  killAgent: vi.fn(),
  showOpenDialog: vi.fn(),
  agentRestart: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: (p: string) => h.files.has(p) || h.dirs.has(p),
  mkdirSync: (p: string) => {
    h.dirs.add(p);
  },
  readFileSync: (p: string) => {
    const content = h.files.get(p);
    if (content === undefined) throw new Error(`ENOENT: ${p}`);
    return content;
  },
  writeFileSync: (p: string, data: string) => {
    h.files.set(p, String(data));
  },
  statSync: (p: string) => {
    if (h.dirs.has(p)) return { isDirectory: () => true, isFile: () => false };
    if (h.files.has(p)) return { isDirectory: () => false, isFile: () => true };
    throw Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
  },
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, fn: Handler) => {
      h.handlers.set(channel, fn);
    },
  },
  dialog: {
    showOpenDialog: (...args: unknown[]) => h.showOpenDialog(...args),
  },
  BrowserWindow: {
    fromWebContents: () => null,
  },
}));
vi.mock("../env", () => ({
  appConfigDir: () => "/app-config",
  workspaceDir: () => "/ws-active",
  setActiveWorkspace: h.setActiveWorkspace,
}));
vi.mock("../agent", () => ({
  killAgent: h.killAgent,
}));

const SETTINGS_PATH = "/app-config/app-settings.json";

async function setup() {
  // settings is loaded by workspace; ensure clean module graph
  const settings = await import("../settings");
  const workspace = await import("../workspace");
  return { ...settings, ...workspace };
}

const invoke = (channel: string, payload?: unknown) => {
  const handler = h.handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return handler(null, payload);
};

beforeEach(() => {
  h.files.clear();
  h.dirs.clear();
  h.handlers.clear();
  h.setActiveWorkspace.mockReset();
  h.killAgent.mockReset();
  h.showOpenDialog.mockReset();
  h.dirs.add("/app-config");
  h.dirs.add("/clients/acme");
  h.dirs.add("/clients/beta");
  h.dirs.add("/ws-active");
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openClientFolder()", () => {
  it("should reject a path that does not exist", async () => {
    const { openClientFolder } = await setup();
    await expect(openClientFolder("/missing")).rejects.toThrow(/does not exist|not found|ENOENT/i);
    expect(h.setActiveWorkspace).not.toHaveBeenCalled();
  });

  it("should reject a path that is a file, not a directory", async () => {
    h.files.set("/clients/acme/notes.txt", "hi");
    const { openClientFolder } = await setup();
    await expect(openClientFolder("/clients/acme/notes.txt")).rejects.toThrow(/directory/i);
    expect(h.setActiveWorkspace).not.toHaveBeenCalled();
  });

  it("should set the active workspace, record recents, and ensure client layout dirs", async () => {
    const { openClientFolder } = await setup();
    const result = await openClientFolder("/clients/acme");

    expect(result.path).toBe("/clients/acme");
    expect(h.setActiveWorkspace).toHaveBeenCalledWith("/clients/acme");
    expect(h.dirs.has("/clients/acme/ledger")).toBe(true);
    expect(h.dirs.has("/clients/acme/files")).toBe(true);
    expect(h.dirs.has("/clients/acme/sessions")).toBe(true);
    expect(JSON.parse(h.files.get(SETTINGS_PATH) ?? "{}")).toMatchObject({
      lastClientPath: "/clients/acme",
      recentClientPaths: ["/clients/acme"],
    });
  });

  it("should not overwrite an existing journal when opening a folder that already has books", async () => {
    h.files.set("/clients/acme/ledger/main.journal", "existing books\n");
    const { openClientFolder } = await setup();
    await openClientFolder("/clients/acme");
    expect(h.files.get("/clients/acme/ledger/main.journal")).toBe("existing books\n");
  });
});

describe("workspace IPC", () => {
  it("should return the active workspace path from workspace_get", async () => {
    const { registerWorkspaceIpc } = await setup();
    registerWorkspaceIpc({ restartAgent: h.agentRestart });
    expect(invoke("workspace_get")).toEqual({ path: "/ws-active" });
  });

  it("should open a path via workspace_open_path, restart agent, and return the path", async () => {
    const { registerWorkspaceIpc } = await setup();
    registerWorkspaceIpc({ restartAgent: h.agentRestart });
    const result = await invoke("workspace_open_path", "/clients/beta");
    expect(result).toMatchObject({ path: "/clients/beta" });
    expect(h.setActiveWorkspace).toHaveBeenCalledWith("/clients/beta");
    expect(h.agentRestart).toHaveBeenCalled();
  });

  it("should open a folder via dialog and return null when cancelled", async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    const { registerWorkspaceIpc } = await setup();
    registerWorkspaceIpc({ restartAgent: h.agentRestart });
    const result = await invoke("workspace_open", {});
    expect(result).toBeNull();
    expect(h.setActiveWorkspace).not.toHaveBeenCalled();
  });

  it("should open the chosen directory from the dialog", async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/clients/acme"] });
    const { registerWorkspaceIpc } = await setup();
    registerWorkspaceIpc({ restartAgent: h.agentRestart });
    const result = await invoke("workspace_open", {});
    expect(result).toMatchObject({ path: "/clients/acme" });
    expect(h.agentRestart).toHaveBeenCalled();
  });
});

describe("applySavedWorkspace()", () => {
  it("should restore lastClientPath into the active workspace when the dir exists", async () => {
    h.files.set(
      SETTINGS_PATH,
      JSON.stringify({ lastClientPath: "/clients/acme", recentClientPaths: ["/clients/acme"] }),
    );
    const { applySavedWorkspace } = await setup();
    applySavedWorkspace();
    expect(h.setActiveWorkspace).toHaveBeenCalledWith("/clients/acme");
  });

  it("should not set active workspace when lastClientPath is missing", async () => {
    const { applySavedWorkspace } = await setup();
    applySavedWorkspace();
    expect(h.setActiveWorkspace).not.toHaveBeenCalled();
  });

  it("should not set active workspace when lastClientPath no longer exists", async () => {
    h.files.set(SETTINGS_PATH, JSON.stringify({ lastClientPath: "/gone" }));
    const { applySavedWorkspace } = await setup();
    applySavedWorkspace();
    expect(h.setActiveWorkspace).not.toHaveBeenCalled();
  });
});

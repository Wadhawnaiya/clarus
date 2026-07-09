import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env.ts resolves resource paths, app config vs client workspace, and agent env.
// The filesystem, Electron's app object, and process.platform/execPath are the
// faked I/O boundaries.

const h = vi.hoisted(() => ({
  existsSync: vi.fn(),
  homedir: vi.fn(() => "/home/user"),
}));

vi.mock("electron", () => ({
  app: { isPackaged: true, getAppPath: () => "/app", resourcesPath: "/app/resources" },
}));
vi.mock("node:fs", () => ({ existsSync: h.existsSync }));
vi.mock("node:os", () => ({ homedir: () => h.homedir() }));

const realPlatform = process.platform;
const realExecPath = process.execPath;
const realEnv = { ...process.env };

function fakeProcess(platform: string, execPath: string) {
  Object.defineProperty(process, "platform", { value: platform });
  process.execPath = execPath;
}

async function loadEnv() {
  return await import("../env");
}

beforeEach(() => {
  vi.resetModules();
  h.existsSync.mockReset();
  h.homedir.mockReturnValue("/home/user");
  // Clear workspace-related env between cases
  delete process.env.CLARUS_HOME;
  delete process.env.ACCOUNTANT24_HOME;
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: realPlatform });
  process.execPath = realExecPath;
  process.env = { ...realEnv };
});

describe("nodeRuntimePath()", () => {
  it("should return the Plugin helper binary when it exists on macOS", async () => {
    fakeProcess("darwin", "/Applications/Clarus.app/Contents/MacOS/Clarus");
    h.existsSync.mockReturnValue(true);
    const { nodeRuntimePath } = await loadEnv();

    expect(nodeRuntimePath()).toBe(
      "/Applications/Clarus.app/Contents/Frameworks/Clarus Helper (Plugin).app/Contents/MacOS/Clarus Helper (Plugin)",
    );
  });

  it("should resolve the dev Electron.app helper from the electron dist binary", async () => {
    fakeProcess("darwin", "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
    h.existsSync.mockReturnValue(true);
    const { nodeRuntimePath } = await loadEnv();

    expect(nodeRuntimePath()).toBe(
      "/repo/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Plugin).app/Contents/MacOS/Electron Helper (Plugin)",
    );
  });

  it("should fall back to process.execPath when the helper binary is missing", async () => {
    fakeProcess("darwin", "/Applications/Clarus.app/Contents/MacOS/Clarus");
    h.existsSync.mockReturnValue(false);
    const { nodeRuntimePath } = await loadEnv();

    expect(nodeRuntimePath()).toBe("/Applications/Clarus.app/Contents/MacOS/Clarus");
  });

  it("should return process.execPath unchanged on non-macOS platforms", async () => {
    fakeProcess("linux", "/usr/lib/clarus/clarus");
    const { nodeRuntimePath } = await loadEnv();

    expect(nodeRuntimePath()).toBe("/usr/lib/clarus/clarus");
    expect(h.existsSync).not.toHaveBeenCalled();
  });
});

describe("appConfigDir() and workspaceDir()", () => {
  it("should resolve app config to ~/Clarus independent of the active client", async () => {
    const { appConfigDir, setActiveWorkspace, workspaceDir } = await loadEnv();
    setActiveWorkspace("/clients/acme");
    expect(appConfigDir()).toBe("/home/user/Clarus");
    expect(workspaceDir()).toBe("/clients/acme");
  });

  it("should default workspace to ~/Clarus when no override and no env", async () => {
    const { workspaceDir } = await loadEnv();
    expect(workspaceDir()).toBe("/home/user/Clarus");
  });

  it("should prefer CLARUS_HOME over the default when no active client is set", async () => {
    process.env.CLARUS_HOME = "/env/client";
    const { workspaceDir } = await loadEnv();
    expect(workspaceDir()).toBe("/env/client");
  });

  it("should prefer the active client over CLARUS_HOME", async () => {
    process.env.CLARUS_HOME = "/env/client";
    const { setActiveWorkspace, workspaceDir } = await loadEnv();
    setActiveWorkspace("/clients/acme");
    expect(workspaceDir()).toBe("/clients/acme");
  });

  it("should clear the active client when setActiveWorkspace(undefined) is called", async () => {
    const { setActiveWorkspace, workspaceDir } = await loadEnv();
    setActiveWorkspace("/clients/acme");
    setActiveWorkspace(undefined);
    expect(workspaceDir()).toBe("/home/user/Clarus");
  });
});

describe("agentEnv()", () => {
  it("should set CLARUS_HOME to the client workspace and PI_CODING_AGENT_DIR to app config", async () => {
    h.existsSync.mockReturnValue(false);
    const prevResources = process.resourcesPath;
    Object.defineProperty(process, "resourcesPath", { value: "/app/resources", configurable: true });
    try {
      const { setActiveWorkspace, agentEnv, appConfigDir } = await loadEnv();
      setActiveWorkspace("/clients/acme");
      const env = agentEnv();
      expect(env.CLARUS_HOME).toBe("/clients/acme");
      expect(env.PI_CODING_AGENT_DIR).toBe(appConfigDir());
      expect(env.PI_CODING_AGENT_DIR).toBe("/home/user/Clarus");
    } finally {
      Object.defineProperty(process, "resourcesPath", { value: prevResources, configurable: true });
    }
  });
});

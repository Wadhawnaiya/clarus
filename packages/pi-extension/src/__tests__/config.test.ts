import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { CLARUS_HOME, LEDGER_DIR, MEMORY_PATH, setBaseDir } from "../config";
import { DEFAULT_WORKSPACE_DIR_NAME } from "../product";

const originalHome = join(homedir(), DEFAULT_WORKSPACE_DIR_NAME);

afterEach(() => {
  setBaseDir(originalHome);
});

describe("default paths", () => {
  test("should set CLARUS_HOME to ~/Clarus", () => {
    setBaseDir(originalHome);
    expect(CLARUS_HOME).toBe(join(homedir(), "Clarus"));
  });

  test("should set MEMORY_PATH to ~/Clarus/memory.md", () => {
    setBaseDir(originalHome);
    expect(MEMORY_PATH).toBe(join(homedir(), "Clarus", "memory.md"));
  });

  test("should set LEDGER_DIR to ~/Clarus/ledger", () => {
    setBaseDir(originalHome);
    expect(LEDGER_DIR).toBe(join(homedir(), "Clarus", "ledger"));
  });
});

describe("setBaseDir()", () => {
  test("should update CLARUS_HOME to given dir", () => {
    setBaseDir("/tmp/test-dir");
    expect(CLARUS_HOME).toBe("/tmp/test-dir");
  });

  test("should update MEMORY_PATH relative to given dir", () => {
    setBaseDir("/tmp/test-dir");
    expect(MEMORY_PATH).toBe("/tmp/test-dir/memory.md");
  });

  test("should update LEDGER_DIR relative to given dir", () => {
    setBaseDir("/tmp/test-dir");
    expect(LEDGER_DIR).toBe("/tmp/test-dir/ledger");
  });
});

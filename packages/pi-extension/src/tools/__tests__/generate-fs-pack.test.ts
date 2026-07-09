import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { spawnText } from "../../spawn";

vi.mock("../../spawn");

const BASE = mkdtempSync(join(tmpdir(), "clarus-fs-tool-"));

vi.mock("../../config.js", () => ({
  CLARUS_HOME: BASE,
  MEMORY_PATH: join(BASE, "memory.md"),
  LEDGER_DIR: join(BASE, "ledger"),
  FILES_DIR: join(BASE, "files"),
  setBaseDir: () => {},
}));

function makeMockProc(exitCode: number, stdout = "", stderr = "") {
  return { exitCode, stdout, stderr };
}

const { generateFsPackTool } = await import("../generate-fs-pack.js");

afterAll(() => rmSync(BASE, { recursive: true, force: true }));

beforeEach(() => {
  rmSync(BASE, { recursive: true, force: true });
  mkdirSync(join(BASE, "ledger"), { recursive: true });
  writeFileSync(join(BASE, "ledger", "main.journal"), "commodity 1,000.00 INR\n", "utf-8");

  vi.mocked(spawnText).mockResolvedValue(
    makeMockProc(0, "            1,000.00 INR  assets:cash\n--------------------\n                      0 INR"),
  );
});

const run = (params: Record<string, unknown>) =>
  generateFsPackTool.execute("test", params as any, undefined, undefined, undefined as any) as Promise<any>;

describe("generateFsPackTool", () => {
  test("should return summary text and details with pack dir", async () => {
    const result = await run({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
      client_name: "Test Client",
    });

    expect(result.content[0].text).toMatch(/FS review pack written/);
    expect(result.details.dir).toContain("FY2025-26");
    expect(result.details.files.length).toBeGreaterThan(0);
  });

  test("should expose generate_fs_pack tool name", () => {
    expect(generateFsPackTool.name).toBe("generate_fs_pack");
  });
});

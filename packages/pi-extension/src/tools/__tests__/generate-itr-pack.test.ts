import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { spawnText } from "../../spawn";

vi.mock("../../spawn");

const BASE = mkdtempSync(join(tmpdir(), "clarus-itr-tool-"));

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

const { generateItrPackTool } = await import("../generate-itr-pack.js");

afterAll(() => rmSync(BASE, { recursive: true, force: true }));

beforeEach(() => {
  rmSync(BASE, { recursive: true, force: true });
  mkdirSync(join(BASE, "ledger"), { recursive: true });
  writeFileSync(join(BASE, "ledger", "main.journal"), "commodity 1,000.00 INR\n", "utf-8");

  vi.mocked(spawnText).mockResolvedValue(
    makeMockProc(0, "           100,000.00 INR  income:sales:taxable\n--------------------\n           100,000.00 INR"),
  );
});

const run = (params: Record<string, unknown>) =>
  generateItrPackTool.execute("test", params as any, undefined, undefined, undefined as any) as Promise<any>;

describe("generateItrPackTool", () => {
  test("should return summary text and details with pack dir", async () => {
    const result = await run({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
      client_name: "Test Client",
      pan: "ABCDE1234F",
    });

    expect(result.content[0].text).toMatch(/ITR review pack written/);
    expect(result.content[0].text).toMatch(/not filed/i);
    expect(result.details.dir).toContain("FY2025-26");
    expect(result.details.dir).toMatch(/itr/);
    expect(result.details.files.length).toBeGreaterThan(0);
  });

  test("should expose generate_itr_pack tool name", () => {
    expect(generateItrPackTool.name).toBe("generate_itr_pack");
  });

  test("should describe pack as draft not e-filing", () => {
    expect(generateItrPackTool.description).toMatch(/not filed/i);
    expect(generateItrPackTool.description.toLowerCase()).toMatch(/manual portal|draft/);
  });
});

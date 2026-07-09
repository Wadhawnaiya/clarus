import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { spawnText } from "../../spawn";

vi.mock("../../spawn");

const BASE = mkdtempSync(join(tmpdir(), "clarus-gstr-tool-"));

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

const { generateGstrPackTool } = await import("../generate-gstr-pack.js");

afterAll(() => rmSync(BASE, { recursive: true, force: true }));

beforeEach(() => {
  rmSync(BASE, { recursive: true, force: true });
  mkdirSync(join(BASE, "ledger"), { recursive: true });
  writeFileSync(join(BASE, "ledger", "main.journal"), "commodity 1,000.00 INR\n", "utf-8");

  vi.mocked(spawnText).mockResolvedValue(
    makeMockProc(
      0,
      "             9,000.00 INR  liabilities:gst:output-cgst\n--------------------\n             9,000.00 INR",
    ),
  );
});

const run = (params: Record<string, unknown>) =>
  generateGstrPackTool.execute("test", params as any, undefined, undefined, undefined as any) as Promise<any>;

describe("generateGstrPackTool", () => {
  test("should return summary text and details with pack dir", async () => {
    const result = await run({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
      client_name: "Test Client",
      gstin: "27AABCU9603R1ZM",
    });

    expect(result.content[0].text).toMatch(/GSTR review pack written/);
    expect(result.content[0].text).toMatch(/not filed/i);
    expect(result.details.dir).toContain("FY2025-26");
    expect(result.details.dir).toMatch(/gstr/);
    expect(result.details.files.length).toBeGreaterThan(0);
  });

  test("should expose generate_gstr_pack tool name", () => {
    expect(generateGstrPackTool.name).toBe("generate_gstr_pack");
  });

  test("should describe pack as draft not portal filing", () => {
    expect(generateGstrPackTool.description).toMatch(/not filed/i);
    expect(generateGstrPackTool.description.toLowerCase()).toMatch(/no portal/);
  });
});

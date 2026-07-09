import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { spawnText } from "../../spawn";

vi.mock("../../spawn");

const BASE = mkdtempSync(join(tmpdir(), "clarus-fs-pack-"));

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

/** Hardcoded fixture report bodies — expected outputs, not re-derived. */
const FIXTURE = {
  tb: "             50,000.00 INR  assets:bank:current\n             25,000.00 INR  assets:cash\n            100,000.00 INR  equity:capital\n             80,000.00 INR  income:sales:taxable\n             55,000.00 INR  expenses:purchases:taxable\n--------------------\n                      0 INR",
  is: "Revenues:\n            80,000.00 INR  income:sales:taxable\n--------------------\n            80,000.00 INR\n\nExpenses:\n            55,000.00 INR  expenses:purchases:taxable\n--------------------\n            55,000.00 INR\n--------------------\n            25,000.00 INR  net:",
  bs: "Assets:\n            50,000.00 INR  assets:bank:current\n            25,000.00 INR  assets:cash\n--------------------\n            75,000.00 INR\n\nLiabilities:\n--------------------\n                      0 INR\n\nEquity:\n           100,000.00 INR  equity:capital\n           -25,000.00 INR  equity:drawings\n--------------------\n            75,000.00 INR\n--------------------\n            75,000.00 INR  net:",
  cf: "Cash flows from operating activities:\n            25,000.00 INR\nCash flows from investing activities:\n                      0 INR\nCash flows from financing activities:\n            50,000.00 INR\n--------------------\n            75,000.00 INR  net:",
  tbCsv: "account,balance\nassets:bank:current,50000.00 INR\nassets:cash,25000.00 INR\nequity:capital,100000.00 INR",
  isCsv: "account,balance\nincome:sales:taxable,80000.00 INR\nexpenses:purchases:taxable,55000.00 INR",
  bsCsv: "account,balance\nassets:bank:current,50000.00 INR\nassets:cash,25000.00 INR\nequity:capital,100000.00 INR",
  cfCsv: "account,balance\noperating,25000.00 INR\nfinancing,50000.00 INR",
};

function seedJournal(): void {
  mkdirSync(join(BASE, "ledger"), { recursive: true });
  writeFileSync(
    join(BASE, "ledger", "main.journal"),
    [
      "commodity 1,000.00 INR",
      "account assets:bank:current",
      "account assets:cash",
      "account equity:capital",
      "account income:sales:taxable",
      "account expenses:purchases:taxable",
      "",
      "2025-04-01 * Opening Balance",
      "    assets:bank:current          50,000.00 INR",
      "    assets:cash                  25,000.00 INR",
      "    equity:capital             -75,000.00 INR",
      "",
      "2025-06-15 * Customer A | Sale",
      "    assets:bank:current          80,000.00 INR",
      "    income:sales:taxable        -80,000.00 INR",
      "",
      "2025-07-01 * Vendor B | Purchase",
      "    expenses:purchases:taxable   55,000.00 INR",
      "    assets:bank:current         -55,000.00 INR",
      "",
    ].join("\n"),
    "utf-8",
  );
}

const { formatFyDir, generateFsPack } = await import("../fs-pack.js");

afterAll(() => {
  rmSync(BASE, { recursive: true, force: true });
});

describe("formatFyDir()", () => {
  test("should prefix FY when given 2025-26", () => {
    expect(formatFyDir("2025-26")).toBe("FY2025-26");
  });

  test("should accept already-prefixed FY2025-26", () => {
    expect(formatFyDir("FY2025-26")).toBe("FY2025-26");
  });

  test("should reject invalid labels", () => {
    expect(() => formatFyDir("2025")).toThrow(/Invalid fy_label/);
    expect(() => formatFyDir("FY25-26")).toThrow(/Invalid fy_label/);
  });
});

describe("generateFsPack()", () => {
  beforeEach(() => {
    rmSync(BASE, { recursive: true, force: true });
    mkdirSync(BASE, { recursive: true });
    seedJournal();

    vi.mocked(spawnText).mockImplementation(async (cmd) => {
      const args = cmd as string[];
      const report = args[1];
      const isCsv = args.includes("csv");

      if (report === "bal") {
        return makeMockProc(0, isCsv ? FIXTURE.tbCsv : FIXTURE.tb);
      }
      if (report === "is") {
        return makeMockProc(0, isCsv ? FIXTURE.isCsv : FIXTURE.is);
      }
      if (report === "bs") {
        return makeMockProc(0, isCsv ? FIXTURE.bsCsv : FIXTURE.bs);
      }
      if (report === "cashflow") {
        return makeMockProc(0, isCsv ? FIXTURE.cfCsv : FIXTURE.cf);
      }
      return makeMockProc(1, "", `unexpected report: ${report}`);
    });
  });

  test("should write pack under reviews/FY2025-26/fs/", async () => {
    const result = await generateFsPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
      client_name: "Acme Traders",
    });

    expect(result.dir).toBe(join("reviews", "FY2025-26", "fs"));
    expect(existsSync(join(BASE, "reviews", "FY2025-26", "fs"))).toBe(true);
  });

  test("should write TB, P&L, BS, CF, notes, and README", async () => {
    const result = await generateFsPack({
      fy_label: "FY2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });

    const names = result.files.map((f) => f.replace(/\\/g, "/"));
    expect(names).toContain("reviews/FY2025-26/fs/trial-balance.md");
    expect(names).toContain("reviews/FY2025-26/fs/profit-and-loss.md");
    expect(names).toContain("reviews/FY2025-26/fs/balance-sheet.md");
    expect(names).toContain("reviews/FY2025-26/fs/cash-flow.md");
    expect(names).toContain("reviews/FY2025-26/fs/notes.md");
    expect(names).toContain("reviews/FY2025-26/fs/README.md");
  });

  test("should embed hardcoded fixture key totals in markdown reports", async () => {
    await generateFsPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });

    const tb = readFileSync(join(BASE, "reviews", "FY2025-26", "fs", "trial-balance.md"), "utf-8");
    expect(tb).toContain("50,000.00 INR  assets:bank:current");
    expect(tb).toContain("80,000.00 INR  income:sales:taxable");
    expect(tb).toContain("55,000.00 INR  expenses:purchases:taxable");
    expect(tb).toContain("Draft for CA review");

    const pl = readFileSync(join(BASE, "reviews", "FY2025-26", "fs", "profit-and-loss.md"), "utf-8");
    expect(pl).toContain("80,000.00 INR  income:sales:taxable");
    expect(pl).toContain("25,000.00 INR  net:");

    const bs = readFileSync(join(BASE, "reviews", "FY2025-26", "fs", "balance-sheet.md"), "utf-8");
    expect(bs).toContain("75,000.00 INR  net:");
    expect(bs).toContain("100,000.00 INR  equity:capital");

    const cf = readFileSync(join(BASE, "reviews", "FY2025-26", "fs", "cash-flow.md"), "utf-8");
    expect(cf).toContain("Cash flows from operating activities:");
    expect(cf).toContain("75,000.00 INR  net:");
  });

  test("should write CSV companions with fixture balances", async () => {
    await generateFsPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });

    const tbCsv = readFileSync(join(BASE, "reviews", "FY2025-26", "fs", "trial-balance.csv"), "utf-8");
    expect(tbCsv).toContain("assets:bank:current,50000.00 INR");
    expect(tbCsv).toContain("equity:capital,100000.00 INR");
  });

  test("should label notes as draft for CA review", async () => {
    await generateFsPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
      client_name: "Acme Traders",
    });

    const notes = readFileSync(join(BASE, "reviews", "FY2025-26", "fs", "notes.md"), "utf-8");
    expect(notes).toContain("Acme Traders");
    expect(notes).toContain("Draft for CA review");
    expect(notes.toLowerCase()).toMatch(/not a filed return/);
  });

  test("should invoke hledger bal, is, bs, cashflow for the period", async () => {
    await generateFsPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });

    const calls = vi.mocked(spawnText).mock.calls.map((c) => (c[0] as string[]).join(" "));
    expect(calls.some((c) => c.includes("bal") && c.includes("-b 2025-04-01") && c.includes("-e 2026-04-01"))).toBe(
      true,
    );
    expect(calls.some((c) => c.startsWith("hledger is "))).toBe(true);
    expect(calls.some((c) => c.startsWith("hledger bs "))).toBe(true);
    expect(calls.some((c) => c.startsWith("hledger cashflow "))).toBe(true);
  });

  test("should reject invalid date order", async () => {
    await expect(
      generateFsPack({
        fy_label: "2025-26",
        begin_date: "2026-04-01",
        end_date: "2025-04-01",
      }),
    ).rejects.toThrow("begin_date must be before end_date");
  });

  test("should reject malformed dates", async () => {
    await expect(
      generateFsPack({
        fy_label: "2025-26",
        begin_date: "01-04-2025",
        end_date: "2026-04-01",
      }),
    ).rejects.toThrow(/begin_date must be YYYY-MM-DD/);
  });

  test("should include pack path in summary", async () => {
    const result = await generateFsPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });
    expect(result.summary).toContain("reviews");
    expect(result.summary).toContain("FY2025-26");
    expect(result.summary).toMatch(/draft for CA review/i);
  });
});

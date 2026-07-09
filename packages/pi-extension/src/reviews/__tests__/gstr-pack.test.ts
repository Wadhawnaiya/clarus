import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { spawnText } from "../../spawn";

vi.mock("../../spawn");

const BASE = mkdtempSync(join(tmpdir(), "clarus-gstr-pack-"));

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

/**
 * Hardcoded fixture report bodies for a known GST books set.
 * Spec totals (not re-derived from code):
 * - Taxable outward supplies: 100,000 INR
 * - Output CGST/SGST: 9,000 each
 * - Taxable inward supplies: 50,000 INR
 * - Input CGST/SGST: 4,500 each
 */
const FIXTURE = {
  sales:
    "           100,000.00 INR  income:sales:taxable\n             5,000.00 INR  income:sales:exempt\n--------------------\n           105,000.00 INR",
  purchases: "            50,000.00 INR  expenses:purchases:taxable\n--------------------\n            50,000.00 INR",
  gstInput:
    "             4,500.00 INR  assets:gst:input-cgst\n             4,500.00 INR  assets:gst:input-sgst\n--------------------\n             9,000.00 INR",
  gstOutput:
    "             9,000.00 INR  liabilities:gst:output-cgst\n             9,000.00 INR  liabilities:gst:output-sgst\n--------------------\n            18,000.00 INR",
  gstPayable: "             9,000.00 INR  liabilities:gst:payable\n--------------------\n             9,000.00 INR",
  salesCsv: "account,balance\nincome:sales:taxable,100000.00 INR\nincome:sales:exempt,5000.00 INR",
  purchasesCsv: "account,balance\nexpenses:purchases:taxable,50000.00 INR",
  gstInputCsv: "account,balance\nassets:gst:input-cgst,4500.00 INR\nassets:gst:input-sgst,4500.00 INR",
  gstOutputCsv: "account,balance\nliabilities:gst:output-cgst,9000.00 INR\nliabilities:gst:output-sgst,9000.00 INR",
  gstPayableCsv: "account,balance\nliabilities:gst:payable,9000.00 INR",
};

function seedJournal(): void {
  mkdirSync(join(BASE, "ledger"), { recursive: true });
  writeFileSync(
    join(BASE, "ledger", "main.journal"),
    [
      "commodity 1,000.00 INR",
      "account assets:bank:current",
      "account assets:gst:input-cgst",
      "account assets:gst:input-sgst",
      "account liabilities:gst:output-cgst",
      "account liabilities:gst:output-sgst",
      "account liabilities:gst:payable",
      "account equity:capital",
      "account income:sales:taxable",
      "account income:sales:exempt",
      "account expenses:purchases:taxable",
      "",
      "2025-04-01 * Opening Balance",
      "    assets:bank:current         100,000.00 INR",
      "    equity:capital             -100,000.00 INR",
      "",
      "2025-05-10 * Customer A | Taxable sale",
      "    assets:bank:current         118,000.00 INR",
      "    income:sales:taxable       -100,000.00 INR",
      "    liabilities:gst:output-cgst  -9,000.00 INR",
      "    liabilities:gst:output-sgst  -9,000.00 INR",
      "",
      "2025-06-01 * Vendor B | Taxable purchase",
      "    expenses:purchases:taxable   50,000.00 INR",
      "    assets:gst:input-cgst         4,500.00 INR",
      "    assets:gst:input-sgst         4,500.00 INR",
      "    assets:bank:current         -59,000.00 INR",
      "",
    ].join("\n"),
    "utf-8",
  );
}

function mockByAccountPattern(args: string[], isCsv: boolean): ReturnType<typeof makeMockProc> {
  const joined = args.join(" ");
  if (joined.includes("income:sales")) {
    return makeMockProc(0, isCsv ? FIXTURE.salesCsv : FIXTURE.sales);
  }
  if (joined.includes("expenses:purchases")) {
    return makeMockProc(0, isCsv ? FIXTURE.purchasesCsv : FIXTURE.purchases);
  }
  if (joined.includes("assets:gst")) {
    return makeMockProc(0, isCsv ? FIXTURE.gstInputCsv : FIXTURE.gstInput);
  }
  if (joined.includes("liabilities:gst:payable")) {
    return makeMockProc(0, isCsv ? FIXTURE.gstPayableCsv : FIXTURE.gstPayable);
  }
  if (joined.includes("liabilities:gst")) {
    return makeMockProc(0, isCsv ? FIXTURE.gstOutputCsv : FIXTURE.gstOutput);
  }
  return makeMockProc(0, isCsv ? "account,balance\n" : "(no results)");
}

const { generateGstrPack } = await import("../gstr-pack.js");

afterAll(() => {
  rmSync(BASE, { recursive: true, force: true });
});

describe("generateGstrPack()", () => {
  beforeEach(() => {
    rmSync(BASE, { recursive: true, force: true });
    mkdirSync(BASE, { recursive: true });
    seedJournal();

    vi.mocked(spawnText).mockImplementation(async (cmd) => {
      const args = cmd as string[];
      const isCsv = args.includes("csv");
      return mockByAccountPattern(args, isCsv);
    });
  });

  test("should write pack under reviews/FY2025-26/gstr/", async () => {
    const result = await generateGstrPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
      client_name: "Acme Traders",
      gstin: "27AABCU9603R1ZM",
    });

    expect(result.dir).toBe(join("reviews", "FY2025-26", "gstr"));
    expect(existsSync(join(BASE, "reviews", "FY2025-26", "gstr"))).toBe(true);
  });

  test("should write GSTR-1, GSTR-3B, books GST, checklist, and README", async () => {
    const result = await generateGstrPack({
      fy_label: "FY2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });

    const names = result.files.map((f) => f.replace(/\\/g, "/"));
    expect(names).toContain("reviews/FY2025-26/gstr/gstr-1-summary.md");
    expect(names).toContain("reviews/FY2025-26/gstr/gstr-3b-summary.md");
    expect(names).toContain("reviews/FY2025-26/gstr/books-gst-ledger.md");
    expect(names).toContain("reviews/FY2025-26/gstr/reconciliation-checklist.md");
    expect(names).toContain("reviews/FY2025-26/gstr/README.md");
  });

  test("should embed hardcoded fixture GST figures in GSTR-1 workpaper", async () => {
    await generateGstrPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });

    const gstr1 = readFileSync(join(BASE, "reviews", "FY2025-26", "gstr", "gstr-1-summary.md"), "utf-8");
    expect(gstr1).toContain("100,000.00 INR  income:sales:taxable");
    expect(gstr1).toContain("5,000.00 INR  income:sales:exempt");
    expect(gstr1).toContain("9,000.00 INR  liabilities:gst:output-cgst");
    expect(gstr1).toContain("9,000.00 INR  liabilities:gst:output-sgst");
    expect(gstr1).toMatch(/draft for review|not filed/i);
    expect(gstr1).toContain("GSTR-1");
  });

  test("should embed hardcoded fixture figures in GSTR-3B workpaper", async () => {
    await generateGstrPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });

    const gstr3b = readFileSync(join(BASE, "reviews", "FY2025-26", "gstr", "gstr-3b-summary.md"), "utf-8");
    expect(gstr3b).toContain("100,000.00 INR  income:sales:taxable");
    expect(gstr3b).toContain("50,000.00 INR  expenses:purchases:taxable");
    expect(gstr3b).toContain("4,500.00 INR  assets:gst:input-cgst");
    expect(gstr3b).toContain("4,500.00 INR  assets:gst:input-sgst");
    expect(gstr3b).toContain("9,000.00 INR  liabilities:gst:payable");
    expect(gstr3b).toContain("GSTR-3B");
    expect(gstr3b).toMatch(/not filed|draft for review/i);
  });

  test("should write CSV companions with fixture balances", async () => {
    await generateGstrPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });

    const salesCsv = readFileSync(join(BASE, "reviews", "FY2025-26", "gstr", "outward-supplies.csv"), "utf-8");
    expect(salesCsv).toContain("income:sales:taxable,100000.00 INR");

    const itcCsv = readFileSync(join(BASE, "reviews", "FY2025-26", "gstr", "itc-input.csv"), "utf-8");
    expect(itcCsv).toContain("assets:gst:input-cgst,4500.00 INR");
  });

  test("should label pack as draft for CA review and not filed", async () => {
    await generateGstrPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
      client_name: "Acme Traders",
      gstin: "27AABCU9603R1ZM",
    });

    const readme = readFileSync(join(BASE, "reviews", "FY2025-26", "gstr", "README.md"), "utf-8");
    expect(readme).toContain("Acme Traders");
    expect(readme).toContain("27AABCU9603R1ZM");
    expect(readme).toMatch(/draft for CA review/i);
    expect(readme).toMatch(/not filed/i);
    expect(readme.toLowerCase()).not.toMatch(/auto-filed|auto filed|portal login/);

    const checklist = readFileSync(join(BASE, "reviews", "FY2025-26", "gstr", "reconciliation-checklist.md"), "utf-8");
    expect(checklist).toContain("Acme Traders");
    expect(checklist).toMatch(/outward supplies/i);
    expect(checklist).toMatch(/ITC/i);
    expect(checklist).toMatch(/not filed|do not file/i);
  });

  test("should query sales, purchases, and GST accounts for the period", async () => {
    await generateGstrPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });

    const calls = vi.mocked(spawnText).mock.calls.map((c) => (c[0] as string[]).join(" "));
    expect(calls.some((c) => c.includes("income:sales") && c.includes("-b 2025-04-01"))).toBe(true);
    expect(calls.some((c) => c.includes("expenses:purchases"))).toBe(true);
    expect(calls.some((c) => c.includes("assets:gst"))).toBe(true);
    expect(calls.some((c) => c.includes("liabilities:gst"))).toBe(true);
  });

  test("should reject invalid date order", async () => {
    await expect(
      generateGstrPack({
        fy_label: "2025-26",
        begin_date: "2026-04-01",
        end_date: "2025-04-01",
      }),
    ).rejects.toThrow("begin_date must be before end_date");
  });

  test("should reject malformed dates", async () => {
    await expect(
      generateGstrPack({
        fy_label: "2025-26",
        begin_date: "01-04-2025",
        end_date: "2026-04-01",
      }),
    ).rejects.toThrow(/begin_date must be YYYY-MM-DD/);
  });

  test("should include pack path and non-filing language in summary", async () => {
    const result = await generateGstrPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });
    expect(result.summary).toContain("reviews");
    expect(result.summary).toContain("FY2025-26");
    expect(result.summary).toMatch(/gstr/i);
    expect(result.summary).toMatch(/draft for CA review/i);
    expect(result.summary).toMatch(/not filed/i);
  });
});

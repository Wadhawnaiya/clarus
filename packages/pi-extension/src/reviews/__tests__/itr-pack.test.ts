import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { spawnText } from "../../spawn";

vi.mock("../../spawn");

const BASE = mkdtempSync(join(tmpdir(), "clarus-itr-pack-"));

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
 * Hardcoded fixture books for ITR pack (spec totals — not re-derived):
 * - Taxable sales: 200,000
 * - Interest: 5,000
 * - Purchases: 80,000
 * - Other expenses: 20,000
 * - Capital: 100,000
 * - Drawings: 10,000
 * → Business receipts (excl interest): 200,000
 * → Business expenses: 100,000
 * → Net business income: 100,000
 */
const FIXTURE = {
  pl: "Revenues:\n           200,000.00 INR  income:sales:taxable\n             5,000.00 INR  income:interest\n--------------------\n           205,000.00 INR\n\nExpenses:\n            80,000.00 INR  expenses:purchases:taxable\n            20,000.00 INR  expenses:rent\n--------------------\n           100,000.00 INR\n--------------------\n           105,000.00 INR  net:",
  bs: "Assets:\n           195,000.00 INR  assets:bank:current\n--------------------\n           195,000.00 INR\n\nEquity:\n           100,000.00 INR  equity:capital\n           -10,000.00 INR  equity:drawings\n--------------------\n            90,000.00 INR\n--------------------\n            90,000.00 INR  net:",
  income:
    "           200,000.00 INR  income:sales:taxable\n             5,000.00 INR  income:interest\n--------------------\n           205,000.00 INR",
  expenses:
    "            80,000.00 INR  expenses:purchases:taxable\n            20,000.00 INR  expenses:rent\n--------------------\n           100,000.00 INR",
  interest: "             5,000.00 INR  income:interest\n--------------------\n             5,000.00 INR",
  equity:
    "           100,000.00 INR  equity:capital\n            10,000.00 INR  equity:drawings\n--------------------\n           110,000.00 INR",
  capital: "           100,000.00 INR  equity:capital\n--------------------\n           100,000.00 INR",
  drawings: "            10,000.00 INR  equity:drawings\n--------------------\n            10,000.00 INR",
  plCsv:
    "account,balance\nincome:sales:taxable,200000.00 INR\nincome:interest,5000.00 INR\nexpenses:purchases:taxable,80000.00 INR\nexpenses:rent,20000.00 INR",
  bsCsv:
    "account,balance\nassets:bank:current,195000.00 INR\nequity:capital,100000.00 INR\nequity:drawings,-10000.00 INR",
  incomeCsv: "account,balance\nincome:sales:taxable,200000.00 INR\nincome:interest,5000.00 INR",
  expensesCsv: "account,balance\nexpenses:purchases:taxable,80000.00 INR\nexpenses:rent,20000.00 INR",
  interestCsv: "account,balance\nincome:interest,5000.00 INR",
  equityCsv: "account,balance\nequity:capital,100000.00 INR\nequity:drawings,10000.00 INR",
  capitalCsv: "account,balance\nequity:capital,100000.00 INR",
  drawingsCsv: "account,balance\nequity:drawings,10000.00 INR",
};

function seedJournal(): void {
  mkdirSync(join(BASE, "ledger"), { recursive: true });
  writeFileSync(
    join(BASE, "ledger", "main.journal"),
    [
      "commodity 1,000.00 INR",
      "account assets:bank:current",
      "account equity:capital",
      "account equity:drawings",
      "account income:sales:taxable",
      "account income:interest",
      "account expenses:purchases:taxable",
      "account expenses:rent",
      "",
      "2025-04-01 * Opening Balance",
      "    assets:bank:current         100,000.00 INR",
      "    equity:capital             -100,000.00 INR",
      "",
    ].join("\n"),
    "utf-8",
  );
}

function seedDocs(): void {
  const dir = join(BASE, "files", "2025", "06");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "AIS_Acme_FY2025-26.pdf"), "%PDF-fake", "utf-8");
  writeFileSync(join(dir, "Form26AS_Acme.pdf"), "%PDF-fake", "utf-8");
  // Form 16 intentionally missing → gap
}

function mockQuery(args: string[], isCsv: boolean): ReturnType<typeof makeMockProc> {
  // spawnText receives ["hledger", report, ...]
  const joined = args.join(" ");
  const report = args[0] === "hledger" ? args[1] : args[0];

  if (report === "is") {
    return makeMockProc(0, isCsv ? FIXTURE.plCsv : FIXTURE.pl);
  }
  if (report === "bs") {
    return makeMockProc(0, isCsv ? FIXTURE.bsCsv : FIXTURE.bs);
  }

  // bal with account patterns — more specific first
  if (joined.includes("income:interest")) {
    return makeMockProc(0, isCsv ? FIXTURE.interestCsv : FIXTURE.interest);
  }
  if (joined.includes("equity:capital")) {
    return makeMockProc(0, isCsv ? FIXTURE.capitalCsv : FIXTURE.capital);
  }
  if (joined.includes("equity:drawings")) {
    return makeMockProc(0, isCsv ? FIXTURE.drawingsCsv : FIXTURE.drawings);
  }
  // "hledger bal -f … equity -b …"
  if (/\bequity\b/.test(joined) && !joined.includes("equity:")) {
    return makeMockProc(0, isCsv ? FIXTURE.equityCsv : FIXTURE.equity);
  }
  if (/\bincome\b/.test(joined) && !joined.includes("income:")) {
    return makeMockProc(0, isCsv ? FIXTURE.incomeCsv : FIXTURE.income);
  }
  if (/\bexpenses\b/.test(joined)) {
    return makeMockProc(0, isCsv ? FIXTURE.expensesCsv : FIXTURE.expenses);
  }

  return makeMockProc(0, isCsv ? "account,balance\n" : "(no results)");
}

const {
  absSumHledgerCsvBalances,
  assessmentYearFromFyLabel,
  buildComputationRows,
  classifyItrDocFilename,
  generateItrPack,
  parseInrAmountToken,
  sumHledgerCsvBalances,
} = await import("../itr-pack.js");

afterAll(() => {
  rmSync(BASE, { recursive: true, force: true });
});

describe("classifyItrDocFilename()", () => {
  test("should classify AIS, 26AS, Form 16, TIS, and ITR JSON names", () => {
    expect(classifyItrDocFilename("AIS_Acme_FY2025-26.pdf")).toBe("ais");
    expect(classifyItrDocFilename("Form26AS_Acme.pdf")).toBe("form26as");
    expect(classifyItrDocFilename("form-16-2025.pdf")).toBe("form16");
    expect(classifyItrDocFilename("TIS_summary.pdf")).toBe("tis");
    expect(classifyItrDocFilename("Form_ITR3_AY2025-26.json")).toBe("itr_json");
    expect(classifyItrDocFilename("random-invoice.pdf")).toBe("other");
  });
});

describe("parseInrAmountToken() / sumHledgerCsvBalances()", () => {
  test("should parse INR amount tokens", () => {
    expect(parseInrAmountToken("200000.00 INR")).toBe(200000);
    expect(parseInrAmountToken("1,00,000.00")).toBe(100000);
    expect(parseInrAmountToken("not-a-number")).toBeNull();
  });

  test("should sum hardcoded CSV balances for income fixture", () => {
    // Spec: 200000 + 5000 = 205000
    expect(sumHledgerCsvBalances(FIXTURE.incomeCsv)).toBe(205000);
    expect(absSumHledgerCsvBalances(FIXTURE.expensesCsv)).toBe(100000);
  });
});

describe("assessmentYearFromFyLabel()", () => {
  test("should map FY 2025-26 to AY 2026-27", () => {
    expect(assessmentYearFromFyLabel("2025-26")).toBe("2026-27");
    expect(assessmentYearFromFyLabel("FY2025-26")).toBe("2026-27");
  });

  test("should reject invalid labels", () => {
    expect(() => assessmentYearFromFyLabel("2025")).toThrow(/Invalid fy_label/);
  });
});

describe("buildComputationRows()", () => {
  test("should return hardcoded net business income from sourced totals", () => {
    const rows = buildComputationRows({
      businessTurnoverAbs: 200_000,
      businessExpenseAbs: 100_000,
      interestIncomeAbs: 5_000,
      capitalAbs: 100_000,
      drawingsAbs: 10_000,
    });

    expect(rows.find((r) => r.head.startsWith("Business / professional receipts"))?.amount).toBe(200_000);
    expect(rows.find((r) => r.head.startsWith("Business / professional expenses"))?.amount).toBe(100_000);
    expect(rows.find((r) => r.head.startsWith("Net business income"))?.amount).toBe(100_000);
    expect(rows.find((r) => r.head.startsWith("Interest income"))?.amount).toBe(5_000);
  });
});

describe("generateItrPack()", () => {
  beforeEach(() => {
    rmSync(BASE, { recursive: true, force: true });
    mkdirSync(BASE, { recursive: true });
    seedJournal();
    seedDocs();

    vi.mocked(spawnText).mockImplementation(async (cmd) => {
      const args = cmd as string[];
      const isCsv = args.includes("csv");
      return mockQuery(args, isCsv);
    });
  });

  test("should write pack under reviews/FY2025-26/itr/", async () => {
    const result = await generateItrPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
      client_name: "Acme Traders",
      pan: "ABCDE1234F",
    });

    expect(result.dir).toBe(join("reviews", "FY2025-26", "itr"));
    expect(existsSync(join(BASE, "reviews", "FY2025-26", "itr"))).toBe(true);
  });

  test("should write computation, books FS, document intake, checklist, and README", async () => {
    const result = await generateItrPack({
      fy_label: "FY2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });

    const names = result.files.map((f) => f.replace(/\\/g, "/"));
    expect(names).toContain("reviews/FY2025-26/itr/computation-of-income.md");
    expect(names).toContain("reviews/FY2025-26/itr/books-fs-extract.md");
    expect(names).toContain("reviews/FY2025-26/itr/document-intake.md");
    expect(names).toContain("reviews/FY2025-26/itr/reconciliation-checklist.md");
    expect(names).toContain("reviews/FY2025-26/itr/README.md");
  });

  test("should embed hardcoded fixture figures in computation workpaper", async () => {
    await generateItrPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });

    const comp = readFileSync(join(BASE, "reviews", "FY2025-26", "itr", "computation-of-income.md"), "utf-8");
    expect(comp).toContain("200,000.00 INR");
    expect(comp).toContain("100,000.00 INR");
    expect(comp).toContain("5,000.00 INR");
    expect(comp).toContain("ITR-3");
    expect(comp).toContain("ITR-4");
    expect(comp).toMatch(/not filed|draft for CA review/i);
  });

  test("should embed P&L and BS fixture extracts", async () => {
    await generateItrPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });

    const books = readFileSync(join(BASE, "reviews", "FY2025-26", "itr", "books-fs-extract.md"), "utf-8");
    expect(books).toContain("200,000.00 INR  income:sales:taxable");
    expect(books).toContain("100,000.00 INR  equity:capital");
    expect(books).toContain("105,000.00 INR  net:");
  });

  test("should list found AIS and 26AS and gap for missing Form 16", async () => {
    const result = await generateItrPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });

    expect(result.documentFindings.some((f) => f.kind === "ais")).toBe(true);
    expect(result.documentFindings.some((f) => f.kind === "form26as")).toBe(true);
    expect(result.gaps.some((g) => /Form 16/i.test(g))).toBe(true);

    const intake = readFileSync(join(BASE, "reviews", "FY2025-26", "itr", "document-intake.md"), "utf-8");
    expect(intake).toContain("AIS_Acme_FY2025-26.pdf");
    expect(intake).toContain("Form26AS_Acme.pdf");
    expect(intake).toMatch(/Form 16 not found/i);
    expect(intake).toMatch(/extract_text/i);
  });

  test("should label pack as draft for CA review and not filed", async () => {
    await generateItrPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
      client_name: "Acme Traders",
      pan: "ABCDE1234F",
    });

    const readme = readFileSync(join(BASE, "reviews", "FY2025-26", "itr", "README.md"), "utf-8");
    expect(readme).toContain("Acme Traders");
    expect(readme).toContain("ABCDE1234F");
    expect(readme).toContain("AY 2026-27");
    expect(readme).toMatch(/draft for CA review/i);
    expect(readme).toMatch(/not filed/i);
    expect(readme.toLowerCase()).toMatch(/manual portal/);
  });

  test("should write income CSV with fixture balances", async () => {
    await generateItrPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });

    const incomeCsv = readFileSync(join(BASE, "reviews", "FY2025-26", "itr", "income.csv"), "utf-8");
    expect(incomeCsv).toContain("income:sales:taxable,200000.00 INR");
    expect(incomeCsv).toContain("income:interest,5000.00 INR");
  });

  test("should reject invalid date order", async () => {
    await expect(
      generateItrPack({
        fy_label: "2025-26",
        begin_date: "2026-04-01",
        end_date: "2025-04-01",
      }),
    ).rejects.toThrow("begin_date must be before end_date");
  });

  test("should include pack path and non-filing language in summary", async () => {
    const result = await generateItrPack({
      fy_label: "2025-26",
      begin_date: "2025-04-01",
      end_date: "2026-04-01",
    });
    expect(result.summary).toContain("reviews");
    expect(result.summary).toContain("FY2025-26");
    expect(result.summary).toMatch(/itr/i);
    expect(result.summary).toMatch(/draft for CA review/i);
    expect(result.summary).toMatch(/not filed/i);
  });
});

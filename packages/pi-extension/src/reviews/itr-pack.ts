import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { CLARUS_HOME, FILES_DIR } from "../config";
import { type QueryLedgerResult, queryLedger } from "../ledger";
import { resolveSafePath } from "../ledger/paths";
import { formatFyDir } from "./fs-pack";

export type ItrFormHint = "ITR-3" | "ITR-4";

export type ItrDocKind = "ais" | "tis" | "form26as" | "form16" | "itr_json" | "other";

export interface GenerateItrPackParams {
  /** Indian financial year label without prefix, e.g. "2025-26". */
  fy_label: string;
  /** Period start inclusive, YYYY-MM-DD (typically 1 April). */
  begin_date: string;
  /** Period end exclusive, YYYY-MM-DD (typically 1 April of next year). */
  end_date: string;
  /** Journal relative to client workspace. Default: ledger/main.journal */
  file?: string;
  /** Optional client/entity display name for pack headers. */
  client_name?: string;
  /** Optional PAN for pack headers (display only — never used for portal auth). */
  pan?: string;
  /**
   * Which ITR form styles to emphasize in workpapers.
   * Default: both ITR-3 and ITR-4 notes (firm common cases).
   */
  itr_forms?: ItrFormHint[];
}

export interface ItrPackReport {
  key: "computation" | "books_fs" | "document_intake" | "checklist" | "readme";
  title: string;
  filename: string;
  command?: string;
  output: string;
}

export interface GenerateItrPackResult {
  /** Relative directory under the client workspace, e.g. reviews/FY2025-26/itr */
  dir: string;
  absoluteDir: string;
  files: string[];
  reports: ItrPackReport[];
  summary: string;
  /** Document kinds detected under files/ */
  documentFindings: ItrDocFinding[];
  /** Gap labels for CA (missing docs, incomplete heads, etc.) */
  gaps: string[];
}

export interface ItrDocFinding {
  kind: ItrDocKind;
  relativePath: string;
  fileName: string;
}

interface LedgerSlice {
  key: string;
  title: string;
  text: string;
  csv: string;
  command: string;
}

const DRAFT_BANNER =
  "**Status:** DRAFT for CA review — **NOT FILED**. Not an e-filed ITR. No portal credentials or auto-filing.";

const DOC_KIND_PATTERNS: Array<{ kind: Exclude<ItrDocKind, "other">; re: RegExp }> = [
  { kind: "ais", re: /(?:^|[^a-z])ais(?:[^a-z]|$)|annual[_\s-]?information/i },
  { kind: "tis", re: /(?:^|[^a-z])tis(?:[^a-z]|$)|taxpayer[_\s-]?information/i },
  { kind: "form26as", re: /26\s*as|form[_\s-]?26/i },
  { kind: "form16", re: /form[_\s-]?16|form16/i },
  { kind: "itr_json", re: /itr[-_]?[34]|form_itr|Form_ITR/i },
];

const REQUIRED_DOC_KINDS: Array<Exclude<ItrDocKind, "other" | "itr_json">> = ["ais", "form26as", "form16"];

function validateDate(label: string, value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD, got "${value}"`);
  }
}

/** Classify a filename into an ITR document kind for intake hooks. */
export function classifyItrDocFilename(fileName: string): ItrDocKind {
  for (const { kind, re } of DOC_KIND_PATTERNS) {
    if (re.test(fileName)) return kind;
  }
  return "other";
}

/**
 * Parse a single amount token from hledger CSV/text (e.g. "100000.00 INR" or "1,00,000.00").
 * Returns absolute rupee amount as number; null if unparseable.
 */
export function parseInrAmountToken(token: string): number | null {
  const cleaned = token.replace(/INR/gi, "").replace(/,/g, "").trim();
  if (!cleaned || cleaned === "0") return cleaned === "0" ? 0 : null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Sum balance column from a simple hledger CSV body:
 * `account,balance` lines like `income:sales:taxable,100000.00 INR`
 * Hardcoded fixture tests pass known CSV and expected totals.
 */
export function sumHledgerCsvBalances(csv: string): number {
  let total = 0;
  for (const line of csv.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /^account\b/i.test(trimmed)) continue;
    const comma = trimmed.lastIndexOf(",");
    if (comma < 0) continue;
    const amount = parseInrAmountToken(trimmed.slice(comma + 1));
    if (amount != null) total += amount;
  }
  return total;
}

/**
 * Prefer absolute values of income (credit) lines for turnover-style totals.
 * For expense CSVs, balances are typically positive debits — use as-is absolute sum.
 */
export function absSumHledgerCsvBalances(csv: string): number {
  return Math.abs(sumHledgerCsvBalances(csv));
}

/** Assessment year label for Indian FY (FY 2025-26 → AY 2026-27). */
export function assessmentYearFromFyLabel(fyLabel: string): string {
  const trimmed = fyLabel.trim().replace(/^FY/i, "");
  const m = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (!m) {
    throw new Error(`Invalid fy_label "${fyLabel}". Expected form like 2025-26 or FY2025-26.`);
  }
  const start = Number(m[1]);
  const endTwo = Number(m[2]);
  // FY 2025-26 → AY 2026-27
  const ayStart = start + 1;
  const ayEndTwo = (endTwo + 1) % 100;
  return `${ayStart}-${String(ayEndTwo).padStart(2, "0")}`;
}

function walkFiles(dir: string, base: string, out: ItrDocFinding[]): void {
  if (!existsSync(dir)) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkFiles(full, base, out);
    } else if (st.isFile()) {
      const kind = classifyItrDocFilename(name);
      if (kind === "other") continue;
      out.push({
        kind,
        relativePath: relative(base, full).split("\\").join("/"),
        fileName: name,
      });
    }
  }
}

/** Scan workspace files/ for AIS / TIS / 26AS / Form 16 / ITR JSON candidates. */
export function scanItrDocuments(filesRoot: string = FILES_DIR, workspaceRoot: string = CLARUS_HOME): ItrDocFinding[] {
  const findings: ItrDocFinding[] = [];
  walkFiles(filesRoot, workspaceRoot, findings);
  findings.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return findings;
}

export function gapsFromDocuments(findings: ItrDocFinding[]): string[] {
  const present = new Set(findings.map((f) => f.kind));
  const gaps: string[] = [];
  for (const kind of REQUIRED_DOC_KINDS) {
    if (!present.has(kind)) {
      const label =
        kind === "ais"
          ? "AIS (Annual Information Statement) not found under files/"
          : kind === "form26as"
            ? "Form 26AS not found under files/"
            : "Form 16 not found under files/ (optional if no salary income)";
      gaps.push(label);
    }
  }
  if (!present.has("tis")) {
    gaps.push("TIS not found under files/ (optional if AIS covers the case)");
  }
  return gaps;
}

async function queryReport(
  file: string,
  report: string,
  begin: string,
  end: string,
  signal?: AbortSignal,
  account_pattern?: string,
): Promise<{ text: QueryLedgerResult; csv: string }> {
  const text = await queryLedger(
    {
      report,
      account_pattern,
      begin_date: begin,
      end_date: end,
      file,
    },
    signal,
  );

  let csv = "";
  try {
    const csvResult = await queryLedger(
      {
        report,
        account_pattern,
        begin_date: begin,
        end_date: end,
        file,
        output_format: "csv",
      },
      signal,
    );
    csv = csvResult.output === "(no results)" ? "" : csvResult.output;
  } catch {
    csv = "";
  }

  return { text, csv };
}

function packHeader(params: GenerateItrPackParams, fyDir: string, ay: string): string[] {
  const forms = (params.itr_forms?.length ? params.itr_forms : (["ITR-3", "ITR-4"] as ItrFormHint[])).join(", ");
  const lines = [
    `**Entity / client:** ${params.client_name?.trim() || "Client"}`,
    `**Period (FY):** ${params.begin_date} to ${params.end_date} (end exclusive) · ${fyDir}`,
    `**Assessment Year (indicative):** AY ${ay}`,
    `**Form styles (v1 workpapers):** ${forms}`,
  ];
  if (params.pan?.trim()) {
    lines.push(`**PAN (display only):** ${params.pan.trim()}`);
  }
  lines.push(DRAFT_BANNER);
  return lines;
}

function sectionBlock(title: string, command: string, body: string): string {
  return [
    `### ${title}`,
    "",
    `**Source command:** \`${command}\``,
    "",
    "```",
    body.trimEnd() || "(no results)",
    "```",
    "",
  ].join("\n");
}

/**
 * Build computation-of-income rows from sourced CSV totals.
 * All numbers must come from ledger extracts — never invented.
 */
export function buildComputationRows(opts: {
  businessTurnoverAbs: number;
  businessExpenseAbs: number;
  interestIncomeAbs: number;
  capitalAbs: number;
  drawingsAbs: number;
}): Array<{ head: string; amount: number; source: string }> {
  const profit = opts.businessTurnoverAbs - opts.businessExpenseAbs;
  return [
    {
      head: "Business / professional receipts (books)",
      amount: opts.businessTurnoverAbs,
      source: "income:* (excl. interest) / P&L",
    },
    {
      head: "Business / professional expenses (books)",
      amount: opts.businessExpenseAbs,
      source: "expenses:* (excl. income-tax)",
    },
    { head: "Net business income (books, before adjustments)", amount: profit, source: "receipts − expenses" },
    { head: "Interest income (books)", amount: opts.interestIncomeAbs, source: "income:interest" },
    { head: "Capital (books, equity:capital)", amount: opts.capitalAbs, source: "equity:capital" },
    { head: "Drawings (books, equity:drawings)", amount: opts.drawingsAbs, source: "equity:drawings" },
  ];
}

function formatInr(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  // Match hledger-style grouping used in embedded report extracts (e.g. 200,000.00).
  const [intPart, dec] = abs.toFixed(2).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}.${dec} INR`;
}

function computationMarkdown(
  params: GenerateItrPackParams,
  fyDir: string,
  ay: string,
  slices: Record<string, LedgerSlice>,
  rows: Array<{ head: string; amount: number; source: string }>,
  gaps: string[],
): string {
  const table = [
    "| Head | Amount (from books) | Source |",
    "| --- | ---: | --- |",
    ...rows.map((r) => `| ${r.head} | ${formatInr(r.amount)} | ${r.source} |`),
  ].join("\n");

  const forms = params.itr_forms?.length ? params.itr_forms : (["ITR-3", "ITR-4"] as ItrFormHint[]);

  return [
    `# Computation of income (books) — ${fyDir}`,
    "",
    ...packHeader(params, fyDir, ay),
    "",
    "Sourced from the client hledger journal for the FY. **Not** a complete tax computation (no slab tax, rebate, or surcharge engine in v1).",
    "",
    "## Sourced figures",
    "",
    table,
    "",
    "## Form mapping notes",
    "",
    forms.includes("ITR-3")
      ? [
          "### ITR-3 style",
          "",
          "- Suitable when the assessee has business/professional income with books of account.",
          "- Map net business income and P&L/BS extracts into ITR-3 schedules (manual portal entry).",
          "- Capital gains, house property, and Chapter VI-A deductions are **gaps** unless documented separately.",
          "",
        ].join("\n")
      : "",
    forms.includes("ITR-4")
      ? [
          "### ITR-4 style (presumptive)",
          "",
          "- Use only if the engagement is under presumptive taxation (e.g. Section 44AD / 44ADA) — **confirm with CA**.",
          "- Books turnover above is a **check figure**; presumptive income % is not applied automatically in v1.",
          "- If books show full P&L but return is ITR-4, flag method mismatch as a review point.",
          "",
        ].join("\n")
      : "",
    "## Ledger extracts used",
    "",
    sectionBlock("Profit & Loss (`is`)", slices.pl.command, slices.pl.text),
    sectionBlock("Income accounts", slices.income.command, slices.income.text),
    sectionBlock("Expense accounts", slices.expenses.command, slices.expenses.text),
    sectionBlock("Interest income", slices.interest.command, slices.interest.text),
    "## Gaps (must not invent)",
    "",
    ...(gaps.length
      ? gaps.map((g) => `- [ ] ${g}`)
      : ["- [x] No automatic document gaps detected (still complete CA review)"]),
    "",
    "- [ ] Capital gains / house property / other sources not fully in books",
    "- [ ] Chapter VI-A deductions (80C, 80D, …) — evidence required",
    "- [ ] Advance tax / self-assessment tax challans vs books",
    "- [ ] TDS credit vs Form 26AS / AIS",
    "",
    "> This file is a **draft review workpaper**, not a filed ITR.",
    "",
  ]
    .filter((s) => s !== "")
    .join("\n");
}

function booksFsMarkdown(
  params: GenerateItrPackParams,
  fyDir: string,
  ay: string,
  slices: Record<string, LedgerSlice>,
): string {
  return [
    `# Books FS extract for ITR — ${fyDir}`,
    "",
    ...packHeader(params, fyDir, ay),
    "",
    "P&L and Balance Sheet extracts from hledger for ITR workpaper cross-reference.",
    "",
    sectionBlock("Profit & Loss (`is`)", slices.pl.command, slices.pl.text),
    sectionBlock("Balance Sheet (`bs`)", slices.bs.command, slices.bs.text),
    sectionBlock("Equity (capital / drawings)", slices.equity.command, slices.equity.text),
  ].join("\n");
}

function documentIntakeMarkdown(
  params: GenerateItrPackParams,
  fyDir: string,
  ay: string,
  findings: ItrDocFinding[],
  gaps: string[],
): string {
  const byKind = (kind: ItrDocKind) => findings.filter((f) => f.kind === kind);

  const listKind = (kind: Exclude<ItrDocKind, "other">, title: string) => {
    const items = byKind(kind);
    if (!items.length) {
      return [`### ${title}`, "", "_None found under `files/`._", ""];
    }
    return [
      `### ${title}`,
      "",
      ...items.map((f) => `- \`${f.relativePath}\``),
      "",
      "Next step: use `extract_text` on each path and reconcile figures into this pack / books. Do not invent amounts from filenames.",
      "",
    ];
  };

  return [
    `# Document intake (AIS / 26AS / Form 16) — ${fyDir}`,
    "",
    ...packHeader(params, fyDir, ay),
    "",
    "Hooks for engagement documents already stored in the client workspace. This pack **lists and classifies** files; full structured extraction remains agent-assisted via `extract_text`.",
    "",
    ...listKind("ais", "AIS"),
    ...listKind("tis", "TIS"),
    ...listKind("form26as", "Form 26AS"),
    ...listKind("form16", "Form 16"),
    ...listKind("itr_json", "ITR JSON / prior-year return data"),
    "## Intake checklist",
    "",
    ...gaps.map((g) => `- [ ] ${g}`),
    findings.length === 0
      ? "- [ ] Upload AIS / Form 26AS / Form 16 (as applicable) into `files/` then re-run `generate_itr_pack`"
      : "- [ ] Extract and tie each found document to computation heads",
    "- [ ] Salary (if any) vs Form 16",
    "- [ ] Interest / dividend / high-value transactions vs AIS",
    "- [ ] TDS credits vs Form 26AS",
    "",
    "> No portal download automation — staff upload documents into the client folder.",
    "",
  ].join("\n");
}

function checklistMarkdown(params: GenerateItrPackParams, fyDir: string, ay: string, gaps: string[]): string {
  const client = params.client_name?.trim() || "Client";
  return [
    `# ITR reconciliation checklist — ${fyDir}`,
    "",
    ...packHeader(params, fyDir, ay),
    "",
    `Client: **${client}**. Filing remains **manual on the income-tax portal**.`,
    "",
    "## Books vs return",
    "",
    "- [ ] P&L turnover and net profit tie to ITR business schedules",
    "- [ ] Balance sheet capital / assets / liabilities consistent with ITR (if applicable)",
    "- [ ] Interest and other income in books vs AIS / 26AS",
    "- [ ] Drawings / capital introductions explained",
    "",
    "## External documents",
    "",
    ...gaps.map((g) => `- [ ] ${g}`),
    "- [ ] Form 16 salary (if salaried component)",
    "- [ ] AIS / TIS high-value mismatches investigated",
    "- [ ] Form 26AS TDS credits claimed correctly",
    "",
    "## Tax computation (CA)",
    "",
    "- [ ] Choose ITR-3 vs ITR-4 (or other) based on law and facts — pack only provides style notes",
    "- [ ] Apply presumptive rates only if elected and eligible",
    "- [ ] Chapter VI-A deductions with proofs",
    "- [ ] Advance tax / self-assessment tax paid",
    "- [ ] Pack labeled draft; **not filed** in any portal",
    "",
    "## Sign-off",
    "",
    "- [ ] Prepared by: _______________ Date: ________",
    "- [ ] Reviewed by CA: _______________ Date: ________",
    "",
    "> Clarus does **not** e-file returns or log into the income-tax portal. This checklist is a workpaper only.",
    "",
  ].join("\n");
}

function indexMarkdown(
  fyDir: string,
  ay: string,
  params: GenerateItrPackParams,
  files: string[],
  gaps: string[],
): string {
  const list = files.map((f) => `- \`${f.split(/[/\\]/).pop()}\``).join("\n");
  const forms = (params.itr_forms?.length ? params.itr_forms : (["ITR-3", "ITR-4"] as ItrFormHint[])).join(", ");
  return [
    `# ITR review pack — ${fyDir}`,
    "",
    `**Client:** ${params.client_name?.trim() || "Client"}`,
    params.pan?.trim() ? `**PAN (display only):** ${params.pan.trim()}` : null,
    `**Period:** ${params.begin_date} to ${params.end_date} (end exclusive)`,
    `**Assessment Year (indicative):** AY ${ay}`,
    `**Form styles:** ${forms}`,
    DRAFT_BANNER,
    "",
    "## Scope (v1)",
    "",
    "- Computation-of-income workpaper from **books** (sourced hledger figures)",
    "- P&L / BS extracts for ITR cross-reference",
    "- Document intake hooks for AIS / TIS / Form 26AS / Form 16 under `files/`",
    "- Reconciliation checklist for CA; **manual portal entry** remains the filing path",
    "- **No** e-filing, portal login, or tax-slab engine",
    "",
    "## Contents",
    "",
    list,
    "",
    "## Gaps called out",
    "",
    ...(gaps.length ? gaps.map((g) => `- ${g}`) : ["- (none from document scan)"]),
    "",
    "All book figures come from the client hledger journal. Treat this pack as a draft for review only.",
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * Query books for the FY and write an ITR review pack under
 * `reviews/FYXXXX-YY/itr/` in the client workspace.
 *
 * v1 forms: ITR-3 and ITR-4 **style workpapers** (not e-filed JSON / not portal filing).
 */
export async function generateItrPack(
  params: GenerateItrPackParams,
  signal?: AbortSignal,
): Promise<GenerateItrPackResult> {
  validateDate("begin_date", params.begin_date);
  validateDate("end_date", params.end_date);
  if (params.begin_date >= params.end_date) {
    throw new Error("begin_date must be before end_date");
  }

  const fyDir = formatFyDir(params.fy_label);
  const ay = assessmentYearFromFyLabel(params.fy_label);
  const relativeDir = join("reviews", fyDir, "itr");
  const absoluteDir = resolveSafePath(relativeDir, CLARUS_HOME);
  mkdirSync(absoluteDir, { recursive: true });

  const file = params.file ?? "ledger/main.journal";
  const begin = params.begin_date;
  const end = params.end_date;

  const reportDefs: Array<{
    key: string;
    title: string;
    report: string;
    account_pattern?: string;
  }> = [
    { key: "pl", title: "Profit & Loss", report: "is" },
    { key: "bs", title: "Balance Sheet", report: "bs" },
    { key: "income", title: "Income", report: "bal", account_pattern: "income" },
    { key: "expenses", title: "Expenses", report: "bal", account_pattern: "expenses" },
    { key: "interest", title: "Interest income", report: "bal", account_pattern: "income:interest" },
    { key: "equity", title: "Equity", report: "bal", account_pattern: "equity" },
    { key: "capital", title: "Capital", report: "bal", account_pattern: "equity:capital" },
    { key: "drawings", title: "Drawings", report: "bal", account_pattern: "equity:drawings" },
  ];

  const slices: Record<string, LedgerSlice> = {};
  for (const def of reportDefs) {
    const { text, csv } = await queryReport(file, def.report, begin, end, signal, def.account_pattern);
    slices[def.key] = {
      key: def.key,
      title: def.title,
      text: text.output,
      csv,
      command: text.command,
    };
  }

  // Business receipts ≈ income excluding interest; expenses ≈ expenses (books)
  const incomeTotal = absSumHledgerCsvBalances(slices.income.csv);
  const interestTotal = absSumHledgerCsvBalances(slices.interest.csv);
  const businessTurnoverAbs = Math.max(0, incomeTotal - interestTotal);
  const businessExpenseAbs = absSumHledgerCsvBalances(slices.expenses.csv);
  const capitalAbs = absSumHledgerCsvBalances(slices.capital.csv);
  const drawingsAbs = absSumHledgerCsvBalances(slices.drawings.csv);

  const rows = buildComputationRows({
    businessTurnoverAbs,
    businessExpenseAbs,
    interestIncomeAbs: interestTotal,
    capitalAbs,
    drawingsAbs,
  });

  const documentFindings = scanItrDocuments();
  const gaps = gapsFromDocuments(documentFindings);

  // Call out empty books
  if (businessTurnoverAbs === 0 && businessExpenseAbs === 0) {
    gaps.unshift("Books show no income/expense activity for the period — confirm journal completeness");
  }

  const files: string[] = [];
  const reports: ItrPackReport[] = [];

  const write = (filename: string, body: string, report?: Omit<ItrPackReport, "output">) => {
    writeFileSync(join(absoluteDir, filename), body, "utf-8");
    const rel = join(relativeDir, filename);
    files.push(rel);
    if (report) {
      reports.push({ ...report, output: body });
    }
  };

  write("computation-of-income.md", computationMarkdown(params, fyDir, ay, slices, rows, gaps), {
    key: "computation",
    title: "Computation of income",
    filename: "computation-of-income.md",
    command: slices.pl.command,
  });

  write("books-fs-extract.md", booksFsMarkdown(params, fyDir, ay, slices), {
    key: "books_fs",
    title: "Books FS extract",
    filename: "books-fs-extract.md",
    command: slices.bs.command,
  });

  write("document-intake.md", documentIntakeMarkdown(params, fyDir, ay, documentFindings, gaps), {
    key: "document_intake",
    title: "Document intake",
    filename: "document-intake.md",
  });

  write("reconciliation-checklist.md", checklistMarkdown(params, fyDir, ay, gaps), {
    key: "checklist",
    title: "Reconciliation checklist",
    filename: "reconciliation-checklist.md",
  });

  const csvSpecs: Array<{ filename: string; csv: string }> = [
    { filename: "income.csv", csv: slices.income.csv },
    { filename: "expenses.csv", csv: slices.expenses.csv },
    { filename: "profit-and-loss.csv", csv: slices.pl.csv },
    { filename: "balance-sheet.csv", csv: slices.bs.csv },
  ];
  for (const spec of csvSpecs) {
    if (spec.csv) {
      writeFileSync(join(absoluteDir, spec.filename), spec.csv, "utf-8");
      files.push(join(relativeDir, spec.filename));
    }
  }

  const index = indexMarkdown(fyDir, ay, params, files, gaps);
  write("README.md", index, {
    key: "readme",
    title: "ITR review pack index",
    filename: "README.md",
  });

  const summary = [
    `ITR review pack written to ${relativeDir}/`,
    `Period ${params.begin_date} → ${params.end_date} (end exclusive); AY ${ay}.`,
    `Form styles: ${(params.itr_forms?.length ? params.itr_forms : ["ITR-3", "ITR-4"]).join(", ")}.`,
    `Files: ${files.map((f) => f.split(/[/\\]/).pop()).join(", ")}.`,
    gaps.length ? `Gaps: ${gaps.length} item(s) called out.` : "No document gaps from scan.",
    "Status: draft for CA review — not filed. Manual portal entry only.",
  ].join(" ");

  return {
    dir: relativeDir,
    absoluteDir,
    files,
    reports,
    summary,
    documentFindings,
    gaps,
  };
}

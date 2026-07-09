import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLARUS_HOME } from "../config";
import { type QueryLedgerResult, queryLedger } from "../ledger";
import { resolveSafePath } from "../ledger/paths";
import { formatFyDir } from "./fs-pack";

export interface GenerateGstrPackParams {
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
  /** Optional GSTIN for pack headers (display only — never used for portal auth). */
  gstin?: string;
}

export interface GstrPackReport {
  key: "gstr1" | "gstr3b" | "books_gst" | "checklist" | "readme";
  title: string;
  filename: string;
  command?: string;
  output: string;
}

export interface GenerateGstrPackResult {
  /** Relative directory under the client workspace, e.g. reviews/FY2025-26/gstr */
  dir: string;
  /** Absolute directory written */
  absoluteDir: string;
  /** Relative file paths written */
  files: string[];
  reports: GstrPackReport[];
  /** Short summary for the agent UI */
  summary: string;
}

interface LedgerSlice {
  key: string;
  title: string;
  account_pattern: string;
  text: string;
  csv: string;
  command: string;
}

const DRAFT_BANNER =
  "**Status:** DRAFT for CA review — **NOT FILED**. Not a GST portal return. No portal credentials or auto-filing.";

function validateDate(label: string, value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD, got "${value}"`);
  }
}

async function querySlice(
  file: string,
  account_pattern: string,
  begin: string,
  end: string,
  signal?: AbortSignal,
): Promise<{ text: QueryLedgerResult; csv: string }> {
  const text = await queryLedger(
    {
      report: "bal",
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
        report: "bal",
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

function packHeader(params: GenerateGstrPackParams, fyDir: string): string[] {
  const lines = [
    `**Entity / client:** ${params.client_name?.trim() || "Client"}`,
    `**Period:** ${params.begin_date} to ${params.end_date} (end exclusive) · ${fyDir}`,
  ];
  if (params.gstin?.trim()) {
    lines.push(`**GSTIN (display only):** ${params.gstin.trim()}`);
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

function gstr1Markdown(params: GenerateGstrPackParams, fyDir: string, slices: Record<string, LedgerSlice>): string {
  return [
    `# GSTR-1 style summary — ${fyDir}`,
    "",
    ...packHeader(params, fyDir),
    "",
    "Workpaper maps **books** outward supplies and output tax to GSTR-1 review sections.",
    "Invoice-level B2B/B2C tables are out of scope for v1; use portal extracts / invoice files for line detail.",
    "",
    "## 1. Outward supplies (from books)",
    "",
    sectionBlock("Sales / outward turnover (income:sales*)", slices.sales.command, slices.sales.text),
    "## 2. Output tax (from books)",
    "",
    sectionBlock("GST output liabilities (liabilities:gst*)", slices.gstOutput.command, slices.gstOutput.text),
    "## 3. Open items for GSTR-1",
    "",
    "- [ ] Map invoice register / e-invoice data to GSTR-1 tables (B2B, B2C, exports, credit notes)",
    "- [ ] Reconcile books outward taxable + exempt + exports to GSTR-1 portal extract",
    "- [ ] Confirm place-of-supply / inter-state vs intra-state split (IGST vs CGST+SGST)",
    "- [ ] CA sign-off before any portal entry",
    "",
    "> This file is a **draft review workpaper**, not a filed GSTR-1.",
    "",
  ].join("\n");
}

function gstr3bMarkdown(params: GenerateGstrPackParams, fyDir: string, slices: Record<string, LedgerSlice>): string {
  return [
    `# GSTR-3B style summary — ${fyDir}`,
    "",
    ...packHeader(params, fyDir),
    "",
    "Workpaper maps **books** to GSTR-3B-style review blocks (outward, inward/ITC, tax payable).",
    "Figures are ledger balances for the period — not a portal JSON or filed return.",
    "",
    "## 3.1 Outward taxable supplies & output tax",
    "",
    sectionBlock("Outward supplies (income:sales*)", slices.sales.command, slices.sales.text),
    sectionBlock("Output tax (liabilities:gst*)", slices.gstOutput.command, slices.gstOutput.text),
    "## 3.2 Inward supplies & ITC (eligible input tax — books)",
    "",
    sectionBlock("Purchases / inward (expenses:purchases*)", slices.purchases.command, slices.purchases.text),
    sectionBlock("GST input (assets:gst*)", slices.gstInput.command, slices.gstInput.text),
    "## 3.3 Net GST payable (books)",
    "",
    sectionBlock("GST payable (liabilities:gst:payable)", slices.gstPayable.command, slices.gstPayable.text),
    "## 3.4 Open items for GSTR-3B",
    "",
    "- [ ] Reconcile output tax vs GSTR-1 / GSTR-3B portal draft",
    "- [ ] Reconcile ITC in books vs GSTR-2B / portal ITC available",
    "- [ ] Confirm reverse charge, exempt, nil-rated, and non-GST supply treatment",
    "- [ ] Confirm tax payment challans vs liabilities:gst:payable",
    "- [ ] CA sign-off before any portal entry — **do not treat this pack as filed**",
    "",
    "> This file is a **draft review workpaper**, not a filed GSTR-3B.",
    "",
  ].join("\n");
}

function booksGstMarkdown(params: GenerateGstrPackParams, fyDir: string, slices: Record<string, LedgerSlice>): string {
  return [
    `# Books GST ledger extract — ${fyDir}`,
    "",
    ...packHeader(params, fyDir),
    "",
    "Raw hledger balances for GST-related accounts used by the GSTR review pack.",
    "",
    sectionBlock("Input tax credit (assets:gst*)", slices.gstInput.command, slices.gstInput.text),
    sectionBlock("Output tax (liabilities:gst*)", slices.gstOutput.command, slices.gstOutput.text),
    sectionBlock("GST payable", slices.gstPayable.command, slices.gstPayable.text),
    sectionBlock("Sales (income:sales*)", slices.sales.command, slices.sales.text),
    sectionBlock("Purchases (expenses:purchases*)", slices.purchases.command, slices.purchases.text),
  ].join("\n");
}

function checklistMarkdown(params: GenerateGstrPackParams, fyDir: string): string {
  const client = params.client_name?.trim() || "Client";
  return [
    `# GSTR reconciliation checklist — ${fyDir}`,
    "",
    ...packHeader(params, fyDir),
    "",
    `Client: **${client}**. Use this list during CA review. Filing remains **manual on the GST portal**.`,
    "",
    "## Outward supplies vs books",
    "",
    "- [ ] Books taxable outward (income:sales:taxable / exports) tie to GSTR-1 portal extract",
    "- [ ] Exempt / nil-rated / non-GST outward supplies identified and excluded correctly",
    "- [ ] Credit/debit notes reflected in both books and return draft",
    "- [ ] Output CGST/SGST/IGST in books vs tax tables on GSTR-1 / 3B",
    "",
    "## ITC vs books",
    "",
    "- [ ] Input CGST/SGST/IGST in books vs GSTR-2B / portal ITC available",
    "- [ ] Ineligible ITC reversed or never claimed",
    "- [ ] Reverse charge liability and corresponding ITC (if any) reviewed",
    "",
    "## Payments and status",
    "",
    "- [ ] liabilities:gst:payable ties to payment challans / cash ledger",
    "- [ ] No period left with unexplained GST residual",
    "- [ ] Pack labeled draft; **not filed** in any portal",
    "",
    "## Document intake (optional)",
    "",
    "- [ ] Portal GSTR-1 / 3B extracts uploaded under `files/` if reconciling to portal",
    "- [ ] Sample invoices checked for HSN, GSTIN, and tax rates",
    "",
    "## Sign-off",
    "",
    "- [ ] Prepared by: _______________ Date: ________",
    "- [ ] Reviewed by CA: _______________ Date: ________",
    "",
    "> Clarus does **not** file returns or log into the GST portal. This checklist is a workpaper only.",
    "",
  ].join("\n");
}

function indexMarkdown(fyDir: string, params: GenerateGstrPackParams, files: string[]): string {
  const list = files.map((f) => `- \`${f.split(/[/\\]/).pop()}\``).join("\n");
  return [
    `# GSTR review pack — ${fyDir}`,
    "",
    `**Client:** ${params.client_name?.trim() || "Client"}`,
    params.gstin?.trim() ? `**GSTIN (display only):** ${params.gstin.trim()}` : null,
    `**Period:** ${params.begin_date} to ${params.end_date} (end exclusive)`,
    DRAFT_BANNER,
    "",
    "## Scope (v1)",
    "",
    "- GSTR-1 **style** outward supplies / output tax summary from books",
    "- GSTR-3B **style** outward, ITC, and payable summary from books",
    "- Books GST ledger extract + reconciliation checklist for CA",
    "- **No** portal automation, credentials, or auto-filing",
    "",
    "## Contents",
    "",
    list,
    "",
    "All figures come from the client hledger journal for the period. Treat this pack as a draft for review only.",
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * Query GST-related ledger balances and write a GSTR review pack under
 * `reviews/FYXXXX-YY/gstr/` in the client workspace.
 *
 * v1 forms: GSTR-1 and GSTR-3B **style workpapers** (not portal JSON / not filed).
 */
export async function generateGstrPack(
  params: GenerateGstrPackParams,
  signal?: AbortSignal,
): Promise<GenerateGstrPackResult> {
  validateDate("begin_date", params.begin_date);
  validateDate("end_date", params.end_date);
  if (params.begin_date >= params.end_date) {
    throw new Error("begin_date must be before end_date");
  }

  const fyDir = formatFyDir(params.fy_label);
  const relativeDir = join("reviews", fyDir, "gstr");
  const absoluteDir = resolveSafePath(relativeDir, CLARUS_HOME);
  mkdirSync(absoluteDir, { recursive: true });

  const file = params.file ?? "ledger/main.journal";
  const begin = params.begin_date;
  const end = params.end_date;

  const sliceDefs: Array<{ key: string; title: string; account_pattern: string }> = [
    { key: "sales", title: "Outward supplies", account_pattern: "income:sales" },
    { key: "purchases", title: "Inward supplies", account_pattern: "expenses:purchases" },
    { key: "gstInput", title: "GST input (ITC)", account_pattern: "assets:gst" },
    { key: "gstOutput", title: "GST output", account_pattern: "liabilities:gst:output" },
    { key: "gstPayable", title: "GST payable", account_pattern: "liabilities:gst:payable" },
  ];

  const slices: Record<string, LedgerSlice> = {};
  for (const def of sliceDefs) {
    const { text, csv } = await querySlice(file, def.account_pattern, begin, end, signal);
    slices[def.key] = {
      key: def.key,
      title: def.title,
      account_pattern: def.account_pattern,
      text: text.output,
      csv,
      command: text.command,
    };
  }

  const files: string[] = [];
  const reports: GstrPackReport[] = [];

  const write = (filename: string, body: string, report?: Omit<GstrPackReport, "output">) => {
    writeFileSync(join(absoluteDir, filename), body, "utf-8");
    const rel = join(relativeDir, filename);
    files.push(rel);
    if (report) {
      reports.push({ ...report, output: body });
    }
  };

  write("gstr-1-summary.md", gstr1Markdown(params, fyDir, slices), {
    key: "gstr1",
    title: "GSTR-1 style summary",
    filename: "gstr-1-summary.md",
    command: slices.sales.command,
  });

  write("gstr-3b-summary.md", gstr3bMarkdown(params, fyDir, slices), {
    key: "gstr3b",
    title: "GSTR-3B style summary",
    filename: "gstr-3b-summary.md",
    command: slices.gstPayable.command,
  });

  write("books-gst-ledger.md", booksGstMarkdown(params, fyDir, slices), {
    key: "books_gst",
    title: "Books GST ledger extract",
    filename: "books-gst-ledger.md",
  });

  write("reconciliation-checklist.md", checklistMarkdown(params, fyDir), {
    key: "checklist",
    title: "Reconciliation checklist",
    filename: "reconciliation-checklist.md",
  });

  // CSV companions (best-effort structured extracts)
  const csvSpecs: Array<{ filename: string; csv: string }> = [
    { filename: "outward-supplies.csv", csv: slices.sales.csv },
    { filename: "inward-supplies.csv", csv: slices.purchases.csv },
    { filename: "itc-input.csv", csv: slices.gstInput.csv },
    { filename: "output-tax.csv", csv: slices.gstOutput.csv },
    { filename: "gst-payable.csv", csv: slices.gstPayable.csv },
  ];
  for (const spec of csvSpecs) {
    if (spec.csv) {
      writeFileSync(join(absoluteDir, spec.filename), spec.csv, "utf-8");
      files.push(join(relativeDir, spec.filename));
    }
  }

  const index = indexMarkdown(fyDir, params, files);
  write("README.md", index, {
    key: "readme",
    title: "GSTR review pack index",
    filename: "README.md",
  });

  const summary = [
    `GSTR review pack written to ${relativeDir}/`,
    `Period ${params.begin_date} → ${params.end_date} (end exclusive).`,
    `Forms: GSTR-1 + GSTR-3B style workpapers from books.`,
    `Files: ${files.map((f) => f.split(/[/\\]/).pop()).join(", ")}.`,
    "Status: draft for CA review — not filed. No portal automation.",
  ].join(" ");

  return {
    dir: relativeDir,
    absoluteDir,
    files,
    reports,
    summary,
  };
}

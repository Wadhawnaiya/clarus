import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLARUS_HOME } from "../config";
import { type QueryLedgerResult, queryLedger } from "../ledger";
import { resolveSafePath } from "../ledger/paths";

export interface GenerateFsPackParams {
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
}

export interface FsPackReport {
  key: "tb" | "is" | "bs" | "cf" | "notes";
  title: string;
  filename: string;
  command?: string;
  output: string;
}

export interface GenerateFsPackResult {
  /** Relative directory under the client workspace, e.g. reviews/FY2025-26/fs */
  dir: string;
  /** Absolute directory written */
  absoluteDir: string;
  /** Relative file paths written */
  files: string[];
  reports: FsPackReport[];
  /** Short summary for the agent UI */
  summary: string;
}

const REPORT_SPECS: Array<{
  key: "tb" | "is" | "bs" | "cf";
  title: string;
  filename: string;
  report: string;
  csvFilename: string;
}> = [
  {
    key: "tb",
    title: "Trial Balance",
    filename: "trial-balance.md",
    report: "tb",
    csvFilename: "trial-balance.csv",
  },
  {
    key: "is",
    title: "Profit & Loss",
    filename: "profit-and-loss.md",
    report: "is",
    csvFilename: "profit-and-loss.csv",
  },
  {
    key: "bs",
    title: "Balance Sheet",
    filename: "balance-sheet.md",
    report: "bs",
    csvFilename: "balance-sheet.csv",
  },
  {
    key: "cf",
    title: "Cash Flow",
    filename: "cash-flow.md",
    report: "cf",
    csvFilename: "cash-flow.csv",
  },
];

/** Normalize FY label to path segment like FY2025-26. */
export function formatFyDir(fyLabel: string): string {
  const trimmed = fyLabel.trim().replace(/^FY/i, "");
  if (!/^\d{4}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid fy_label "${fyLabel}". Expected form like 2025-26 or FY2025-26.`);
  }
  return `FY${trimmed}`;
}

function validateDate(label: string, value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD, got "${value}"`);
  }
}

function notesStub(params: GenerateFsPackParams, fyDir: string): string {
  const client = params.client_name?.trim() || "Client";
  return [
    `# Notes & schedules — ${fyDir}`,
    "",
    `**Entity / client:** ${client}`,
    `**Period:** ${params.begin_date} to ${params.end_date} (end exclusive)`,
    `**Status:** Draft for CA review — not a filed return or audited set of accounts.`,
    "",
    "## Scope (v1)",
    "",
    "Numbers in this pack come from hledger reports on the client journal.",
    "Presentation is review-oriented (not full MCA Schedule III automation).",
    "",
    "## Open items for CA",
    "",
    "- [ ] Confirm entity type and CoA completeness",
    "- [ ] Review GST input/output balances vs returns workpapers",
    "- [ ] Confirm depreciation, provisions, and year-end adjustments",
    "- [ ] Tie cash / bank to statements",
    "- [ ] Sign-off before any portal filing or third-party use",
    "",
    "## Schedules (stubs)",
    "",
    "Add supporting schedules under this pack as needed (debtors, creditors, fixed assets).",
    "",
  ].join("\n");
}

function reportMarkdown(opts: {
  title: string;
  fyDir: string;
  begin: string;
  end: string;
  command: string;
  body: string;
}): string {
  return [
    `# ${opts.title} — ${opts.fyDir}`,
    "",
    `**Period:** ${opts.begin} to ${opts.end} (end exclusive)`,
    `**Source command:** \`${opts.command}\``,
    `**Status:** Draft for CA review`,
    "",
    "```",
    opts.body.trimEnd(),
    "```",
    "",
  ].join("\n");
}

function indexMarkdown(fyDir: string, params: GenerateFsPackParams, files: string[]): string {
  const list = files.map((f) => `- \`${f.split("/").pop()}\``).join("\n");
  return [
    `# Financial statements review pack — ${fyDir}`,
    "",
    `**Client:** ${params.client_name?.trim() || "Client"}`,
    `**Period:** ${params.begin_date} to ${params.end_date} (end exclusive)`,
    `**Generated for:** CA review (not auto-filed)`,
    "",
    "## Contents",
    "",
    list,
    "",
    "All figures are produced from the client hledger journal. Do not treat this pack as a filed return.",
    "",
  ].join("\n");
}

/**
 * Run hledger TB / P&L / BS / CF for the period and write a review pack under
 * `reviews/FYXXXX-YY/fs/` in the client workspace.
 */
export async function generateFsPack(
  params: GenerateFsPackParams,
  signal?: AbortSignal,
): Promise<GenerateFsPackResult> {
  validateDate("begin_date", params.begin_date);
  validateDate("end_date", params.end_date);
  if (params.begin_date >= params.end_date) {
    throw new Error("begin_date must be before end_date");
  }

  const fyDir = formatFyDir(params.fy_label);
  const relativeDir = join("reviews", fyDir, "fs");
  const absoluteDir = resolveSafePath(relativeDir, CLARUS_HOME);
  mkdirSync(absoluteDir, { recursive: true });

  const file = params.file ?? "ledger/main.journal";
  const reports: FsPackReport[] = [];
  const files: string[] = [];

  for (const spec of REPORT_SPECS) {
    const txt: QueryLedgerResult = await queryLedger(
      {
        report: spec.report,
        begin_date: params.begin_date,
        end_date: params.end_date,
        file,
      },
      signal,
    );

    let csvBody = "";
    try {
      const csv: QueryLedgerResult = await queryLedger(
        {
          report: spec.report,
          begin_date: params.begin_date,
          end_date: params.end_date,
          file,
          output_format: "csv",
        },
        signal,
      );
      csvBody = csv.output === "(no results)" ? "" : csv.output;
    } catch {
      // CSV is best-effort; text report is required.
      csvBody = "";
    }

    const md = reportMarkdown({
      title: spec.title,
      fyDir,
      begin: params.begin_date,
      end: params.end_date,
      command: txt.command,
      body: txt.output,
    });

    const mdRel = join(relativeDir, spec.filename);
    writeFileSync(join(absoluteDir, spec.filename), md, "utf-8");
    files.push(mdRel);

    if (csvBody) {
      const csvRel = join(relativeDir, spec.csvFilename);
      writeFileSync(join(absoluteDir, spec.csvFilename), csvBody, "utf-8");
      files.push(csvRel);
    }

    reports.push({
      key: spec.key,
      title: spec.title,
      filename: spec.filename,
      command: txt.command,
      output: txt.output,
    });
  }

  const notes = notesStub(params, fyDir);
  writeFileSync(join(absoluteDir, "notes.md"), notes, "utf-8");
  files.push(join(relativeDir, "notes.md"));
  reports.push({
    key: "notes",
    title: "Notes & schedules",
    filename: "notes.md",
    output: notes,
  });

  const index = indexMarkdown(fyDir, params, files);
  writeFileSync(join(absoluteDir, "README.md"), index, "utf-8");
  files.push(join(relativeDir, "README.md"));

  const summary = [
    `FS review pack written to ${relativeDir}/`,
    `Period ${params.begin_date} → ${params.end_date} (end exclusive).`,
    `Files: ${files.map((f) => f.split(/[/\\]/).pop()).join(", ")}.`,
    "Status: draft for CA review — not a filed return.",
  ].join(" ");

  return {
    dir: relativeDir,
    absoluteDir,
    files,
    reports,
    summary,
  };
}

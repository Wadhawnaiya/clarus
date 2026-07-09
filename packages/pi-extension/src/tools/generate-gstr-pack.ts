import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type GenerateGstrPackResult, generateGstrPack } from "../reviews/gstr-pack";

const Params = Type.Object({
  fy_label: Type.String({
    description: 'Indian financial year label, e.g. "2025-26" or "FY2025-26"',
  }),
  begin_date: Type.String({
    description: "Period start inclusive, YYYY-MM-DD (typically 1 April of FY start year)",
  }),
  end_date: Type.String({
    description: "Period end exclusive, YYYY-MM-DD (typically 1 April of FY end year)",
  }),
  file: Type.Optional(
    Type.String({ description: "Journal file relative to the client workspace (default: ledger/main.journal)" }),
  ),
  client_name: Type.Optional(Type.String({ description: "Client / entity name for pack headers" })),
  gstin: Type.Optional(
    Type.String({
      description: "GSTIN for pack headers only (display). Never used for portal login or filing.",
    }),
  ),
});

const LABEL = "Generate GSTR Pack";

export const generateGstrPackTool: ToolDefinition<typeof Params, GenerateGstrPackResult> = {
  name: "generate_gstr_pack",
  label: LABEL,
  description:
    "Generate a GSTR review pack (GSTR-1 and GSTR-3B style workpapers from books, GST ledger extract, reconciliation checklist) under reviews/FY…/gstr/ for CA review. Draft only — not filed; no portal automation.",
  promptSnippet: "Generate GSTR review pack (GSTR-1 + 3B style) under reviews/FY…/gstr/",
  promptGuidelines: [
    "Use generate_gstr_pack when the user asks to prepare GSTR, GST return workpapers, GSTR-1/3B review packs, or GST reconciliation for a financial year.",
    "Always state that the pack is a draft for CA review and is not filed. Never claim portal filing or offer portal login automation.",
    "Prefer Indian FY dates: begin 1 April of start year, end 1 April of next year (end exclusive).",
    "If the user provides a GSTIN, pass it for headers only — never use it for credentials or portal access.",
  ],
  parameters: Params,

  async execute(_id, params, signal) {
    const result = await generateGstrPack(params, signal);

    return {
      content: [{ type: "text", text: result.summary }],
      details: result,
    };
  },
};

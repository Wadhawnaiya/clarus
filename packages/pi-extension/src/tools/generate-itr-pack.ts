import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type GenerateItrPackResult, generateItrPack } from "../reviews/itr-pack";

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
  pan: Type.Optional(
    Type.String({
      description: "PAN for pack headers only (display). Never used for portal login or e-filing.",
    }),
  ),
  itr_forms: Type.Optional(
    Type.Array(Type.Union([Type.Literal("ITR-3"), Type.Literal("ITR-4")]), {
      description: "ITR form styles to emphasize (default: ITR-3 and ITR-4 notes)",
    }),
  ),
});

const LABEL = "Generate ITR Pack";

export const generateItrPackTool: ToolDefinition<typeof Params, GenerateItrPackResult> = {
  name: "generate_itr_pack",
  label: LABEL,
  description:
    "Generate an ITR review pack (computation of income from books, P&L/BS extracts, AIS/26AS/Form 16 intake hooks, checklist) under reviews/FY…/itr/ for CA review. Draft only — not filed; manual portal entry only.",
  promptSnippet: "Generate ITR review pack (ITR-3/4 style) under reviews/FY…/itr/",
  promptGuidelines: [
    "Use generate_itr_pack when the user asks to prepare ITR workpapers, income-tax computation for review, ITR-3/ITR-4 packs, or tax return review for a financial year.",
    "Always state that the pack is a draft for CA review and is not filed. Never claim e-filing or offer portal login automation.",
    "Prefer Indian FY dates: begin 1 April of start year, end 1 April of next year (end exclusive).",
    "If the user provides a PAN, pass it for headers only — never use it as a credential.",
    "After generation, mention gaps (missing AIS/26AS/Form 16) and suggest extract_text on uploaded docs under files/.",
  ],
  parameters: Params,

  async execute(_id, params, signal) {
    const result = await generateItrPack(params, signal);

    return {
      content: [{ type: "text", text: result.summary }],
      details: result,
    };
  },
};

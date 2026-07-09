import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type GenerateFsPackResult, generateFsPack } from "../reviews/fs-pack";

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
});

const LABEL = "Generate FS Pack";

export const generateFsPackTool: ToolDefinition<typeof Params, GenerateFsPackResult> = {
  name: "generate_fs_pack",
  label: LABEL,
  description:
    "Generate a financial statements review pack (Trial Balance, P&L, Balance Sheet, Cash Flow, notes) under reviews/FY…/fs/ for CA review. Numbers come from hledger; not a filed return.",
  promptSnippet: "Generate FS review pack (TB, P&L, BS, CF) under reviews/FY…/fs/",
  promptGuidelines: [
    "Use generate_fs_pack when the user asks to prepare financial statements or an FS review pack for a financial year.",
    "Always state that the pack is a draft for CA review, not a filed return.",
    "Prefer Indian FY dates: begin 1 April of start year, end 1 April of next year (end exclusive).",
  ],
  parameters: Params,

  async execute(_id, params, signal) {
    const result = await generateFsPack(params, signal);

    return {
      content: [{ type: "text", text: result.summary }],
      details: result,
    };
  },
};

# Spec: Clarus (v1)

**Status:** Draft — awaiting approval  
**Date:** 2026-07-09  
**Intent source:** `docs/intent/clarus.md` (confirmed)

## Objective

Evolve this repo from **Accountant24** into **Clarus**: a local-first AI desktop app for **CA / accounting firm staff** in India. Staff open **one folder per client**, upload engagement documents, and produce **review-ready packs**:

1. Full books + financial statements (TB, P&L, BS, Cash Flow, notes as needed)
2. GSTR review packs
3. ITR review packs / workpapers
4. Retained base capabilities: NL ledger work, imports, Q&A, memory, git versioning

Filing on GST/ITR portals remains **manual** in v1. Human CA review/sign-off is the product gate.

### Primary users

- Firm owner + firm staff (internal use first)
- Not public consumer SaaS in v1

### Success criteria (v1)

Staff can:

1. Install and run Clarus on **Windows** for daily firm use
2. Open / switch **client folders** (one workspace per client)
3. Upload bank statements, AIS, invoices, and other accounting docs into that client workspace
4. Build and maintain double-entry books with AI assistance
5. Generate **review-ready** FS pack: Trial Balance, P&L, Balance Sheet, Cash Flow (+ notes when needed)
6. Generate **GSTR** and **ITR** review workpapers from workspace data/docs
7. Senior CA reviews and signs off outside automated portal filing

## Tech stack (inherited)

| Layer | Choice |
| --- | --- |
| Monorepo | npm workspaces, TypeScript |
| Desktop | Electron + React + electron-vite + electron-builder |
| UI | shadcn/ui (Base UI) + Tailwind; wrappers under app component tree |
| Agent | `@earendil-works/pi-coding-agent` + local extension |
| Ledger | hledger plain-text journals + git |
| Lint/test | Biome, Vitest |

Evolve in place — **not** a greenfield rewrite.

## Commands

```bash
npm start          # dev desktop app
npm test           # vitest
npm run typecheck  # tsc
npm run lint       # biome lint
npm run verify     # audit + biome + typecheck + coverage
npm run build      # extension bundle + electron-vite build
npm run dist       # package (today: mac-only; will add Windows)
```

## Project structure (current → Clarus)

```
packages/desktop/          # Electron app (UI + main process)
  electron/main/           # env, agent spawn, ledger IPC, settings
  src/components/
    shadcn/                # stock — do not hand-edit
    accountant24/          # rename workstream → clarus/ (or firm brand path)
packages/pi-extension/     # agent tools, ledger, scaffold, system prompt
packages/evals/            # agent eval harness
docs/intent/clarus.md      # confirmed product intent
docs/specs/clarus.md       # this spec
tasks/plan.md              # implementation plan
tasks/todo.md              # ordered checklist
```

## Code style

Follow existing repo conventions (`AGENTS.md`):

- kebab-case files, PascalCase components
- Wrapper pattern: never edit stock shadcn; wrap in app components
- Theme tokens only; no hardcoded colors
- Tests are behavioral specs in `__tests__/` next to source
- Only mock I/O boundaries

## Testing strategy

| Area | Approach |
| --- | --- |
| Pure logic (paths, brand config, report builders, pack exporters) | Unit tests with hardcoded expected outputs |
| hledger integration | Existing pattern: real binary when available; skip or fixture otherwise |
| Agent tools | Extend evals cases for India/FS/GSTR/ITR behaviors as features land |
| UI | Component tests for folder open, brand strings; manual smoke on Windows |

Coverage target: new modules aim for high unit coverage; no lowering of `npm run verify` gate without explicit decision.

## Boundaries

### Always

- Keep client data local (folder on disk + optional git remote the firm controls)
- Preserve double-entry integrity via hledger validate after mutations
- Retain MIT attribution to original author in LICENSE / NOTICE as required
- Ship Windows as a first-class platform for firm use
- Produce review drafts, not auto-filed returns

### Ask first

- Legal copyright owner string for Clarus product identity
- Remote git / update feed owner (GitHub org, appId domain)
- Chart-of-accounts template for Indian entity types (prop / partnership / company)
- Which GSTR forms and ITR forms are in v1 pack (GSTR-1/3B/9? ITR-3/4?)
- Whether multi-currency or INR-only in v1
- Auto-update hosting for Windows (S3, GitHub Releases, internal share)

### Never (v1)

- Auto e-filing or portal login automation for GST/ITR
- Public multi-tenant cloud SaaS
- Full ERP (inventory, payroll, Tally/Zoho replacement)
- Shipping under Accountant24 / Accounting24 product identity
- Full MCA Schedule III annual-report automation on day one

## Architecture decisions (proposed)

| Decision | Proposal | Rationale |
| --- | --- | --- |
| Product identity | Rebrand to Clarus (app name, package names, UI strings, prompts) | Intent + ownership |
| Workspace model | Replace single `~/Accountant24` with **user-selected client folder**; remember recent clients | Firm multi-client reality |
| Env var | Rename `ACCOUNTANT24_HOME` → `CLARUS_HOME` (with short-lived dual-read for migration) | Clean break without silent data loss |
| FS generation | Prefer hledger reports (`bal`/`is`/`bs`/`cf`/`print`) + structured export (CSV/JSON → review pack HTML/PDF or markdown) | Reuse engine; avoid inventing a second ledger |
| India CoA | New scaffold templates for firm clients (INR, Indian tax/GST accounts) | Personal-finance CoA is wrong for firm books |
| GSTR/ITR | Skills/tools that produce **workpapers** from docs + ledger, not portal APIs | v1 is review-only |
| Windows binaries | Extend vendor pipeline for Windows hledger/pdftotext/tesseract (or document install prerequisites for alpha) | `vendor-bin.ts` is macOS/Homebrew-only today |
| License | Keep MIT; add NOTICE with upstream copyright + Clarus copyright when owner known | Legal compliance |

## Current-state gap summary

| Area | Today | Clarus need |
| --- | --- | --- |
| Brand | Accountant24 everywhere | Clarus |
| Platform | macOS arm64 DMG/zip only | Windows day-to-day |
| Binaries | Homebrew vendor on macOS | Windows-compatible tools |
| Workspace | Fixed `~/Accountant24` | Per-client folder open/switch |
| CoA / prompt | Personal finance US framing | Firm / India engagement framing |
| Reports | Query: bal, reg, is, bs, print, stats | + trial balance workflow, cash flow, pack export |
| GSTR/ITR | None | Review workpapers |
| CI release | macOS sign/notarize | + Windows build artifact |

## Workstreams (dependency order)

```
W0 Foundations (spec/plan) ──done when this doc + plan approved
        │
        ▼
W1 Rebrand (identity, strings, package names, prompts)
        │
        ▼
W2 Client folders (open/switch workspace; multi-client UX)
        │
        ├──────────────────┐
        ▼                  ▼
W3 Windows packaging    W4 Books + FS review pack
        │                  │
        └────────┬─────────┘
                 ▼
            W5 GSTR review pack
                 │
                 ▼
            W6 ITR review pack
                 │
                 ▼
            W7 Firm pilot hardening (docs, evals, release)
```

W3 and W4 can proceed in parallel after W2. W5/W6 depend on stable client workspace + books.

## Open questions (block full execution of later waves)

1. **Copyright owner** legal name for Clarus (LICENSE / About / installer).
2. **v1 GSTR set** — e.g. GSTR-1 + GSTR-3B workpapers only vs include annual.
3. **v1 ITR set** — ITR-3 / ITR-4 / both; prop vs firm.
4. **Entity types** in v1 scaffold (sole prop, partnership, private limited).
5. **Windows alpha strategy** — bundle all native tools vs require winget/choco install for alpha.
6. **Distribution** — internal MSI/EXE share vs public GitHub Releases under new org.

## Out of scope (v1) — explicit

- Portal automation
- Cloud multi-tenant SaaS
- Full ERP / inventory / payroll
- Schedule III MCA automation
- Keeping Accountant24 branding

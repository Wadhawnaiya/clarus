# Implementation Plan: Clarus v1

## Overview

Turn the Accountant24 monorepo into **Clarus**: firm-owned, Windows-capable, multi-client (one folder per client), India-oriented AI desktop app that produces review-ready full books/FS, GSTR, and ITR workpapers — without portal auto-filing.

Confirmed intent: `docs/intent/clarus.md`  
Product spec: `docs/specs/clarus.md`

## Architecture decisions

1. **Evolve in place** — rebrand and extend; no rewrite.
2. **Client workspace = directory** — ledger, memory, files, sessions, git root live in the chosen folder (same layout as today, relocatable).
3. **hledger remains source of truth** for books and FS numbers.
4. **Review packs** are exportable artifacts (markdown/HTML/CSV initially; PDF later if needed) written under the client folder.
5. **Windows first-class** for packaging and native tools; macOS kept working.
6. **MIT preserved** with upstream copyright retained; add Clarus copyright when owner is known.

## Research findings (2026-07-09)

| Finding | Evidence | Impact |
| --- | --- | --- |
| Mac-only ship | `electron-builder.yml` has only `mac:`; `npm run dist` uses `--mac` | Need `win` target + scripts + CI job |
| Binaries mac-only | `scripts/vendor-bin.ts` is Homebrew/dylib oriented | Need Windows vendor or alpha prereq path |
| Single home dir | `workspaceDir()` → `~/Accountant24` / `ACCOUNTANT24_HOME` | Need folder picker + recent clients |
| Partial Windows awareness | `ledger.ts` already resolves `hledger.exe` on win32 | Good foundation |
| FS partial | Query tool supports `is` + `bs`, not `cf` / explicit TB pack | Extend reports + pack exporter |
| Personal CoA | `accounts.journal` is personal finance | India firm templates required |
| Brand deep | package names, extension filename, prompts, UI folder `accountant24/` | Coordinated rename |
| License OK to fork | MIT, Copyright Volodymyr Machula | Rebrand allowed; keep notice |

## Phase plan

### Phase 0 — Align (this phase)

- Spec + plan + todo written
- Human approval before code
- Capture open questions (copyright, form sets, Windows alpha strategy)

**Checkpoint:** Explicit plan approval.

---

### Phase 1 — Rebrand foundation (W1)

**Goal:** App presents as Clarus; no Accountant24 product identity in user-facing surfaces.

**Tasks (see todo.md):**

- Centralize product constants (name, env keys, default workspace name, extension asset name)
- Rename user-facing strings, system prompt soul/workspace, scaffold headers, README product pitch
- Update `electron-builder` productName/appId placeholders (final appId domain may wait on legal)
- Rename component directory `accountant24/` → `clarus/` (or keep folder short-term and only rename exports — prefer full rename for clarity)
- Package name migration `@accountant24/*` → `@clarus/*` (or staged: display first, packages second)
- LICENSE/NOTICE: retain upstream copyright; add Clarus section when owner known
- Update tests that assert brand paths/strings

**Acceptance:**

- [ ] Window title / About / onboarding say Clarus
- [ ] Agent system prompt identifies as Clarus firm assistant (not personal finance only)
- [ ] Default workspace path uses Clarus naming when no folder chosen yet
- [ ] `npm test` + `npm run typecheck` pass

**Risks:** Wide rename churn. Mitigate with constants + staged PR (strings first, packages second).

---

### Phase 2 — Client folders (W2)

**Goal:** Staff work one folder per client: open, remember, switch.

**Design sketch:**

- UI: Open Client Folder / Recent Clients (Electron `dialog.showOpenDialog`)
- Persist recent list + last-opened path in app settings (existing settings store)
- On switch: set `CLARUS_HOME` for agent child, re-scaffold if empty, reload mentions/sessions
- Empty folder → scaffold ledger template (India-oriented template once Phase 4 templates exist; until then use upgraded default)

**Acceptance:**

- [ ] User can open an arbitrary directory as workspace
- [ ] Recent clients list survives restart
- [ ] Agent tools read/write only inside selected folder
- [ ] Switching client does not mix journals between clients
- [ ] Tests for path resolution + settings persistence

**Risks:** Sessions path coupling; in-flight agent. Mitigate: stop/restart agent on switch; clear UI thread state.

---

### Phase 3 — Windows platform (W3)

**Goal:** Firm staff can install/run Clarus on Windows.

**Workstreams:**

1. **Runtime smoke:** document + verify `npm start` on Windows with system-installed tools
2. **electron-builder `win` target:** nsis or portable exe; icon.ico; artifact naming
3. **Native tools:** Windows build of hledger, pdftotext, tesseract (download release artifacts or choco/scoop in CI); path separators already mostly Node-safe
4. **CI:** add windows job for build (signing secrets optional later for internal pilot)
5. **Release scripts:** `dist:win` alongside `dist` mac

**Alpha strategy options (decide in open questions):**

| Option | Pros | Cons |
| --- | --- | --- |
| A. Bundle all tools | Zero setup for staff | Complex vendor pipeline |
| B. Require winget tools for alpha | Faster to ship UI | Friction / support load |
| **Recommend A for pilot, B only if blocked** | | |

**Acceptance:**

- [x] `electron-builder --win` produces installable artifact (config + `dist:win`; NSIS on `windows-latest` CI — Linux host needs wine for NSIS)
- [x] Packaged app finds hledger (bundled via `vendor:bin:win`; PATH fallback remains)
- [ ] Core chat + query + add transaction works on Windows VM/machine
- [x] CI workflow uploads Windows artifact (unsigned OK for internal pilot) — verify green run on GitHub

**Risks:** Tool vendoring is the hard part. Fail fast with a spike task before full CI polish.

---

### Phase 4 — Full books + financial statements (W4)

**Goal:** From a client workspace, produce review-ready FS pack.

**Building blocks:**

1. India-oriented CoA scaffold (INR, GST input/output, duties, capital, drawings, etc. — entity-type variants as decided)
2. Extend query tool: add `cf` (cashflow); clarify TB via `bal` / dedicated report helper
3. **FS pack generator** (pure functions + tool or command):
   - Trial Balance
   - Profit & Loss (`is`)
   - Balance Sheet (`bs`)
   - Cash Flow (`cf`)
   - Notes/schedules stubs as needed
4. Export under `reviews/FYXXXX/fs/` (or similar) as markdown + CSV (HTML polish later)
5. Agent prompt: firm bookkeeping + FS review workflow, not only personal spend logging
6. Evals: cases for FS pack generation shape and no fabricated balances

**Acceptance:**

- [x] Given a seeded balanced journal, pack contains TB/P&L/BS/CF with numbers matching hledger (unit: mocked hledger fixture totals)
- [x] Pack is written into client folder, git-committable (`reviews/FY…/fs/`)
- [x] Unit tests with hardcoded expected report snippets for fixture books
- [x] Agent can be asked “prepare FS review pack for FY 2025-26” and produce the pack (`generate_fs_pack` tool + eval cases)

**Risks:** Indian presentation (vertical BS, schedule mapping) differs from hledger defaults. v1 = correct numbers + clear labels; presentation polish iterative. Not Schedule III automation.

---

### Phase 5 — GSTR review pack (W5)

**Goal:** Review workpapers for GST returns (not filing).

**Proposed v1 scope (confirm):** GSTR-1 + GSTR-3B style summaries from:

- Ledger tax accounts / tagged GST postings
- Uploaded GSTR portal extracts / invoices (AI extraction → structured tables)
- Reconciliation checklist (outward supplies vs books, ITC vs books)

**Deliverable:** `reviews/FYXXXX/gstr/` markdown+CSV workpapers + open issues list for CA.

**Acceptance:**

- [x] Pack generated for fixture client with known GST figures
- [x] Explicit “not filed / draft for review” labeling
- [x] No portal credentials or automation code

---

### Phase 6 — ITR review pack (W6)

**Goal:** ITR workpapers for CA review (not e-filing).

**Proposed v1 scope (confirm):** Support workpapers aligned with common firm cases (e.g. ITR-3/ITR-4), using:

- Books/FS totals
- AIS/TIS/26AS/Form 16 uploads when present
- Existing ITR prep skill patterns where reusable (plugin skill exists in environment; integrate carefully)

**Deliverable:** `reviews/FYXXXX/itr/` computation + checklist workpapers.

**Acceptance:**

- [x] Fixture client produces ITR review pack with sourced figures and gaps called out
- [x] Manual portal entry remains the filing path
- [x] Tests for computation helpers with hardcoded expected values

---

### Phase 7 — Firm pilot hardening (W7)

- Pilot docs: Windows install, open client, FS/GSTR/ITR flows (`docs/pilot-install.md`)
- Evals suite expansion (FS/GSTR/ITR + firm multi-pack / safety)
- Analytics brand cleanup: empty Aptabase key until firm-owned; changelog + publish → Clarus repo
- Silent auto-update gated by `AUTO_UPDATE_ENABLED` (false for unsigned pilot)
- Internal release checklist (`tasks/release-checklist.md`) + staff UAT script (`tasks/uat-pilot.md`)

**Checkpoint:** Pilot with real firm staff; collect UAT; backfill gaps.

---

## Parallelization

| After | Parallel tracks |
| --- | --- |
| Phase 1 done | Phase 2 only (folders unlock everything) |
| Phase 2 done | Phase 3 (Windows) ∥ Phase 4 (books/FS) |
| Phase 4 done | Phase 5 ∥ Phase 6 (after shared review-pack conventions) |

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Windows native tool bundling | High | Spike early in Phase 3; alpha fallback to PATH tools |
| Rename breaks imports/tests | Medium | Constants layer; rename in atomic commits; verify always |
| Scope explosion on Schedule III / all GST forms | High | Hold to intent out-of-scope; pack = review drafts |
| Copyright owner TBD | Medium | Placeholder “Clarus” in UI; legal string blocks store/About polish only |
| Upstream drift if still tracking Accountant24 | Low/Med | Treat as product fork; document merge policy if any |

## Open questions (need human answers before or during phases)

1. Clarus **legal copyright owner** string?
2. Windows alpha: **bundle tools** vs **PATH tools**? → **Decided 2026-07-09: bundle** hledger + poppler on Windows; tesseract best-effort / PATH fallback for OCR
3. v1 **GSTR** forms set? → **Decided 2026-07-09 for Phase 5:** GSTR-1 + GSTR-3B style workpapers from books; GSTR-9 later
4. v1 **ITR** forms set? → **Decided 2026-07-09 for Phase 6:** ITR-3 + ITR-4 style workpapers from books + doc intake; no e-filing / slab engine
5. v1 **entity types** for scaffold? → **Decided 2026-07-09 for Phase 4:** sole proprietorship CoA default (capital + drawings + GST); partnership / company variants later
6. **Distribution** channel for firm pilot? → **Partial 2026-07-09:** GitHub `Wadhawnaiya/clarus` for publish/changelog; Windows CI artifacts for unsigned pilot; auto-update off until firm enables + signs

## Definition of done (per task)

- Acceptance criteria checked
- Tests added/updated for new behavior
- `npm test` and `npm run typecheck` pass for touched packages
- No unrelated refactors
- User-facing strings use Clarus after Phase 1

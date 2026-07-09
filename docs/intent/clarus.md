# Intent: Clarus

**Status:** Confirmed  
**Date:** 2026-07-09  
**Source:** interview-me session (explicit user yes)

## Product

**Clarus** — firm AI desktop app forked from Accountant24, owned and branded as our product (not Accountant24 / Accounting24).

## Outcome

Turn this codebase into **Clarus**: a local-first AI desktop app where firm staff work **one folder per client**, upload required documents (bank statements, AIS, invoices, and other accounting docs), and get **review-ready** deliverables:

1. **Full books** including **financial statements** (Trial Balance, Profit & Loss, Balance Sheet, Cash Flow, plus notes/schedules as needed for the entity)
2. **GSTR** review packs
3. **ITR** review packs / workpapers
4. Plus Accountant24-style capabilities: natural-language ledger work, imports, Q&A, memory, git versioning

## User

- Primary: **owner + firm staff** (internal CA / accounting firm use first)
- Not a public consumer SaaS product in v1

## Why now

- Solid base exists (local-first AI + double-entry ledger)
- Need full product ownership (rebrand, copyright identity)
- Need **Windows** for daily firm use (not Mac-only shipping story)
- Need **Indian** compliance and full books/FS workflow, not US personal-finance framing alone

## Success

Staff can:

1. Open a **client folder**
2. Upload the documents needed for that engagement
3. Obtain a **review-ready pack**: full books + financial statements + GSTR + ITR-related workpapers
4. Senior CA **reviews and signs off**
5. Filing on GST/ITR **portals is manual** (outside the app in v1)
6. App **runs on Windows** for day-to-day firm use

## Constraint

- Evolve **this repo** (rebrand + platform + India workflow + FS generation)
- Not a greenfield rewrite for v1
- v1 is **draft / review**, not government portal automation

## Out of scope (v1)

- Auto e-filing / portal login to GST or ITR sites
- Public multi-tenant cloud SaaS
- Full ERP replacement (Tally/Zoho inventory, payroll, etc.)
- Keeping Accountant24 / Accounting24 branding or original product identity as the face of the app
- Full MCA Schedule III company annual-report automation on day one
- “Everything any accountant ever does” beyond **full books + FS + GSTR + ITR** review packs

## Brand

| Field | Value |
| --- | --- |
| Product name | **Clarus** |
| Naming vibe | Modern tech brand (premium, short, global-sounding) |
| Copyright owner | **TBD** — legal name / firm name not yet provided |

## Financial statements (v1 definition)

Generated from the client’s double-entry books for CA review:

- Trial Balance
- Profit & Loss
- Balance Sheet
- Cash Flow
- Notes/schedules as needed for the entity

Explicitly **not** full Schedule III / MCA annual-report automation in v1 unless later promoted into scope.

## Interaction model

- **One workspace/folder per client**
- Document upload + AI-assisted preparation
- Chat-driven ledger help retained from the Accountant24 model
- Human review before any external filing

## Downstream

1. ~~Save intent~~ — done (this file)
2. ~~Research repo / license / Windows gaps / FS path~~ — done 2026-07-09 (summary in `tasks/plan.md`)
3. ~~Plan workstreams~~ — draft in `docs/specs/clarus.md`, `tasks/plan.md`, `tasks/todo.md` (awaiting approval)
4. Execute after plan approval — **not started**

## Confirmation

- Interview hypothesis refined through multi-turn Q&A
- User confirmed restate with explicit **yes**
- Refinement accepted: full books including financial statements
- Final lock: 2026-07-09

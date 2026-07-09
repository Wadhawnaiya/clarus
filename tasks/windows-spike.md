# Phase 3 — Windows runtime spike

**Date:** 2026-07-09  
**Host for analysis:** Linux x86_64 (no Windows VM in this session)  
**Method:** code-path review + pinned binary URL checks + planned CI validation

## Goal

Document what works / fails for Clarus on Windows today, and lock the alpha strategy for native tools before full packaging polish.

## Code readiness (before Phase 3 changes)

| Area | Status | Notes |
| --- | --- | --- |
| Path joins / client folders | Ready | Node `path` used throughout; no hardcoded `/` in ledger/workspace logic |
| `env.agentEnv()` PATH prepend | Ready | Uses `path.delimiter`; works on win32 |
| `nodeRuntimePath()` | Ready | Non-mac returns `process.execPath` (no Helper Dock workaround needed) |
| `ledger.ts` hledger resolve | Ready | Already prefers `hledger.exe` under `binDir()` on win32, else PATH |
| pi-extension spawn | Ready | Spawns `hledger` / `pdftotext` / `tesseract` by name; inherits agent env; Windows finds `.exe` via `PATHEXT` |
| electron-builder | **Gap** | Only `mac:` targets; `npm run dist` is `--mac` only |
| `scripts/vendor-bin.ts` | **Gap** | Homebrew + dylibbundler + codesign — macOS only |
| App icon | Partial | `icon.icns` + `icon.png` present; no `icon.ico` (builder can derive from PNG) |
| CI release | **Gap** | macOS arm64 only; verify job still referenced old `Accountant24` artifact names (fix with Phase 3) |
| Dev `npm start` | Untested on Windows | Expected to work if Node 22 + system tools on PATH |

## Native tools strategy (decision)

Open question in `tasks/plan.md`: **bundle (A)** vs **PATH-only (B)**.

**Decision for pilot:** **A — bundle on Windows**, with PATH fallback already in code when a tool is missing.

| Tool | Windows source (pinned) | Notes |
| --- | --- | --- |
| hledger | Official `hledger-windows-x64.zip` from simonmichael/hledger **1.52.1** | Copy `hledger.exe` only |
| pdftotext | oschwartz10612/poppler-windows **v24.08.0-0** (`Release-24.08.0-0.zip`) | Copy `pdftotext.exe` + sibling DLLs from `Library/bin` |
| tesseract | winget/choco install on Windows runners, then copy `tesseract.exe` + needed DLLs; `eng.traineddata` from tessdata | Portable zip not officially maintained; OCR is secondary to ledger for pilot |
| eng.traineddata | `tesseract-ocr/tessdata` raw `eng.traineddata` | Always vendor under `resources/tessdata/` |

**Fallback:** if a binary is absent from `resources/bin`, main process / agent use bare command name → system PATH (install docs for staff).

## Expected runtime matrix

| Scenario | Chat | Query ledger | Add txn | PDF extract | Image OCR |
| --- | --- | --- | --- | --- | --- |
| Packaged + bundled tools | Yes | Yes | Yes | Yes | Yes (if tesseract vendored) |
| Packaged, tools missing, PATH has hledger | Yes | Yes | Yes | If pdftotext on PATH | If tesseract on PATH |
| Dev `npm start`, no tools | Yes | Mentions empty / tool errors | Tool errors | Fail extract | Fail OCR |

## Packaging targets (Phase 3)

- **NSIS installer** (x64) — primary staff install
- **Portable** (x64) — optional single-folder run for pilot USB / locked machines
- **Unsigned OK** for internal pilot (`CSC_IDENTITY_AUTO_DISCOVERY=false`)
- Artifact names: `Clarus-Setup.exe` (nsis), `Clarus-Portable.exe` (portable) so they do not collide

## Smoke checklist (run on Windows machine / CI)

1. Install or run portable build
2. App opens with Clarus branding; open a client folder
3. Send one chat turn (model auth configured)
4. `hledger` path: agent `query` balance on a scaffolded journal returns rows
5. Optional: attach a PDF → extract text succeeds when poppler vendored

## Local verification (2026-07-09, Linux host)

| Step | Result |
| --- | --- |
| `npm run vendor:bin:win` | OK — hledger.exe + pdftotext.exe + 38 DLLs + eng.traineddata |
| Unit tests (`vendor-bin-sources`) | 9 passed |
| `npm run typecheck` | OK |
| `npm run build` + electron-builder win unpack | OK — `release/win-unpacked/Clarus.exe` with tools under `resources/bin/` |
| NSIS/portable on Linux | **Needs wine** (`spawn wine ENOENT`) — produce installers on `windows-latest` CI |

## Risks remaining

| Risk | Mitigation |
| --- | --- |
| Poppler DLL set incomplete | Copy entire `Library/bin` for poppler release, not only `pdftotext.exe` |
| Tesseract hard to vendor portably | Best-effort on win runners; document winget install for OCR-only gaps |
| Cross-build from Linux of Windows app | Prefer `windows-latest` CI for real NSIS/portable; Linux can vendor Windows tool zips + unpack app dir |
| Code signing later | Pilot ships unsigned; SmartScreen warnings expected |

## Out of scope for this spike

- Authenticode signing / EV cert
- Auto-update feed for Windows (`latest.yml`)
- ARM64 Windows builds
- Intel macOS re-enable

# Clarus internal release checklist (pilot)

Use before distributing a build to firm staff. Check each box; link the artifact path or CI run.

## Pre-flight

- [ ] `main` (or release branch) is clean; intended commit SHA recorded: `________`
- [ ] Phase 1 brand smoke: window title / Settings / onboarding say **Clarus** (not Accountant24)
- [ ] `electron-builder.yml` `publish.owner` / `publish.repo` point at **Clarus** firm repo (not upstream Accountant24)
- [ ] `AUTO_UPDATE_ENABLED` is intentional (`false` for unsigned pilot is OK)
- [ ] Aptabase: firm key set **or** empty (no upstream product key)

## Build

### Windows pilot channel

- [ ] GitHub Actions **Windows build** workflow green (or local `npm run dist:win` on Windows)
- [ ] Artifacts present:
  - [ ] `Clarus-Setup.exe`
  - [ ] `Clarus-Portable.exe`
- [ ] Vendored Windows tools present in package (`hledger.exe`, poppler tools under resources/bin)
- [ ] Version string recorded: `________` (CI may use `0.0.0-win-ci` for pilot)

### Linux pilot channel

- [ ] GitHub Actions **Linux build** workflow green (or local `npm run vendor:bin:linux && npm run dist:linux`)
- [ ] Artifacts present:
  - [ ] `Clarus-*.AppImage`
  - [ ] `Clarus-*.deb`
- [ ] Vendored `hledger` present under resources/bin
- [ ] Host packages documented: `poppler-utils`, `tesseract-ocr` for PDF/OCR

### Providers smoke

- [ ] Settings shows **Cloud API keys** (OpenRouter + NVIDIA NIM) with API Key actions
- [ ] Saving an OpenRouter or NVIDIA key enables models without Ollama

### macOS (optional for this pilot cut)

- [ ] Signed/notarized DMG only if release secrets configured; otherwise skip store/staff mac ship

## Smoke (human, 15–20 min)

- [ ] Install Setup (or run Portable) on a clean Windows profile
- [ ] SmartScreen: documented run-anyway path works
- [ ] Connect LLM (or Ollama)
- [ ] Open **empty** client folder → layout dirs appear
- [ ] One chat turn succeeds
- [ ] Ledger query works (e.g. balance / trial balance)
- [ ] `generate_fs_pack` (or chat: prepare FS pack) writes under `reviews/FY…/fs/`
- [ ] GSTR pack under `reviews/FY…/gstr/` with draft/not-filed language
- [ ] ITR pack under `reviews/FY…/itr/` with draft/not-filed language
- [ ] Switch to a second client folder → books do not mix

## Distribute

- [ ] Artifact stored on firm share / private release with checksum optional
- [ ] Pilot install doc shared: `docs/pilot-install.md`
- [ ] UAT script shared: `tasks/uat-pilot.md`
- [ ] Recipients list + date: `________`

## After pilot feedback

- [ ] File gaps as tasks (do not expand portal-filing scope without product decision)
- [ ] If enabling auto-update: firm GitHub Releases + `AUTO_UPDATE_ENABLED = true` + signed builds plan

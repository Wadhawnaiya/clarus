# Clarus pilot install guide

Internal firm pilot — **Windows** and **Linux** day-to-day. Clarus prepares **draft review packs** only; GST/ITR **filing stays manual** on government portals.

## What you need

| Item | Notes |
| --- | --- |
| Windows 10/11 x64 **or** Linux x64 | Primary pilot platforms |
| Clarus installer | Windows: Setup/Portable · Linux: AppImage or `.deb` |
| LLM access | **OpenRouter** or **NVIDIA NIM** API keys, ChatGPT/Claude OAuth, other API keys, **or** optional local Ollama |
| Disk space | One folder per client (ledger + files + reviews) |

Optional for OCR: system **Tesseract** on PATH. Windows pilot builds bundle **hledger** + **poppler**. Linux builds bundle **hledger**; install `poppler-utils` (and optionally `tesseract-ocr`) for PDF/OCR.

## Connect a model (cloud or local)

You do **not** need a local model. Preferred cloud options for the pilot:

| Option | Where | Notes |
| --- | --- | --- |
| **OpenRouter** API key | Settings → Providers → **Cloud API keys** | Many models behind one key (`sk-or-…`) |
| **NVIDIA NIM** API key | Same section | NVIDIA-hosted models (`nvapi-…`) |
| Subscription OAuth | Settings → Providers | ChatGPT / Claude / more |
| Other API keys | Settings → Providers → Available | Anthropic, OpenAI, Google, … |
| **Ollama** (optional) | Local only | Free / offline when you prefer local-first |

On first launch, onboarding lists subscription, **API key** (including OpenRouter · NVIDIA), and optional Ollama.

## Install (Windows)

### Option A — Setup installer (recommended)

1. Get `Clarus-Setup.exe` from the firm share or GitHub Actions artifact (`clarus-windows-x64`).
2. Run the installer. Choose install directory if prompted.
3. Launch **Clarus** from the Start menu or desktop shortcut.
4. Windows SmartScreen may warn on **unsigned** pilot builds: *More info* → *Run anyway* (expected until code signing is set up).

### Option B — Portable

1. Get `Clarus-Portable.exe`.
2. Place it in a firm-approved folder (e.g. under Documents or a tools share).
3. Double-click to run — no installer.

### Linux (x64)

#### Option A — AppImage (recommended)

1. Get `Clarus-*.AppImage` from the firm share or GitHub Actions artifact (`clarus-linux-x64`).
2. Make it executable: `chmod +x Clarus-*.AppImage`
3. Run: `./Clarus-*.AppImage`
4. Optional host packages for PDF text extract / OCR:

   ```bash
   # Debian/Ubuntu
   sudo apt install poppler-utils tesseract-ocr
   ```

#### Option B — Debian package

1. Get `Clarus-*.deb`.
2. Install: `sudo apt install ./Clarus-*.deb` (or `dpkg -i` then fix deps).
3. Launch **Clarus** from the app menu or `Clarus` on PATH.

#### Dev from source (any Linux with Node 22+)

```bash
npm install
npm run vendor:bin:linux   # hledger + tessdata into packages/desktop/resources
npm start
```

### macOS (still supported for dev)

- Prefer `npm start` from a clone, or a firm-built DMG when available.
- Default workspace name when no client folder is open: `~/Clarus`.

## First launch

1. **Connect a model** — Settings → Providers:
   - **Cloud API keys** for OpenRouter / NVIDIA NIM, or
   - OAuth / other API keys, or
   - optional Ollama if you want fully local models.
2. **Open a client folder** — sidebar **Open client folder** (or equivalent). Pick an empty directory or an existing client workspace.
3. Empty folders get a client layout (`ledger/`, `files/`, `sessions/`, …). India sole-proprietorship CoA scaffold applies on first agent session when needed.
4. Auth and model prefs live in the **app** config, not inside the client folder — switching clients does not drop your provider login.

## Daily workflow

```
Open client folder
    → Upload docs into chat or files/
    → Maintain books via natural language
    → Generate review packs (FS / GSTR / ITR)
    → Senior CA reviews packs on disk
    → File on GST/ITR portals outside Clarus
```

### Switch clients

Use the client folder control to open another directory. Each client is independent; do not mix journals across folders.

### Example prompts

| Goal | Example |
| --- | --- |
| Books / FS pack | `Prepare the FS review pack for FY 2025-26 for this client` |
| GSTR workpapers | `Prepare the GSTR review pack for FY 2025-26` |
| ITR workpapers | `Prepare the ITR review pack for FY 2025-26` |
| On-screen report | `Show trial balance for FY 2025-26` / `Show cash flow for FY 2025-26` |

Packs land under the client folder, for example:

```text
reviews/FY2025-26/fs/
reviews/FY2025-26/gstr/
reviews/FY2025-26/itr/
```

Labels are **draft / not filed** — for CA review only.

### Documents (ITR / books)

Put engagement docs in the client `files/` tree or attach in chat:

- Bank statements, invoices
- AIS / TIS, Form 26AS, Form 16 (when available)

The agent classifies what’s present and lists **gaps** in the ITR pack rather than inventing numbers.

## Privacy

- Client data stays in the **client folder** on disk (plus optional firm git remote).
- Settings → Privacy: anonymous analytics opt-out. Pilot builds may ship with network analytics **disabled** until the firm owns its own analytics project.
- Silent auto-update is **off** for pilot until the firm release feed is enabled.

## Known pilot limits

- **Unsigned** Windows/Linux pilot builds (SmartScreen / desktop “unknown app” friction).
- Linux PDF/OCR may need host packages (`poppler-utils`, `tesseract-ocr`) when not on PATH.
- No GST/ITR **portal** login or auto-filing.
- GSTR pack scope: **GSTR-1 + GSTR-3B style** workpapers from books (not GSTR-9).
- ITR pack scope: **ITR-3 / ITR-4 style** notes + doc gaps (no slab/presumptive tax engine).
- Entity scaffold default: **sole proprietorship** (partnership/company templates later).
- Not full MCA Schedule III / ERP replacement.

## Getting help

1. Reproduce with the **same client folder** path and FY in the prompt.
2. Note OS build, Clarus version (Settings sidebar), and whether Setup vs Portable.
3. Do **not** paste client PAN/GSTIN/financials into public tickets — use redacted examples.

## Related

- Product intent: `docs/intent/clarus.md`
- Spec: `docs/specs/clarus.md`
- Staff UAT script: `tasks/uat-pilot.md`
- Internal release checklist: `tasks/release-checklist.md`

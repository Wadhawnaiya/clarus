# Vendored native tools

Bundled into the packaged app under `resources/bin` (see `electron-builder.yml`
`extraResources` and `electron/main/env.ts` `binDir()` / `agentEnv()` PATH).

| Platform | Produce with | Binaries |
| --- | --- | --- |
| macOS | `npm run vendor:bin` (Homebrew) | `hledger`, `pdftotext`, `tesseract` + `lib/*.dylib` |
| Windows | `npm run vendor:bin:win` (or `vendor:bin` on Windows) | `hledger.exe`, `pdftotext.exe` (+ DLLs), optional `tesseract.exe` |
| Linux | `npm run vendor:bin:linux` | `hledger`; optional host `pdftotext`/`tesseract` copy; else PATH |

Also vendored: `resources/tessdata/eng.traineddata` (`TESSDATA_PREFIX`).

Do not commit the binaries — only this README. CI runs the vendor script before
`electron-builder`.

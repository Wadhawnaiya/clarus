# Clarus pilot UAT script (firm staff)

**Build / version:** _______________  
**Tester:** _______________  
**Date:** _______________  
**OS:** Windows / Linux _______________  

Mark each step **Pass** / **Fail** / **Skip**. File Fail with steps to reproduce (no client secrets).

---

## A. Install

| # | Step | Result | Notes |
| --- | --- | --- | --- |
| A1 | Obtain Windows Setup/Portable **or** Linux AppImage/deb from firm share | | |
| A2 | Install or launch successfully | | |
| A3 | App title / branding shows **Clarus** | | |
| A4 | (Linux) PDF extract works after `poppler-utils` if needed | | |

## B. Onboarding / models

| # | Step | Result | Notes |
| --- | --- | --- | --- |
| B1 | Connect via **OpenRouter** or **NVIDIA NIM** API key (cloud, no local model) **or** OAuth/other key/Ollama | | |
| B2 | Settings → Providers shows Cloud API keys section | | |
| B3 | Select a model and send one message | | |
| B4 | Settings → Privacy is reachable | | |

## C. Client folder

| # | Step | Result | Notes |
| --- | --- | --- | --- |
| C1 | Open a new empty folder as client | | |
| C2 | Client layout exists (`ledger/`, `files/`, …) | | |
| C3 | Open a second folder; switch back — data stays separate | | |
| C4 | Recent / last client behaves as expected after restart | | |

## D. Books + chat

| # | Step | Result | Notes |
| --- | --- | --- | --- |
| D1 | One natural-language transaction posts to ledger | | |
| D2 | Ask for a balance / trial balance — answer matches books | | |
| D3 | Attach or place a sample PDF in `files/` — agent can extract or acknowledge | | |

## E. Review packs (draft only)

Use Indian FY wording, e.g. **FY 2025-26**.

| # | Step | Result | Notes |
| --- | --- | --- | --- |
| E1 | FS pack appears under `reviews/FY…/fs/` | | |
| E2 | Pack includes TB / P&L / BS / CF (or clear stubs) with draft labeling | | |
| E3 | GSTR pack under `reviews/FY…/gstr/` — draft / not filed | | |
| E4 | ITR pack under `reviews/FY…/itr/` — draft / not filed; gaps listed if docs missing | | |
| E5 | Ask to “file GSTR/ITR on the portal” — agent **refuses** filing, offers workpapers | | |

## F. Exit criteria for pilot sign-off

| Criteria | Pass? |
| --- | --- |
| Staff can install without engineering pair-programming | |
| One real client folder completed end-to-end (books + at least one pack type) | |
| Senior reviewer accepts pack format as usable draft (numbers may still be reviewed manually) | |
| No unexpected data mix between clients | |
| Blockers listed below filed for next hardening pass | |

### Blockers / feedback

1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Overall recommendation

- [ ] Ready for wider firm pilot  
- [ ] Needs fixes before more users  
- [ ] Blocked  

**Sign-off:** _______________  

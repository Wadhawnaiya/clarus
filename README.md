# Clarus — Local-first AI for firm bookkeeping

Prepare client books, import statements and accounting documents, and produce review-ready workpapers. Your data stays as plain text files on your machine. Works with any LLM, including local ones. All changes are versioned with git.

![Clarus — desktop app](docs/images/desktop-app-2.png)

> **Origin:** Clarus is a product fork of [Accountant24](https://github.com/machulav/accountant24) (MIT). Upstream copyright is retained in `LICENSE` and `NOTICE`.

## What you can do

### Log transactions in natural language

> I spent ₹4,500 at stationery shop yesterday

The agent figures out the details and adds it to the client ledger as a proper double-entry transaction.

### Import bank statements and receipts

> Here is my March bank statement, please add missing transactions: ~/Downloads/statement-march.pdf

Drop a PDF bank statement, an invoice, or a photo of a paper receipt into the chat. The agent extracts the text, pulls out every transaction, and adds them to the ledger. The original file is archived in the client workspace.

### Ask questions about the books

> How much did we spend on professional fees this month?

> Show trial balance for this year

The agent checks the ledger and gives a clear answer. Type `@` to point it at a specific account, payee, or tag.

### Teach the agent as you go

> Tag all GST input invoices with the `gst_itc` tag.

Tell the agent once — it remembers and applies it when it matters.

### Track every change with git

Every modification is auto-committed to a local git repo. Review history anytime, roll back mistakes, or push to a private remote for backup.

## Quick start

1. Install dependencies: `npm install`
2. Start the desktop app: `npm start`
3. Connect your LLM provider.
4. Pick a model and start chatting (default workspace: `~/Clarus`).

## Go fully local

Want client financial data to never leave the machine? Run a local model with Ollama.

1. [Download and install Ollama](https://ollama.com/download).
2. Pull a capable model, e.g.:

   ```bash
   ollama pull gemma4:31b  # requires ~24 GB+ RAM
   ```

3. In Settings → Providers, connect Ollama.
4. Pick the local model and start chatting.

## Why this stack

**hledger** is a mature accounting engine with proper double-entry bookkeeping. **LLMs** understand plain language. **pi** is the agent framework that glues sessions, tools, and models. **git** tracks every change to plain text files.

## Credits

Clarus builds on:

- **[Accountant24](https://github.com/machulav/accountant24)** by Volodymyr Machula — the open-source base this product is forked from.
- **[pi](https://github.com/badlogic/pi-mono)** by [Mario Zechner](https://github.com/badlogic) — a minimal but powerful framework for building AI agents.
- **[hledger](https://hledger.org)** by [Simon Michael](https://github.com/simonmichael) — the accounting engine that makes proper double-entry bookkeeping possible.

## License

MIT — see `LICENSE` and `NOTICE`.

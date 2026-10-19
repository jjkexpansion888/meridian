# Meridian

An evidence-led investment diligence workspace for public equities, cryptocurrencies and private companies.

**Status:** source code for a locally runnable app. Publishing this repository does not deploy a hosted app or expose your saved research.

## Default workflow: no API credits

### Research chat inside Meridian

Open a report and choose **Research chat → Continue with ChatGPT**. Sign in to an eligible ChatGPT account and authorize Meridian to use your plan. Select an available model, keep **Web research** on for current evidence, then ask a question or select **Research the next chapter**. Answers stream into the conversation. Use **Save to report** to review the chapter mapping before replacing report text.

This uses the official [ChatGPT plan integration for local apps](https://developers.openai.com/siwc/token-sharing-open-source), with subscription limits and account eligibility. It does not use `OPENAI_API_KEY`, buy credits, or fall back to API billing. Manage the app's allowance and any credit permissions in [ChatGPT usage settings](https://chatgpt.com/settings/usage). Web research availability depends on the selected model and account policy. This connection does not access existing ChatGPT conversations.

The connection runs only in the local development launcher (`npm run dev` / `Start-Meridian.ps1`), not in a remotely hosted build. Conversation history is saved per report and per ChatGPT registration in ignored `.meridian-local/`. Each message sends the brief, a bounded report excerpt and recent chat history to OpenAI. Credentials remain in the local Node process and protected local storage, never browser storage. Windows uses DPAPI encryption; if that is unavailable, credentials stay in memory and the UI says the connection lasts for this session. Other platforms use owner-only credential files. Never share `.meridian-local/`.

### Copy and import from an existing chat

1. Create a research brief for a stock, cryptocurrency or private company.
2. Keep **Use my Codex / ChatGPT chat** selected.
3. Copy or download the detailed brief and use it in your existing Codex/ChatGPT chat.
4. Ask for the long report as a Markdown file, preserving the supplied chapter headings and ordinary source links.
5. Click **Import report** in Meridian. Review the chapter mapping, save the report, and inspect its sources and evidence gaps.

The copy-and-import workflow makes no OpenAI API calls. It uses your existing chat access and is subject to that plan's limits. Imported citations are preserved as supplied and explicitly marked as not fetched.

**Windows quick start:** run `./Start-Meridian.ps1` in PowerShell from the repository folder. It uses a modern Node installation or the bundled Codex runtime when available, prepares the local database, and starts the app. No API key is needed for the default workflow.

## What it does

- Organizes 15–16 chapter reports from your existing chat, with clickable source citations. An optional funded API mode can research chapters automatically.
- Targets 12,000–19,000 words for deep diligence, or 23,000–35,000 words for investment committee depth. Length is a target, not a guarantee.
- Covers financial statements and earnings quality, business economics, competition, customers, management, valuation, permanent-loss risks, the opposing case, catalysts and evidence gaps.
- Adds token economics and security for crypto; cap tables, financing terms and commercial diligence for private companies.
- Saves reports, notes and watchlist preferences privately in D1, scoped to the signed-in account.
- Preserves research progress by chapter; supports pause, resume, retry and cancellation.
- Includes source search, Markdown/source/model export, and a print layout for saving PDF.
- Provides a transparent five-year DCF sensitivity lab with user-editable assumptions.
- Includes clearly marked fictional examples. Their figures are synthetic, and they have no fabricated citations.

## Run locally

Requires **Node.js 22.13+** and npm. Use Node 22 LTS or newer, not the older system Node 16.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_funny_black_crow.sql
npm run dev
```

Open the localhost URL printed by the dev server. Click New diligence, then Sign in to create research. The portable starter provides loopback-only mock sign-in for local development. It is not included in production.

For local live research, copy `.dev.vars.example` to `.dev.vars`, add your own `OPENAI_API_KEY`, and restart the dev server. Store hosted keys in server secrets. API keys, local databases and saved reports are excluded from Git and the source ZIP. Never place keys in browser code or commit a populated environment file.

For the optional API workflow, select **Automatic API research**, create a brief, review it, then click **Start paid research**. API charges apply. Keep the tab open to advance between chapters. Closing it does not cancel a provider request already in progress; return to resume the queue. Pause lets the current request finish, while Cancel current asks the provider to stop it.

## Verification

```sh
npm run typecheck
npm test
npm run build
# With the local server and database running:
node tests/local-api.mjs
```

Unit tests also cover portable briefs, chapter mapping, import fallbacks, source provenance and quota errors. Local integration tests verify that no-API mode refuses paid calls. Unit tests cover asset-specific mandates, evidence handling, citation offsets, source deduplication, unsafe URLs and DCF arithmetic. Local API checks cover authentication, spoofed-identity rejection, origin enforcement, validation, persistence, notes, watchlist, missing-key failure, pause/resume and fixture deletion. They refuse non-loopback hosts and do not intentionally make paid provider calls.

## Source map

- `components/Workspace.tsx`: workspace, report reader, source library, valuation lab and creation flow
- `components/ResearchChat.tsx`: in-app chat, account connection, streaming and reviewed chapter saves
- `scripts/chat-plugin.mjs`: loopback-only ChatGPT OAuth and subscription inference adapter
- `scripts/chat-core.mjs` / `scripts/chat-storage.mjs`: input validation, stream/citation handling and protected local state
- `components/Markdown.tsx`: text-safe Markdown rendering
- `app/meridian.css`: responsive visual design and print styles
- `lib/research.ts`: asset-specific research mandates, prompts, citations and DCF
- `lib/server.ts`: authentication, provider adapter, revision-safe persistence and chapter lifecycle
- `app/api/`: report creation, lifecycle and connection endpoints
- `db/schema.ts` / `drizzle/`: D1 schema and migration
- `docs/ARCHITECTURE.md`: data flow, security boundaries and known limits

## Deployment

This repository uses Vinext and the Sites Cloudflare integration. Keep the `sites()` Vite plugin and the D1 binding in `.openai/hosting.json`. The manifest refers to the original Sites project; a fork needs its own deployment project and database. Sites applies schema migrations during publication. Runtime values `OPENAI_API_KEY` and `OPENAI_MODEL` belong in the deployment's server secrets. The source repository is separate from the visibility and authorization of a deployed workspace.

The configured model is `gpt-5.5`, following the official web-search integration documentation available during implementation. It can be changed server-side to a compatible Responses API model with background mode and web-search support. The access test in Settings verifies model access without generating a report.

Official integration references: [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search), [background mode](https://developers.openai.com/api/docs/guides/background).

## Quality and scope

Meridian implements a professional diligence framework; it does not promise research equivalent to a particular hedge fund. Evidence quality, access to original documents, independent checks and human judgment determine the result. Citations are provenance, not a fact-checking guarantee. Private financial statements and cap tables are flagged as unavailable when public evidence cannot establish them.

This release uses public-web research rather than a licensed terminal feed. It does not perform original expert interviews, autonomous code audits or automated accounting certification. The valuation lab is illustrative until you enter verified inputs. Reports can contain errors and should be reviewed before investment use. The app is independent of Pershing Square and other investment managers.

The default workflow needs no API key. Automatic API research requires a funded provider account.

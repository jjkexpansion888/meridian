# Meridian architecture

Meridian is an owner-private investment research workspace built with React 19, TypeScript, Vinext/Vite, Cloudflare Workers and D1. Sites handles hosted authentication and deployment. The application has no client-side provider credentials.

## Default no-API lifecycle

New reports default to `researchMode: manual`, which blocks API-key billing. The local creation form uses the connected ChatGPT plan and web research to resolve a name/ticker/website into a sourced investment identity. Only ambiguous identities need a user choice. A planning pass chooses investment-specific sections after identity resolution; the initial asset outline is only a fallback. Identity research is stored under a preallocated, validated UUID that becomes the report ID. Creating the D1 record itself makes no provider call.

The default Start full diligence action runs an adaptive investigation through the local ChatGPT-plan stream endpoint. Planning is validated and persisted before section generation. Each section collects a typed evidence ledger, runs deterministic arithmetic and provenance checks, writes analysis, then receives a fresh-context review. A material critique triggers up to three targeted revision rounds with fresh rechecks. Every automated stage uses an isolated conversation ID. Server imports validate the evidence record and recompute derived flags; manually replacing text clears its old review record.

The queue saves after each section, preserves completed work, and writes the executive synthesis last. The UI hides unfinished report content and exports; completion opens one consolidated report with the synthesis first. Export carries unresolved findings and source-access limitations. Pause finishes the current section; abort, failure or leaving the report stops the queue. Unfinished or unsaved structured stages may rerun. Switching reader tabs keeps the chat mounted. No browser-close execution is claimed. Plan limits cause a visible stop, never API-key fallback. See RESEARCH-METHOD.md for research provenance and TRAINING.md for offline curation/evaluation.

Copy/download and manual import remain available for existing reports and newly identified briefs. The copy-and-import path makes no provider call. Matching chapter headings map text into the existing outline; unmatched input is preserved intact in the committee-memo chapter. The import preview explains which chapters will be replaced. Source links are extracted safely and marked as imported, with no fabricated access date. The server rejects advance/resume actions for manual reports.

## Optional paid API research lifecycle

1. An authenticated user creates a brief: exact entity, asset type, identifier, focus, as-of date, optional authorized text context and depth.
2. The API creates 15 equity chapters or 16 crypto/private-company chapters. Draft creation does not call the model.
3. Starting research enables browser-driven orchestration. Every six seconds, the browser asks the server to advance active reports. An optimistic D1 revision check reserves the next chapter before a billable request is made.
4. The server calls the OpenAI Responses API with live `web_search`, high reasoning, `background: true`, and source inclusion. Provider response IDs stay with the report. All calls go to a fixed provider origin.
5. A later advance call retrieves the provider response. Completed text, citation annotations, consulted sources and usage are saved. The next chapter receives prior research for cross-checking. The final pass writes the investment committee memo.
6. Closing the tab stops orchestration between chapters, but an already-started provider response can finish. Reopening the app resumes reports marked running. Pause stops the queue; cancel requests provider cancellation of the current response. A failed or incomplete chapter remains visibly incomplete until retried.

Browser orchestration is deliberate in this version: it does not claim that an entire report continues unattended. Production unattended research would require a durable workflow/queue and a scheduled reconciler. Provider timeouts can leave an uncertain launch; the app exposes that state rather than silently billing for a replacement. Provider responses can expire; resume may require retrying a chapter.

## Persistence and authorization

The `reports` table contains `id`, `owner_id`, `data` JSON, `revision` and `updated_at`. Each query is scoped to the authenticated user ID supplied by Sites. Mutations reject a mismatched Origin. SQL uses bound parameters. Optimistic revisions prevent silent overwrites. Up to 100 reports are retained per user; the current library fetches full reports, suitable for a personal workspace rather than a large multi-tenant warehouse.

Demo material is explicitly fictional. Only demo notes and watch preferences use browser storage. Live reports and analyst notes use D1. Library removal deletes the owner-scoped report record and its notes after confirmation. Chat transcripts are stored separately in ignored local storage and are not removed by this action. Local preview supports the starter's loopback-only mock sign-in. Do not expose the local development server to the public internet.

## Evidence integrity

Provider citation offsets are converted into ordinary clickable links. URLs are limited to HTTP(S), deduplicated, and labeled cited or consulted. Rendering uses React text nodes and a small Markdown renderer; raw HTML is not interpreted. A source appearing in a report is not represented as independently verified. Missing citations and chapters below the length target are highlighted.

Research prompts actively request relevant YouTube videos and public social evidence, with direct permalinks, author/channel, date, accessible material, bias and corroboration. Timestamps must be verified; inaccessible transcripts/posts become evidence gaps. This is web research, not a dedicated media transcription or social-platform API. Source filters classify exact platform domains and preserve the original links. Prompts cannot force access to unavailable content.

Research prompts require dated financial tables, explicit units, reconciliation, original-source citations, opposing evidence and clear treatment of unavailable private data. They cannot guarantee compliance. There is no independent fact-checking service, licensed market-data feed, original expert-interview network, SEC/XBRL normalization pipeline, audited financial model, or full automated numerical verification in this release. The generic valuation lab is a separate user-input sensitivity model, not an automatically extracted valuation.

## Runtime and data boundaries

`OPENAI_API_KEY` and `OPENAI_MODEL` are server-only runtime secrets. Context and earlier chapters are sent to OpenAI. Background mode uses provider storage; consult the provider's retention terms. Source URLs and excerpts can be stale or wrong. Publicly accessible research does not confer permission to republish entire source documents.

The local repo includes a reproducible lockfile, generated schema migration and tests for core numerical and citation behavior. CI does not call paid providers. The official integration references are [web search](https://developers.openai.com/api/docs/guides/tools-web-search) and [background mode](https://developers.openai.com/api/docs/guides/background).

# Local research chat

Meridian uses the official Sign in with ChatGPT flow for a locally hosted personal app. It uses no API key and never switches to API billing. User-controlled plan and credit settings remain in ChatGPT. Eligibility and web-search access are determined by OpenAI.

## Boundaries

- The Vite plugin handles `/__meridian/chat/*` in the Node development server. It is omitted for managed Linux hosting and production builds. Hosted Sites identity is separate from this local plan connection.
- All endpoints require a loopback socket, literal loopback Host, a same-origin custom header, and same-origin Origin on mutations. No CORS response is provided. The callback server binds only to `127.0.0.1` on an ephemeral port.
- Dynamic registration uses an installation-stable opaque host ID and fresh state, nonce and PKCE for each attempt. The issued client ID is used for token exchange. ID tokens are verified with `jose` against OpenAI JWKS, issuer, audience, expiry and nonce. Returning registrations must match the verified subject.
- Only granted plan-usage scopes enable inference. The browser receives account labels and model names, never access, refresh or ID tokens. No other app's credentials or browser session are read.
- Access tokens are renewed serially. Disconnect attempts refresh-token revocation and removes credentials locally; an unconfirmed remote revocation is reported to the user.
- `.meridian-local/` is ignored by Git and denied by the Vite file server. Windows encrypts credentials with CurrentUser DPAPI. If the execution context cannot use DPAPI, credentials remain only in RAM and no token data is persisted. Unix files are owner-only. This is a single-user local app, not a multi-user authentication service.
- Conversations are scoped by the validated subject/client registration and report ID. No conversation is published to GitHub. Report saves use the existing authenticated, revision-safe D1 import endpoint.

## Inference and report changes

The model catalog comes from the authenticated public models endpoint. Requests use OAuth with the public Responses endpoint, `store: false`, `stream: true`, explicit history and optional web search. Unsupported background or prior-response fields are omitted. The adapter does not read `OPENAI_API_KEY` or expose shell, filesystem, connector or other mutation tools to the model.

Only a `response.completed` event marks an answer complete. Interrupted/failed streams preserve partial text and cannot be saved through the chat's report button. Cancellation aborts the upstream request. One response runs at a time in the local server; navigating away stops the stream. The full local conversation is exportable; only a bounded recent window and report excerpt are sent as context. Citation annotations are converted to safe HTTP(S) Markdown links. Imported sources record provenance, not independent verification.

Saving opens a review dialog showing matched chapter headings. Matching chapters are replaced on the user's Save action; unmatched report chapters remain. Answers with no matching heading explicitly target the investment committee memo. Long reports should be researched chapter by chapter.

## Validation

`npm test` includes local-origin checks, OAuth transaction checks, scope gating, request construction, fragmented stream parsing, citation safety, request limits, credential protection/session-only fallback and account-separated storage. `npm run typecheck` and `npm run build` check the browser and production compilation. Live OAuth consent and a completed model response must be verified separately with an eligible user's account. Tests never intentionally consume paid API credits.

Official references: [registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [preview limits](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

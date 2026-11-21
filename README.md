# Profile Lens

A Chrome side-panel extension for thoughtful first conversations. **Outreach** finds professional hooks and coffee-chat starters. **Romantic Pursue** turns an adult's stated interests into date possibilities, a moodboard, and a soundtrack pick.

The application uses **live AI generation**. There is no hardcoded/demo response provider. Fictional sample pages are included as input; only automated tests use mock responses.

## Quick start

Setting up another computer? Follow the [detailed local setup guide](docs/LOCAL_SETUP.md) for macOS, Windows and Linux, including Chrome installation, per-device configuration, verification and troubleshooting.

Prerequisites: Node **24 LTS** (Node 22.12+ supported by the workspace), pnpm **10.28.0**, Chrome, and an OpenAI API key with access to a model supporting Responses API Structured Outputs. Package versions are pinned in `pnpm-lock.yaml`.

If pnpm is not installed, replace `pnpm` in each command below with `npx --yes pnpm@10.28.0`, for example `npx --yes pnpm@10.28.0 install --frozen-lockfile`.

```sh
pnpm install --frozen-lockfile
pnpm build
cp .env.example .env
```

1. Open **chrome://extensions**, enable **Developer mode**, and choose **Load unpacked**.
2. Select **`apps/extension/.output/chrome-mv3`**. Pin Profile Lens in the toolbar.
3. Copy its extension ID into `.env` as `ALLOWED_EXTENSION_ORIGIN=chrome-extension://YOUR_ID`.
4. Set `OPENAI_API_KEY` and `OPENAI_MODEL` in that same root `.env`. Choose a model in your account that supports Structured Outputs; the implementation does not assume a particular account/model entitlement.
5. Run `pnpm demo`. It starts the live API on **127.0.0.1:8787** and the sample pages on **localhost:4173**. Internet access/provider credits are required for AI generation.
6. If `BACKEND_ACCESS_TOKEN` is blank, the terminal prints a freshly generated **local connection token**. If you set it in `.env`, copy that value instead; the server does not print it. Open the extension's settings, paste it into **Backend token**, and select **Check & save**. This token is separate from the OpenAI key. Set a random value of at least 24 characters in `.env` to retain the same local token across API restarts.
7. Visit **http://localhost:4173**, click the extension's toolbar icon, and select **Read this profile**. Review the snippets and generate. Switch modes to try the same profile from another angle.

The OpenAI key stays in the server environment. Do not paste it into the extension. Credentials are not included in this repository. The server exits with a setup explanation when credentials, model, or extension origin are missing.

## What is implemented

- WXT / React / TypeScript Manifest V3 extension with a movable in-page overlay and temporary `activeTab` extraction.
- Generic individual-profile extraction, a best-effort LinkedIn adapter, and manual paste fallback. LinkedIn capture scrolls, expands section text and dialogs, and attempts same-profile Show all detail views.
- Editable/removable evidence, optional user context, mode-specific preferences, and source drawers.
- Separate shared/server/client mode registries; adding a mode does not require changing the extractor or endpoint orchestration.
- OpenAI Responses API adapter, strict mode schemas, citation/quote/catalogue validation, deadlines, cancellation, rate limits, and typed failure states.
- Both mode renderers, editable/copyable messages, six-tile moodboards, **24 original bundled vector illustrations**, and **12 catalogue tracks** with artist-source metadata.
- Tab/route/profile-root invalidation, late-response protection, session expiry, explicit clearing, and optional local persistence of the user's own context.
- Unit, API, component, and Chromium integration tests with test-only doubles.

## Development and testing

```sh
pnpm dev                  # API, sample pages, extension development
pnpm dev:profiles         # sample pages only; no AI credentials needed
pnpm typecheck
pnpm lint
pnpm test                 # no external API calls
pnpm exec playwright install chromium
pnpm test:e2e             # isolated test build, local API double, Chromium
pnpm build                # restore the production build before loading/demoing it
pnpm eval:live            # opt-in paid smoke check for both modes
pnpm package:demo         # zip the normal live extension; no credentials
```

Tests bind local ports 4173 and 8787. Stop your development API before running integration tests. Browser tests use an ephemeral profile and never interact with your personal browser profile.

`test:e2e` builds with an additional **test-only localhost host permission** so Chromium can exercise injection without automating Chrome's toolbar. **Always run `pnpm build` afterward** before loading the extension for ordinary use. Test output is in `test-results/` and is gitignored.

WXT's development build may have a different extension ID and extra hot-reload permissions. Configure that exact ID in `.env` when using it. Prefer the production build and `pnpm demo` for a presentation.

Tested toolchain: Node **26.5.0** for the initial implementation and **24.22.3** for clean-checkout validation; pnpm **10.28.0**, TypeScript **5.9.3**, WXT **0.21.5**, React **19.3.1**, Fastify **5.12.8**, OpenAI SDK **7.62.0**, Zod **4.6.7**, Playwright **1.65.1**. Node 24 is the recommended setup and passed the frozen-lockfile install, build, typecheck, lint, 33 unit/component tests and 3 browser integration tests on macOS. Windows and Linux setup instructions are included; native execution on those operating systems has not been verified here.

## Data handling

Reading a profile stays local until **Generate ideas**. Reviewed evidence and optional context then go to the local API and OpenAI. The API uses `store: false`; this is not a promise of zero provider retention. No application profile database, analytics, body/prompt logging, or background crawling is implemented.

Profile snapshots, results, and edited drafts live in panel memory and disappear when the panel document closes, the profile changes, the session expires, or **Clear session** is used. The backend token is in trusted extension session storage. Only opted-in self-context is saved in local storage. **Reset local settings** removes both settings and the token.

Extraction is intentionally conservative and excludes hidden content, forms, sidebars, and obvious third-party comments. Contact-detail filtering and age/boundary prechecks are limited heuristics, not perfect classifiers; review the retained text. Semantic citation accuracy still needs human review. The song and visual vibe are creative interpretations, not claims about someone's taste or personality.

## Current limitations

- Live smoke checks passed for both modes using `gpt-5.4-mini`. The installed Chrome extension also completed a live Outreach analysis from the fictional sample page. This verifies that the integration works; broader factual and suggestion-quality evaluation remains in [the demo runbook](docs/DEMO_SCRIPT.md).
- Native Chrome installation, toolbar access, side-panel extraction, local authentication, and Outreach generation have been verified. Continue the remaining tab/domain, restricted-page, and accessibility checks before presenting.
- LinkedIn extraction is best-effort and has not been verified against a real logged-in account. Capture takes up to roughly a minute, restores the original scroll position, and reports blocked or unfinished sections. Detail pages are rendered in temporary same-origin frames; LinkedIn may block these. LinkedIn evidence is capped at 120 snippets / 60,000 characters with a visible truncation notice. Generic extraction and manual paste retain their 30-snippet / 12,000-character capture limits. Use a personal page or paste text when parsing fails. Other social platforms have no dedicated adapter.
- Boards use original editorial illustrations, not generated photos or scraped profile photos. The music catalogue is deliberately small (two artists) and can be extended in `packages/catalogues`.
- Panel state is memory-only; closing and reopening the panel may require another capture. No result history or remote persistence.
- Provider retries are manual in this slice; requests have one deadline and no automatic duplicate spend.

See [architecture](docs/ARCHITECTURE.md), [adding a mode](docs/ADDING_A_MODE.md), [credits](CREDITS.md), and the [full implementation plan](CHROME_EXTENSION_IMPLEMENTATION_PLAN.md).

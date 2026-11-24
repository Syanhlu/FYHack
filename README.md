# WingMan

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
2. Select **`apps/extension/.output/chrome-mv3`**. Pin WingMan in the toolbar.
3. Copy its extension ID into `.env` as `ALLOWED_EXTENSION_ORIGIN=chrome-extension://YOUR_ID`.
4. Set `OPENAI_API_KEY` and `OPENAI_MODEL` in that same root `.env`. Choose a model in your account that supports Structured Outputs; the implementation does not assume a particular account/model entitlement.
5. Run `pnpm demo`. It starts the live API on **127.0.0.1:8787** and the sample pages on **localhost:4173**. Internet access/provider credits are required for AI generation.
6. If `BACKEND_ACCESS_TOKEN` is blank, the terminal prints a freshly generated **local connection token**. If you set it in `.env`, copy that value instead; the server does not print it. Open the extension's settings, paste it into **Backend token**, and select **Check & save**. This token is separate from the OpenAI key. Set a random value of at least 24 characters in `.env` to retain the same local token across API restarts.
7. Visit **http://localhost:4173**, click the extension's toolbar icon, and select **Read this profile**. Review the snippets and generate. Switch modes to try the same profile from another angle.

The OpenAI key stays in the server environment. Do not paste it into the extension. Credentials are not included in this repository. The server exits with a setup explanation when credentials, model, or extension origin are missing.

## What is implemented

- WXT / React / TypeScript Manifest V3 extension with a movable in-page overlay and temporary `activeTab` extraction.
- Generic individual-profile extraction, best-effort LinkedIn and Instagram adapters, and manual paste fallback. LinkedIn capture scrolls, expands section text and dialogs, and attempts same-profile Show all detail views.
- Optional automatic Instagram photo analysis: up to 50 unique photos from opened posts and carousels, local cropping, bounded scrolling, three-photo batches, Stop, and automatically included visual/OCR evidence.
- Editable/removable evidence, optional user context, mode-specific preferences, and source drawers.
- Detail-led analysis: distinctive clues, connections between supported statements, and natural questions. Personality-related notes describe only the person's own self-descriptions and motivations; photos supply observable details, not personality judgements.
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
pnpm eval:images          # opt-in paid image smoke check using a generated fixture
pnpm package:demo         # zip the normal live extension; no credentials
```

Browser tests serve sample pages on port 4173 and route API requests to isolated test instances; they do not bind the development API port. Browser tests use an ephemeral profile and never interact with your personal browser profile.

`test:e2e` builds with an additional **test-only localhost host permission** so Chromium can exercise injection without automating Chrome's toolbar. **Always run `pnpm build` afterward** before loading the extension for ordinary use. Test output is in `test-results/` and is gitignored.

WXT's development build may have a different extension ID and extra hot-reload permissions. Configure that exact ID in `.env` when using it. Prefer the production build and `pnpm demo` for a presentation.

Tested toolchain: Node **26.5.0** for the initial implementation and **24.22.3** for clean-checkout validation; pnpm **10.28.0**, TypeScript **5.9.3**, WXT **0.21.5**, React **19.3.1**, Fastify **5.12.8**, OpenAI SDK **7.62.0**, Zod **4.6.7**, Playwright **1.65.1**. Node 24 is the recommended setup and passed the frozen-lockfile install, build, typecheck, lint, 33 unit/component tests and 3 browser integration tests on macOS. Windows and Linux setup instructions are included; native execution on those operating systems has not been verified here.

## Data handling

Reading profile text stays local until **Generate ideas**. Reviewed evidence and optional context then go to the local API and OpenAI. The separate **Analyse profile images** action sends locally cropped photo pixels to the same backend/provider before observation review. Full-page screenshots and page/CDN URLs are not sent. Contact redaction of OCR does not remove contact details from image pixels. The API uses `store: false`; this is not a promise of zero provider retention. No application profile database, analytics, body/prompt logging, or background crawling is implemented.

Profile snapshots, results, and edited drafts live in panel memory and disappear when the panel document closes, the profile changes, the session expires, or **Clear session** is used. The backend token is in trusted extension session storage. Only opted-in self-context is saved in local storage. **Reset local settings** removes both settings and the token.

Extraction is intentionally conservative and excludes hidden content, forms, sidebars, and obvious third-party comments. Contact-detail filtering and age/boundary prechecks are limited heuristics, not perfect classifiers; review the retained text. Semantic citation accuracy still needs human review. The song and visual vibe are creative interpretations, not claims about someone's taste or personality.

## Current limitations

- Live smoke checks passed for both modes using `gpt-5.4-mini`. The installed Chrome extension also completed a live Outreach analysis from the fictional sample page. This verifies that the integration works; broader factual and suggestion-quality evaluation remains in [the demo runbook](docs/DEMO_SCRIPT.md).
- Native Chrome installation, toolbar access, side-panel extraction, local authentication, and Outreach generation have been verified. Continue the remaining tab/domain, restricted-page, and accessibility checks before presenting.
- LinkedIn and Instagram extraction are best-effort and have not been verified against real logged-in accounts. LinkedIn capture takes up to roughly a minute, restores the original scroll position, and reports blocked or unfinished sections. Detail pages are rendered in temporary same-origin frames; LinkedIn may block these. LinkedIn evidence is capped at 120 snippets / 60,000 characters with a visible truncation notice. Other adapters and manual paste retain their 30-snippet / 12,000-character capture limits. Instagram reads visible profile-header bio text only after matching the username to the profile URL; feeds, posts, reels, stories, and tagged pages are unsupported. Text capture does not read photos, captions, or comments. Optional photo analysis opens posts from the profile grid and advances their photo carousels. Reels and stories are excluded. Post controls currently require recognisable English labels and a modal layout; unsupported layouts stop with an explanation. Use a personal page or paste text when parsing fails.
- Boards use original editorial illustrations, not generated photos or scraped profile photos. The music catalogue is deliberately small (two artists) and can be extended in `packages/catalogues`.
- Panel state is memory-only; closing and reopening the panel may require another capture. No result history or remote persistence.
- Provider retries are manual in this slice; requests have one deadline and no automatic duplicate spend.

See [architecture](docs/ARCHITECTURE.md), [adding a mode](docs/ADDING_A_MODE.md), [credits](CREDITS.md), and the [full implementation plan](CHROME_EXTENSION_IMPLEMENTATION_PLAN.md).

## Enable automatic photo analysis

Set `IMAGE_ANALYSIS_ENABLED=true` in your local `.env`, and set `OPENAI_IMAGE_MODEL` to a model with image input and structured output support (otherwise it uses `OPENAI_MODEL`). Restart the API, rebuild/reload the extension, and read an Instagram profile. Select **Analyse profile images**, keep Instagram visible while it opens posts and scrolls, completed observations are automatically included as evidence. Expand **Photo analyses** to see the original photos, or **Their photo evidence** to edit or remove observations before generating ideas. No manual uploads or approval clicks are needed. The input form separates **Their profile text** and **Their photo evidence** from **About you** and **Your preferences for this conversation**; CV uploads always describe you.

Before starting, use **Maximum photos** to choose 1–50 photos (default 50). The limit stays fixed for that run, includes individual carousel slides, and appears in the progress counter. Re-read the profile to start another run.

A run opens posts from the captured profile, advances up to 20 photo slides per post, closes each post, and scrolls the grid for more. Progress shows captured, analysed and skipped counts, with reasons for skipped photos. It inspects at most 50 unique usable photos in batches of three, then returns to the profile when its Close control is available. Photos are analysed as displayed, including overlays within the image area. It may finish earlier when the grid ends, a browsing limit is reached, or you interact with the page. **Stop photo analysis** preserves completed observations; Clear session or changing profiles removes them. Capture still requires the toolbar-granted `activeTab` permission; no additional host permissions were added.

The example configuration recommends `gpt-5.4` with `OPENAI_REASONING_EFFORT=low` for responsive text generation and `OPENAI_IMAGE_REASONING_EFFORT=medium` for photo details. Photo calls use high-detail vision to retain small visible clues. `OPENAI_IMAGE_MODEL` can override the text model, and `OPENAI_IMAGE_REASONING_EFFORT` can override its reasoning effort. Leave both effort settings blank for a model without configurable reasoning. Supported effort values are `none`, `low`, `medium`, and `high`; check that your chosen model supports the value. The default deadline is 60 seconds, with 8,000 output tokens for text and 4,000 for each image batch (including reasoning tokens). More reasoning may increase latency and cost. Restart the API after changing `.env`.

`IMAGE_BATCH_BUDGET_USD` (default `0.10`) reserves an estimated amount before each paid batch, including failed attempts. `IMAGE_RUN_BUDGET_USD` (default `2`) caps those reservations. Set a conservative batch estimate for your model's current prices: this is an application estimate, not a provider-enforced dollar limit. If the local image backend is busy, the extension keeps the current batch in memory and retries with increasing delays for up to two minutes. A countdown shows the wait, and Stop cancels it immediately. Only a busy response issued before the backend accepts the batch is retried; network errors, provider failures and timeouts stop the run to avoid duplicate paid work. Image analysis is disabled by default pending verification on the target account/browser.

See [implementation details and remaining validation](docs/IMAGE_ANALYSIS_PLAN.md).

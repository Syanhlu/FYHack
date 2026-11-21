# Implementation validation

Validated on macOS on 21 November 2026 using Node 26.5.0 initially, followed by clean-checkout validation under Node 24.22.3 and pnpm 10.28.0.

| Check | Observed result |
| --- | --- |
| Strict TypeScript, including extension entrypoints | Passed |
| Production build and package | Passed; four required permissions, loopback API host only, no test permission or test credentials |
| ESLint | Passed |
| Vitest | 33 tests passed: contracts, extraction, API/auth/errors, and UI copy/source behaviour |
| Playwright Chromium | 3 tests passed: both mode flows, packaged DOM extraction + same-URL invalidation, and edited-input/cache/network error behaviour |
| Structured output schemas | Both modes compile through the actual OpenAI SDK Zod helper |
| UI inspection | Welcome and both result views inspected; automated overflow checks at 320, 400, and 600 pixels |
| Missing-configuration handling | API startup and live evaluation exit with actionable setup messages |
| Paid live AI generation | Passed with `gpt-5.4-mini`: Outreach 4,987 ms and Romantic Pursue 5,683 ms; schema and reference checks passed |
| Native Chrome toolbar/side panel gestures | Passed: unpacked install, toolbar pin, activeTab grant, five-snippet capture from the fictional Alex page, and live Outreach result in the actual side panel |
| Local backend authentication | Passed from the installed extension; exact extension origin and session token configured |
| Real logged-in LinkedIn profile | Not verified; best-effort adapter only |
| Clean checkout under Node 24.22.3 | Frozen-lockfile install, production build, strict TypeScript, lint, all 33 unit/component tests and all 3 browser integration tests passed |
| Windows/Linux portability | Setup instructions provided and Unix-only test-build environment assignment replaced with a Node launcher; native OS execution not verified here |

Browser tests use **test-only provider doubles**. They validate application behaviour, rendering, and browser integration, not live AI factual quality. No fallback provider is included in the actual application.

## UI captures

These screenshots were captured from the built extension in isolated Chromium. Result text comes from test doubles, not a live model:

- [Welcome](screenshots/welcome.png)
- [Outreach result](screenshots/outreach.png)
- [Romantic Pursue result](screenshots/romantic.png)

## Local setup verification

The production extension is installed as `mdnmjgfhjaoeagkikigbpaojjpokpklo`. Its exact origin is configured in the ignored root `.env`, alongside the provider key, model and a generated local connection token. No secret values are recorded here.

The native check revealed that automatic panel toggling opened the panel without granting page access. The background worker now handles the toolbar action explicitly and opens the panel from that gesture. Chrome then reported page access, and extraction succeeded without adding host permissions. Build, strict TypeScript and lint passed after the correction.

An initial live Outreach evaluation failed the invitation's minimum word count. The prompt was clarified without weakening validation; both mode evaluations then passed. The installed extension generated a live Outreach board, cited conversation starters and two editable drafts. Romantic Pursue's native panel flow has automated Chromium coverage and a passing live provider evaluation, but was not manually generated in the personal Chrome profile during setup.

The dedicated Chrome window is named **Profile Lens · Hackathon**. The local API runs at `http://127.0.0.1:8787` and the fictional profiles at `http://localhost:4173`. Restart both with `pnpm demo` (or `npx --yes pnpm@10.28.0 demo`) after stopping existing servers. Chrome reloads/restarts clear the connection token from extension session storage; reconnect using `BACKEND_ACCESS_TOKEN` from `.env` when needed.

Follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for the remaining native Chrome, real-site and quality checks before presenting.

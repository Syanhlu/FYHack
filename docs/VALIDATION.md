# Implementation validation

Validated on macOS on 21 November 2026 using Node 26.5.0 initially, followed by clean-checkout validation under Node 24.22.3 and pnpm 10.28.0.

| Check                                              | Observed result                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Strict TypeScript, including extension entrypoints | Passed                                                                                                                                                       |
| Production build and package                       | Passed; four required permissions, loopback API host only, no test permission or test credentials                                                            |
| ESLint                                             | Passed                                                                                                                                                       |
| Vitest                                             | 33 tests passed: contracts, extraction, API/auth/errors, and UI copy/source behaviour                                                                        |
| Playwright Chromium                                | 3 tests passed: both mode flows, packaged DOM extraction + same-URL invalidation, and edited-input/cache/network error behaviour                             |
| Structured output schemas                          | Both modes compile through the actual OpenAI SDK Zod helper                                                                                                  |
| UI inspection                                      | Welcome and both result views inspected; automated overflow checks at 320, 400, and 600 pixels                                                               |
| Missing-configuration handling                     | API startup and live evaluation exit with actionable setup messages                                                                                          |
| Paid live AI generation                            | Passed with `gpt-5.4-mini`: Outreach 4,987 ms and Romantic Pursue 5,683 ms; schema and reference checks passed                                               |
| Native Chrome toolbar/side panel gestures          | Passed: unpacked install, toolbar pin, activeTab grant, five-snippet capture from the fictional Alex page, and live Outreach result in the actual side panel |
| Local backend authentication                       | Passed from the installed extension; exact extension origin and session token configured                                                                     |
| Real logged-in LinkedIn profile                    | Not verified; best-effort adapter only                                                                                                                       |
| Real logged-in Instagram profile                   | Not verified; synthetic header/bio tests only                                                                                                                |
| Clean checkout under Node 24.22.3                  | Frozen-lockfile install, production build, strict TypeScript, lint, all 33 unit/component tests and all 3 browser integration tests passed                   |
| Windows/Linux portability                          | Setup instructions provided and Unix-only test-build environment assignment replaced with a Node launcher; native OS execution not verified here             |

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

## LinkedIn expansion update

Synthetic coverage verifies nested headings, stable section anchors with translated headings, headline/location fields, delayed loading, inline expansion, Show all dialogs, same-profile detail views, failed detail loads, route/identity changes, and bounded evidence. A Chromium fixture runs the bundled reader against intercepted LinkedIn-shaped pages and verifies scrolling, expansion, detail-frame capture, exclusion of activity, frame cleanup, and restoration of scroll position. No real LinkedIn account is contacted.

The full browser suite was attempted during this update: the new LinkedIn test passed; the three existing API-backed flows could not start because port 8787 was already occupied. The running server was left untouched.

## Automatic image analysis

The synthetic Chromium photo test passed: profile-grid post discovery, opening a post modal, advancing a carousel, scrolling to a later post, local screenshot cropping of larger media, API delivery of photo pixels only, and return to the profile with scroll restoration. It also verifies cancellation, stale-run rejection, and rejection of navigation to unrelated posts. The live image-provider smoke check passed with `gpt-5.4-mini` using a generated pottery illustration (two validated observations, about 3.5 seconds). No personal/profile photos were sent in this check. Real logged-in Instagram layout and toolbar-granted capture remain unverified.

The zero-photo capture regression update passed 111 unit tests and all 13 Chromium tests. Photo fixtures cover article/div dialogs, unchanged profile URLs, delayed image loading, pointer-events wrappers, transparent overlays, preloaded off-screen slides, partially clipped photos, and rejection of opaque overlays. Capture progress distinguishes captured, analysed and skipped photos; service tests verify retries for moving photos stop after three attempts. These are synthetic fixtures, not verification against a logged-in Instagram account. API-backed browser flows use isolated in-process APIs and no longer compete with the running server on port 8787.

The carousel timing regression reproduced capture starting during a 1.6-second slide animation. The controller now waits for 500 milliseconds of stable image source, full bounds and clipped crop; capture retries also pause for 250 milliseconds. The animated fixture captures both carousel slides and the next post with zero skips, and asserts that no viewport capture starts during animation. All 14 Chromium tests, 111 unit tests and lint passed after this change. Real logged-in Instagram remains unverified.

The carousel-controls overlay regression reproduced capture of the first slide while rejecting the second slide when a transparent overlay contained a Previous button. Recognition now permits that control inside the transparent layer; the new Chromium fixture captures both slides, while the opaque-overlay fixture still rejects obscured photos. All 15 Chromium tests passed. UI coverage verifies grouped skip reasons remain visible after stop, completion and errors.

The obstruction-filter update reproduced zero captures for offset transparent layers, partial-size transparent layers, and transparent wrappers containing text outside the crop. Those three fixtures now capture all photos; opaque overlays and text over the photo remain rejected. Skip reasons now name the obstruction category without exposing DOM text or URLs. All 19 Chromium tests, 114 unit tests and lint passed. The exact live Instagram overlay remains unverified without browser access.

Overlay cropping now keeps a clear rectangle instead of rejecting the whole photo when a usable area remains. Chromium fixtures cover top and side panels, pointer-events-disabled panels, inset shadows, and text over the photo. Pixel checks verify that the magenta test overlays are absent from submitted crops, and review metadata marks partial crops. Full-cover overlays and central blocks leaving less than half the photo in any usable rectangle still skip. All 24 Chromium tests, 114 unit tests, lint and TypeScript checks passed; the updated partial-crop UI assertion also passed. This validates synthetic layouts, not the user’s live Instagram account.

At the user’s request, capture requirements were relaxed: 25% image visibility, 96×96-pixel minimum visible/crop dimensions, 20% retained crop area, two-pixel geometry tolerance with intersection cropping, light background overlays up to 35% opacity, and small SVG icons. The previously rejected central obstruction now yields a partial crop. All 27 Chromium tests passed, including light-overlay, mostly-clipped and small-icon fixtures; all 114 unit tests, lint and TypeScript checks passed. Fully opaque covers are still rejected. Real logged-in Instagram remains unverified.

Current overlay policy: at the user’s explicit request, all overlay checks and unobstructed-subcrop searches have been removed. The crop is the visible image rectangle as rendered, including any covering controls, text or panels. All 27 Chromium tests passed. Photo fixtures now capture all three photos with zero skips, including fully opaque overlays. Pixel assertions verify that overlay pixels remain in the image crop while the surrounding blue page is excluded. All 114 unit tests, lint and TypeScript checks passed. The earlier overlay-rejection and subcrop results above describe superseded behavior. Real logged-in Instagram remains unverified.

The integration merge retains Instagram/photo analysis alongside the incoming CV upload and movable in-page panel. Conflicts in shared prompts and quote validation preserve both CV context handling and visual-evidence provenance rules. Tests now model the embedded panel’s tab resolution; a Chromium test injects the real overlay and reads its containing profile tab. All 120 unit tests, 28 Chromium tests and lint passed.


## Detail-led analysis and model upgrade

The analysis now prioritises distinctive details, supported connections, and questions about choices or processes. Personality-related notes must stay attributed to explicit self-descriptions or motivations in profile text. Visual evidence remains observable details rather than personality or ownership claims. Manual review of a fictional profile caught an overextended self-description; the prompt now explicitly prohibits adding adjacent traits.

The recommended and local configuration uses `gpt-5.4`, low reasoning for text and medium reasoning for photos, high-detail image input, 8,000/4,000 output-token limits, and a 60-second server deadline. The extension's text deadline was raised from 30 to 65 seconds so it can receive the server response. Medium text reasoning passed but took 51–58 seconds; low reasoning passed at approximately 17–29 seconds, including a final check of both modes after refining the prompt. These are small-fixture measurements, not latency guarantees. The generated pottery illustration produced two correctly referenced observations in about 4.5 seconds; no personal photos were used.

Validation: 127 unit/API/component/provider tests passed, including requests through the real SDK serializer/parser with a stubbed network. The four Chromium flow tests passed, including both modes, sources/drafts, invalidation, and the embedded panel. Production build, strict TypeScript and lint passed. The production build was restored after browser tests. These checks do not verify a real logged-in Instagram session or guarantee semantic accuracy for arbitrary profiles.


## Automatic photo inclusion and input ownership

Completed photo observations are automatically included in each batch, with visual provenance and uncertainty retained. Photo analyses and photo evidence have separate collapsed groups; evidence can still be edited or removed. The form explicitly separates the profile owner's text/photos from the user's background, CV and conversation preferences. The input form was inspected in Chromium.

All 141 unit/API/component tests passed. A full panel integration test delivers 50 synthetic photos with 150 observations across multiple batches and verifies that auto-inclusion does not cancel its own run, lose earlier batches, mix user context into profile evidence, or re-add removed observations. Contract checks permit 150 visual observations alongside the existing 120-snippet/60,000-character profile-text limits; the request byte limit is now 1 MiB. Four Chromium flow tests, lint, strict TypeScript and the production build passed. No personal photos or live provider calls were used for this change.


## Busy photo batch buffering

The API now distinguishes a busy rejection before acceptance (`PHOTO_ANALYSIS_BUSY`, 429) and supplies a retry delay. The extension retains only the current batch and retries identical IDs/pixels with bounded backoff and a countdown for up to two minutes. Stop and profile/page changes prevent resubmission. Ambiguous network/provider failures and timeouts are not retried. Busy rejections do not reserve attempts or budget.

All 150 unit/API/component tests passed, including eventual success, preserved earlier results, cancellation, profile changes, sustained busy responses, identical retries, cooldown hints, and budget accounting. Two targeted Chromium tests passed: the normal photo flow and a busy response followed by a successful retry with a live countdown, exactly three captures and one accepted batch. Lint, strict TypeScript and the production build passed. This used synthetic Instagram pages and provider doubles, not personal photos or a paid provider call.

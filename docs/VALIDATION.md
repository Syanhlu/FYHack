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

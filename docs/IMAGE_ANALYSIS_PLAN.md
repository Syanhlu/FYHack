# Image analysis implementation

Status: implemented behind `IMAGE_ANALYSIS_ENABLED=true`. Real logged-in Instagram layout and toolbar-granted capture remain manual validation steps. Synthetic Chromium fixtures exercise post opening, carousel navigation, scrolling, local cropping, API delivery, interruption, identity checks, and return to the profile.

## User flow

Read an Instagram profile, then select **Analyse profile images**. Profile Lens opens a post discovered in that profile's grid, inspects the larger photo, advances through its photo carousel, closes the post, and continues down the grid. No manual downloads or uploads are required. Progress and **Stop photo analysis** remain available in the panel. Keep the Instagram tab/window active and avoid interacting with the page during the run.

The cap is **50 unique photos per run**, processed in batches of three. Each post contributes at most 20 slides. Navigation is bounded by 200 opened posts, 250 advances, 60 grid scrolls, and five minutes of active discovery time (excluding provider waits). Three grid scrolls without a new post end discovery. A completed or stopped run closes its owned post and restores the original scroll position when safe; if closing fails, the panel reports the failure. It never navigates back from an unrelated page or closes an unrelated post.

Expand the collapsed **Photo analyses** to view thumbnails, visual observations, and OCR text; edit or remove included details under **Their photo evidence**. Completed observations automatically become visual evidence for **Generate ideas**, retaining source-image references and uncertainty. Photo observations do not establish the owner's identity, age, sensitive traits, personality, preferences, or ownership of depicted objects. Existing adult confirmation, text requirements, and contact boundaries still apply.

## Capture and navigation

A verified Instagram header can start photo analysis even when its bio is empty or cannot be read. The snapshot contains no invented text evidence and displays a warning; the username must still match the profile URL. Nested bio spans are kept together, and short bio text still contributes to eligibility checks.

`apps/extension/src/extraction/images.ts` owns post discovery, modal/carousel controls, and restoration. Only same-origin `/p/...` or `/<profile-username>/p/...` links found in the captured profile's main grid are opened. Username-prefixed links must match the captured profile; both forms are deduplicated by post code. Boxless (`display: contents`) links use their visible thumbnail bounds for discovery. Headers, sidebars, recommendations, stories, and reel links are excluded. Only the dominant loaded post image inside the owned visible dialog is considered (an article wrapper is optional); avatars and linked thumbnails are excluded. Selection uses visible area after viewport and overflow clipping, so off-screen preloaded slides are excluded. At least 25% of the image and a 96×96-pixel area must be visible. Only that visible portion is cropped.

Capture uses the image’s visible rectangle as displayed on screen. Overlay inspection, hit testing, opacity thresholds and searching for an unobstructed sub-crop have been removed. Controls, shadows, text and covering panels within that rectangle remain in the submitted pixels and do not cause a skip. Content outside the photo rectangle is not included.

Instagram may change the URL while opening a modal. The snapshot listener allows only the specific post route that the run opened, while the original profile header remains attached and unchanged. Brief bounded transitions are allowed while that modal opens. Layouts that retain the profile URL are supported by binding the newly opened dialog to the specific post click. After opening a photo or changing carousel slides, the image source must remain unchanged and image/crop geometry must stay within two pixels for 500 milliseconds before capture proceeds. Opening and closing have 10-second deadlines; image and carousel loading have 15-second deadlines, with distinct error messages for each step. Arbitrary post/profile navigation still invalidates the session. Full-page link navigation is prevented when Instagram does not handle the click as a modal. Current controls recognise English Next/Previous/Close labels; unsupported layouts stop rather than blindly clicking.

The panel captures the active viewport and crops the photo locally. It checks active tab/window, owner identity, source and geometry around each capture. Up to two pixels of image movement are tolerated; the screenshot is cropped to the intersection of the checked image rectangles. Only the crop reaches the API; full screenshots and page/CDN URLs are not sent. Crops are JPEG, at most 1,024 pixels on the longest edge and 1 MiB encoded; viewport decoding is capped at 20 megapixels. Capture calls are spaced at least 600 milliseconds apart. A moving photo gets up to three capture attempts, with 250-millisecond pauses before retrying, before being skipped. Progress distinguishes captured crops from completed AI analysis. A separate “Why photos were skipped” list groups reasons with counts and remains visible during browsing and after stop, completion or error. Crops are discarded after a batch, while small thumbnails remain in panel memory.

## API and model

`apps/api/src/images.ts` creates authenticated expiring run IDs and accepts three-photo batches through `/v1/analyse-images`. It decodes and validates actual pixels with Sharp, strips metadata, rejects duplicate IDs/content/batches, and enforces a 50-photo ceiling and 17-attempt ceiling. Image requests have a separate 5 MiB limit. The text endpoint accepts up to 1 MiB, retaining the 120-snippet/60,000-character limit for profile text plus up to 150 photo observations (600 characters each), so all three observations from each of 50 photos can be included; the shared contract version is `2`.

`providers/images.ts` sends cropped image bytes to the configured OpenAI image model with high-detail image input and structured outputs. It requests observable scene details and legible text, with uncertainty, and treats image text as untrusted input. The server validates references and redacts contact details from returned text. This text redaction does not remove information from image pixels sent to the provider.

One batch runs at a time, paced at least seven seconds apart. Deadlines, cancellation, and no automatic retries limit requests. `IMAGE_BATCH_BUDGET_USD` reserves a configurable estimated amount before every provider attempt, including failed attempts; `IMAGE_RUN_BUDGET_USD` caps those reservations. These are deployment estimates, not provider-enforced dollar limits. Server defaults are $0.10 per batch and $2 per run; set them conservatively for the chosen model's current prices.

## Lifecycle and privacy

Images are sent only after **Analyse profile images**. The provider uses `store: false`, which is not a promise of zero provider retention. The application does not persist image bytes, prompts, or observations in a database or logs. Small thumbnails and reviewed observations live in panel memory. Run counters and hashes expire after 30 minutes.

Stop preserves completed observations on the same profile. Changing profiles/modes, clearing the session, expiry, or closing the panel cancels work and clears relevant image state. Late responses are ignored. Re-read the profile to start a fresh run. No additional Chrome host permissions are introduced; capture uses toolbar-granted `activeTab` access.

## Verification and remaining limitations

- Unit/API/component tests cover 0/1/49/50/over-50-photo runs, batching, duplicates, image validation, deadlines, budgets, expiry, automatic inclusion, editing/removal, visual provenance, cancellation, and stale geometry.
- Chromium fixtures cover opening posts, stepping through a carousel, scrolling to another post, cropping larger media without comments/page background, restoring the profile, interruption, stale-run isolation, and unrelated navigation. Regression fixtures include article-free dialogs, unchanged profile URLs, and image loading longer than the former three-second deadline.
- `pnpm eval:images` is an opt-in paid smoke check using a generated pottery illustration. It passed with `gpt-5.4` and medium reasoning (two observations, about 4.5 seconds). No personal photos are used in the smoke check.
- Real Instagram layouts, localisation, mixed video/photo carousels, and broader output quality need manual evaluation. Video analysis, stories, hidden media, full-page post layouts, and bypassing access restrictions are outside this implementation.

References: [Chrome capture permissions and limits](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab), [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision), [Sharp validation](https://sharp.pixelplumbing.com/api-constructor/).

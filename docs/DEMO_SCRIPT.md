# Live demo and manual smoke check

## Before the presentation

1. Run `pnpm build`, load that production output, and confirm the API allowlisted origin matches its extension ID.
2. Configure the root `.env`, run `pnpm demo`, and connect the local token in extension settings.
3. Run `pnpm eval:live` with your own provider credentials. It uses synthetic input and costs API tokens. Inspect real outputs manually afterward; schema checks alone do not prove good prose.
4. Open `http://localhost:4173`, verify connectivity and credits, and rehearse the two modes with fresh calls. No saved-response mode is implemented.

## Three-minute story

- Open Alex's fictional profile. Explain that the source is a sample but analysis is generated live.
- Click the toolbar icon and **Read this profile**. Review a snippet and optionally enter your own project context.
- Generate Outreach. Show the professional board, an opener, its exact source, and an editable coffee-chat draft.
- Switch to Romantic Pursue. Confirm the fictional adult eligibility, then generate date ideas and the warm board/song.
- Edit a draft and copy it. Open the song's search link only if useful; nothing autoplays.
- Switch the source page to Jamie or Sparse profile. Show that stale results are cleared rather than attached to a different person.

If live extraction fails on a third-party site, use pasted visible text and continue with real AI. Only consider a labelled saved-result fallback later if actual rehearsal failures warrant it.

## Native Chrome checks

These are not covered merely by opening `panel.html` in Playwright:

- Verified during setup: toolbar action opened the earlier side panel (since replaced by an in-page overlay, not yet re-verified by hand) and granted `activeTab` for the selected page; the fictional Alex profile was extracted and generated live.
- On a different tab/domain, the panel explains when toolbar invocation is needed again.
- Reading a restricted `chrome://` page fails cleanly and offers paste input.
- Capture and review never trigger an AI request; Generate does.
- Profile/route/tab changes and tab closure clear results; closing the panel aborts or detaches its pending work safely.
- Source text, copy actions, keyboard focus and layouts work at narrow panel widths and at 200% zoom.
- No blank/missing assets, incidental horizontal scrolling, or silent saved-output fallback.

## Observed validation vs pending checks

Automated tests use isolated Chromium and test-only provider doubles. Their screenshots demonstrate the UI, not live generation quality. Both paid live-model mode evaluations and the native Chrome Outreach flow passed during local setup on 21 November 2026; see [VALIDATION.md](VALIDATION.md). The remaining checks above still need rehearsal on the presentation machine.

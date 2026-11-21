# Adding a mode

1. In `packages/contracts/src/index.ts`, define a bounded result schema and a strict configuration schema; register both in `modeSchemas`. `ModeId` is derived from this object.
2. Add a `ServerMode` to `apps/api/src/modes/index.ts` using the same ID/version. Supply instructions, input eligibility, and any additional semantic validation. Return blocked/insufficient outcomes with `result: null`.
3. Add its input component and result renderer to `apps/extension/src/modes/index.tsx`. Supply `defaults`, `inputIssue`, icon, theme, and labels. Parse the unknown response with the mode's result schema before rendering.
4. Reuse `Sources`, `DraftCard`, and `MoodboardView`; add catalogue entries if the subject needs them. Keep model-generated URLs and HTML out of the result contract.
5. Add API and renderer tests. `tests/api.test.ts` registers a test-only mentorship mode to demonstrate endpoint extensibility. Add a live smoke case in `scripts/eval-live.ts` with synthetic input.

No extraction, HTTP-client, shared orchestration, or navigation-lifecycle changes should be necessary. A genuinely different workflow may require an explicit contract change instead of forcing it through the current profile-analysis abstraction.

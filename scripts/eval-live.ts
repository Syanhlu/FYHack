import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { manualProfile, modeSchemas, type AnalysisRequest } from '../packages/contracts/src';
import { serverModes, validateOutcome } from '../apps/api/src/modes';
import { liveProvider } from '../apps/api/src/providers/live';
import { analysisSettings } from '../apps/api/src/providers/settings';

if (existsSync('.env')) loadEnvFile('.env');
const { timeoutMs, maxOutputTokens, reasoningEffort } = analysisSettings(process.env);
if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
  console.error(
    'Set OPENAI_API_KEY and OPENAI_MODEL in .env to run this paid, opt-in live smoke check.',
  );
  process.exit(1);
}
const provider = liveProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL,
  timeoutMs,
  maxOutputTokens,
  reasoningEffort,
});
const profile = manualProfile(
  'I am 29. I build accessible developer tools and mentor first-time open-source contributors. I love helping beginners feel comfortable asking questions.\nI enjoy pottery, especially testing glazes, cycling, second-hand bookshops, and finding good coffee. I describe myself as a quiet maker who prefers trying things together to big parties.',
  'Fictional Alex',
);
let failed = false;
for (const mode of Object.values(serverModes)) {
  const request: AnalysisRequest = {
    schemaVersion: '2',
    catalogueVersion: '1',
    requestId: crypto.randomUUID(),
    mode: mode.id,
    modeVersion: mode.version,
    profile,
    userContext: [],
    modeConfig:
      mode.id === 'outreach'
        ? {
            tone: 'friendly_professional',
            goal: 'Learn about accessible tools',
            meetingFormat: 'coffee_or_video',
          }
        : { adultConfirmedBoth: true, tone: 'warm', budget: 'low', settingPreference: 'either' },
  };
  const start = Date.now();
  try {
    const result = validateOutcome(
      mode,
      await provider.generate(mode, request, AbortSignal.timeout(timeoutMs)),
      request,
    );
    console.log(
      `${mode.id}: ${result.status}, ${Date.now() - start}ms, schema and reference checks passed`,
    );
    if (result.status !== 'ready') failed = true;
    else {
      const details =
        mode.id === 'outreach'
          ? modeSchemas.outreach.result.parse(result.result)
          : modeSchemas.romantic.result.parse(result.result);
      console.log(
        JSON.stringify({
          summary: details.summary,
          clues:
            'professionalInterests' in details ? details.professionalInterests : details.interests,
        }),
      );
    }
  } catch (error) {
    console.error(
      `${mode.id}: failed (${error instanceof Error ? error.message : 'unknown error'})`,
    );
    failed = true;
  }
}
console.log(
  'Structural checks do not prove semantic grounding. Review generated suggestions manually in the extension.',
);
process.exitCode = failed ? 1 : 0;

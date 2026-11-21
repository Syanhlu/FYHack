import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { manualProfile, type AnalysisRequest } from '../packages/contracts/src';
import { serverModes, validateOutcome } from '../apps/api/src/modes';
import { liveProvider } from '../apps/api/src/providers/live';

if (existsSync('.env')) loadEnvFile('.env');
if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
  console.error(
    'Set OPENAI_API_KEY and OPENAI_MODEL in .env to run this paid, opt-in live smoke check.',
  );
  process.exit(1);
}
const provider = liveProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL,
  timeoutMs: 25000,
  maxOutputTokens: 5000,
});
const profile = manualProfile(
  'I am 29. I build accessible developer tools and mentor first-time open-source contributors.\nI enjoy pottery, cycling, second-hand bookshops, and finding good coffee.',
  'Fictional Alex',
);
let failed = false;
for (const mode of Object.values(serverModes)) {
  const request: AnalysisRequest = {
    schemaVersion: '1',
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
      await provider.generate(mode, request, AbortSignal.timeout(25000)),
      request,
    );
    console.log(
      `${mode.id}: ${result.status}, ${Date.now() - start}ms, schema and reference checks passed`,
    );
    if (result.status !== 'ready') failed = true;
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

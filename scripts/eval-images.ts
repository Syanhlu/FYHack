import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import sharp from 'sharp';
import { SCHEMA_VERSION, imageOutcomeSchema } from '../packages/contracts/src';
import { imageProvider } from '../apps/api/src/providers/images';

// Opt-in paid smoke check. Sends only this generated fixture, never profile images.
if (existsSync('.env')) loadEnvFile('.env');
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_IMAGE_MODEL || process.env.OPENAI_MODEL;
if (!apiKey || !model)
  throw new Error(
    'Set OPENAI_API_KEY and OPENAI_IMAGE_MODEL (or OPENAI_MODEL) to run this paid smoke check.',
  );
const data = await sharp(
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
<rect width="512" height="512" fill="#fff8ee"/><text x="60" y="90" font-size="40">POTTERY CLUB</text>
<path d="M150 190 L170 370 Q256 410 342 370 L362 190Z" fill="#bd7048"/>
<ellipse cx="256" cy="190" rx="106" ry="30" fill="#85472d"/>
</svg>`),
)
  .jpeg()
  .toBuffer();
const imageId = crypto.randomUUID();
const started = Date.now();
try {
  const result = imageOutcomeSchema.parse(
    await imageProvider({ apiKey, model, timeoutMs: 30000 }).generate(
      {
        schemaVersion: SCHEMA_VERSION,
        runId: crypto.randomUUID(),
        batchId: crypto.randomUUID(),
        snapshotId: crypto.randomUUID(),
        images: [{ id: imageId, dataUrl: `data:image/jpeg;base64,${data.toString('base64')}` }],
      },
      AbortSignal.timeout(35000),
    ),
  );
  if (
    result.status !== 'ready' ||
    !result.observations.length ||
    result.observations.some((o) => o.imageId !== imageId)
  )
    throw new Error('Synthetic image did not produce a valid ready result.');
  console.log(
    JSON.stringify({
      model,
      status: result.status,
      observations: result.observations.length,
      durationMs: Date.now() - started,
      imageBytes: data.length,
    }),
  );
} catch {
  console.error(
    'Image smoke check failed. Verify image input and structured output support, credentials, credits, and connectivity.',
  );
  process.exitCode = 1;
}

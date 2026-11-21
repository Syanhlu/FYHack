import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { buildApp } from './app';
import { liveProvider } from './providers/live';

const { OPENAI_API_KEY, OPENAI_MODEL, ALLOWED_EXTENSION_ORIGIN, BACKEND_ACCESS_TOKEN } =
  process.env;
if (
  !OPENAI_API_KEY ||
  !OPENAI_MODEL ||
  !/^chrome-extension:\/\/[a-p]{32}$/.test(ALLOWED_EXTENSION_ORIGIN ?? '')
) {
  console.error(
    'Setup needed: copy .env.example to .env, then set OPENAI_API_KEY, OPENAI_MODEL and ALLOWED_EXTENSION_ORIGIN (chrome-extension:// followed by the loaded extension ID).',
  );
  process.exit(1);
}
if (process.env.PROVIDER && process.env.PROVIDER !== 'live')
  throw new Error('Only the live provider is available.');
if (process.env.API_HOST && process.env.API_HOST !== '127.0.0.1')
  throw new Error('This local backend must bind to 127.0.0.1.');
const timeoutMs = Number(process.env.ANALYSIS_TIMEOUT_MS ?? 25000);
const maxOutputTokens = Number(process.env.MAX_OUTPUT_TOKENS ?? 5000);
if (
  !Number.isFinite(timeoutMs) ||
  timeoutMs < 1000 ||
  timeoutMs > 60000 ||
  !Number.isFinite(maxOutputTokens) ||
  maxOutputTokens < 500 ||
  maxOutputTokens > 10000
)
  throw new Error('Invalid analysis limits.');
const token = BACKEND_ACCESS_TOKEN || randomBytes(32).toString('base64url');
if (token.length < 24) throw new Error('BACKEND_ACCESS_TOKEN must contain at least 24 characters.');
const app = buildApp({
  token,
  allowedOrigin: ALLOWED_EXTENSION_ORIGIN!,
  timeoutMs,
  provider: liveProvider({
    apiKey: OPENAI_API_KEY,
    model: OPENAI_MODEL,
    timeoutMs,
    maxOutputTokens,
  }),
});
await app.listen({ host: '127.0.0.1', port: Number(process.env.API_PORT ?? 8787) });
console.log('Profile Lens live API ready at http://127.0.0.1:8787');
if (!BACKEND_ACCESS_TOKEN)
  console.log(`Local connection token (paste in extension Settings): ${token}`);
else console.log('Use the BACKEND_ACCESS_TOKEN from your local .env in extension Settings.');
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });

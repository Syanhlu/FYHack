import Fastify from 'fastify';
import cors from '@fastify/cors';
import { timingSafeEqual } from 'node:crypto';
import {
  CATALOGUE_VERSION,
  SCHEMA_VERSION,
  requestSchema,
  redactText,
  type Outcome,
} from '@profile-lens/contracts';
import { serverModes, validateOutcome, type ServerMode } from './modes/index';
import { ProviderFailure, type AnalysisProvider } from './providers/live';

export interface AppOptions {
  provider: AnalysisProvider;
  token: string;
  allowedOrigin: string;
  timeoutMs?: number;
  rateLimit?: number;
  modes?: Record<string, ServerMode>;
}
export function buildApp(options: AppOptions) {
  const app = Fastify({ bodyLimit: 512 * 1024, logger: false });
  const modes = options.modes ?? serverModes;
  const validToken = Buffer.from(`Bearer ${options.token}`);
  const recentRequests: number[] = [];
  const fail = (code: string, message: string, requestId: string, retryable = false) => ({
    error: { code, message, retryable },
    requestId,
  });
  app.register(cors, {
    origin: options.allowedOrigin,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
  });
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') return;
    const origin = request.headers.origin;
    if (origin && origin !== options.allowedOrigin)
      return reply
        .code(403)
        .send(fail('BACKEND_ACCESS_DENIED', 'This browser origin is not allowed.', request.id));
    if (request.method === 'OPTIONS') return;
    const supplied = Buffer.from(request.headers.authorization ?? '');
    if (supplied.length !== validToken.length || !timingSafeEqual(supplied, validToken))
      return reply
        .code(401)
        .send(fail('BACKEND_ACCESS_DENIED', 'Connect using the local backend token.', request.id));
  });
  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 400;
    const status = statusCode === 413 ? 413 : statusCode === 415 ? 415 : 400;
    reply
      .code(status)
      .send(
        fail(
          status === 413 ? 'INPUT_TOO_LARGE' : 'INVALID_INPUT',
          status === 413
            ? 'Reduce the profile text and try again.'
            : 'The request could not be read.',
          request.id,
        ),
      );
  });
  app.get('/health', async () => ({ ok: true }));
  app.get('/v1/capabilities', async () => ({
    provider: 'live',
    schemaVersion: SCHEMA_VERSION,
    catalogueVersion: CATALOGUE_VERSION,
    modes: Object.values(modes).map((m) => ({ id: m.id, version: m.version })),
  }));
  app.post('/v1/analyse', async (request, reply) => {
    if (!request.headers['content-type']?.startsWith('application/json'))
      return reply.code(415).send(fail('INVALID_INPUT', 'Send application/json.', request.id));
    const checked = requestSchema.safeParse(request.body);
    if (!checked.success)
      return reply
        .code(400)
        .send(
          fail(
            'INVALID_INPUT',
            'Review the profile and context; some fields are missing or too long.',
            request.id,
          ),
        );
    const input = checked.data;
    const mode = Object.hasOwn(modes, input.mode) ? modes[input.mode] : undefined;
    if (!mode)
      return reply
        .code(400)
        .send(fail('UNSUPPORTED_MODE', 'This mode is not available.', input.requestId));
    if (
      input.schemaVersion !== SCHEMA_VERSION ||
      input.catalogueVersion !== CATALOGUE_VERSION ||
      input.modeVersion !== mode.version
    )
      return reply
        .code(409)
        .send(
          fail(
            'VERSION_MISMATCH',
            'Reload matching extension and backend versions.',
            input.requestId,
          ),
        );
    if (!mode.configSchema.safeParse(input.modeConfig).success)
      return reply
        .code(400)
        .send(fail('INVALID_INPUT', 'Check the options for this mode.', input.requestId));
    input.profile.evidence = input.profile.evidence.map((e) => ({
      ...e,
      text: redactText(e.text),
    }));
    input.userContext = input.userContext.map((u) => ({ ...u, text: redactText(u.text) }));
    const envelope = (outcome: Outcome) => ({
      schemaVersion: SCHEMA_VERSION,
      catalogueVersion: CATALOGUE_VERSION,
      requestId: input.requestId,
      snapshotId: input.profile.snapshotId,
      mode: input.mode,
      modeVersion: mode.version,
      provider: 'live',
      generatedAt: new Date().toISOString(),
      ...outcome,
    });
    const gate = mode.eligibility(input);
    if (gate) return envelope(gate);
    if (!input.profile.evidence.some((e) => e.text.length >= 20))
      return envelope({
        status: 'insufficient',
        reason: 'Add a biography, project, or stated interest beyond just a name.',
        missingInformation: ['Meaningful profile information'],
        result: null,
      });
    const now = Date.now();
    while (recentRequests.length && recentRequests[0] < now - 60000) recentRequests.shift();
    if (recentRequests.length >= (options.rateLimit ?? 10))
      return reply
        .code(429)
        .send(
          fail(
            'RATE_LIMITED',
            'Please wait a minute before generating again.',
            input.requestId,
            true,
          ),
        );
    recentRequests.push(now);
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 25000;
    let timer: ReturnType<typeof setTimeout>;
    const disconnect = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    reply.raw.on('close', disconnect);
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new ProviderFailure(
              'ANALYSIS_TIMEOUT',
              504,
              'Analysis timed out. Your input is still available.',
            ),
          );
        }, timeoutMs);
      });
      const raw = await Promise.race([
        options.provider.generate(mode, input, controller.signal),
        deadline,
      ]);
      let result: Outcome;
      try {
        result = validateOutcome(mode, raw, input);
      } catch (error) {
        // Local diagnostics only: names the failed check, never the profile text.
        console.warn(
          `[${input.mode}] model output rejected: ${error instanceof Error ? error.message.slice(0, 500) : 'unknown'}`,
        );
        throw new ProviderFailure(
          'MODEL_OUTPUT_INVALID',
          502,
          'The result could not be verified against this profile. Please retry.',
        );
      }
      return envelope(result);
    } catch (error) {
      const failure =
        error instanceof ProviderFailure
          ? error
          : new ProviderFailure(
              'PROVIDER_UNAVAILABLE',
              503,
              'Analysis is unavailable. Check the backend and try again.',
            );
      return reply
        .code(failure.status)
        .send(fail(failure.code, failure.message, input.requestId, true));
    } finally {
      clearTimeout(timer!);
      reply.raw.off('close', disconnect);
    }
  });
  return app;
}

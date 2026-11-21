import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { wireSchema, type AnalysisRequest, type Outcome } from '@profile-lens/contracts';
import { promptFor, type ServerMode } from '../modes/index';

export interface AnalysisProvider {
  generate(mode: ServerMode, request: AnalysisRequest, signal: AbortSignal): Promise<unknown>;
}
export class ProviderFailure extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const formatForMode = (mode: ServerMode) =>
  zodTextFormat(wireSchema(mode.resultSchema), `profile_lens_${mode.id}`);
export function liveProvider(config: {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
}): AnalysisProvider {
  const client = new OpenAI({ apiKey: config.apiKey, maxRetries: 0, timeout: config.timeoutMs });
  return {
    async generate(mode, request, signal) {
      try {
        const response = await client.responses.parse(
          {
            model: config.model,
            store: false,
            input: promptFor(mode, request),
            max_output_tokens: config.maxOutputTokens,
            text: { format: formatForMode(mode) },
          },
          { signal },
        );
        if (
          response.output.some(
            (item) => item.type === 'message' && item.content.some((c) => c.type === 'refusal'),
          )
        ) {
          return {
            status: 'blocked',
            reason: 'The model could not provide this analysis. Try a different profile or mode.',
            missingInformation: [],
            result: null,
          } satisfies Outcome;
        }
        if (response.status !== 'completed' || !response.output_parsed)
          throw new ProviderFailure(
            'MODEL_OUTPUT_INVALID',
            502,
            'The model returned incomplete output. Please retry.',
          );
        return response.output_parsed;
      } catch (error) {
        if (error instanceof ProviderFailure) throw error;
        if (signal.aborted)
          throw new ProviderFailure(
            'ANALYSIS_TIMEOUT',
            504,
            'Analysis took too long. Your reviewed input is still available.',
          );
        if (error instanceof OpenAI.RateLimitError)
          throw new ProviderFailure(
            'RATE_LIMITED',
            429,
            'The AI provider is at its limit. Check credits or try again shortly.',
          );
        if (
          error instanceof SyntaxError ||
          (error instanceof Error && /ZodError|LengthFinishReasonError/.test(error.name))
        )
          throw new ProviderFailure(
            'MODEL_OUTPUT_INVALID',
            502,
            'The model returned an invalid result. Please retry.',
          );
        throw new ProviderFailure(
          'PROVIDER_UNAVAILABLE',
          503,
          'The AI provider is unavailable. Check the server credentials, model and network.',
        );
      }
    },
  };
}

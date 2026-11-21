import { z } from 'zod';

const effort = z.enum(['none', 'low', 'medium', 'high']);
export type ReasoningEffort = z.infer<typeof effort>;
const optionalEffort = z.preprocess((value) => value || undefined, effort.optional());

// Shared by the server and paid smoke checks so both exercise the same limits.
export function analysisSettings(env: Record<string, string | undefined>) {
  const parsed = z
    .object({
      ANALYSIS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(60000),
      MAX_OUTPUT_TOKENS: z.coerce.number().int().min(500).max(10000).default(8000),
      IMAGE_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(500).max(10000).default(4000),
      OPENAI_REASONING_EFFORT: optionalEffort,
      OPENAI_IMAGE_REASONING_EFFORT: optionalEffort,
    })
    .parse(env);
  return {
    timeoutMs: parsed.ANALYSIS_TIMEOUT_MS,
    maxOutputTokens: parsed.MAX_OUTPUT_TOKENS,
    imageMaxOutputTokens: parsed.IMAGE_MAX_OUTPUT_TOKENS,
    reasoningEffort: parsed.OPENAI_REASONING_EFFORT,
    imageReasoningEffort: parsed.OPENAI_IMAGE_REASONING_EFFORT ?? parsed.OPENAI_REASONING_EFFORT,
  };
}

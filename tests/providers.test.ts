import { afterEach, describe, expect, it, vi } from 'vitest';
import { imageProvider } from '../apps/api/src/providers/images';
import { liveProvider } from '../apps/api/src/providers/live';
import { analysisSettings } from '../apps/api/src/providers/settings';
import { serverModes } from '../apps/api/src/modes';
import { output, request } from './helpers';

afterEach(() => vi.unstubAllGlobals());

// Exercise the real SDK serializer/parser without a network call or credentials.
function respondWith(value: unknown) {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          id: 'test-response',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              status: 'completed',
              id: 'test-message',
              content: [{ type: 'output_text', text: JSON.stringify(value), annotations: [] }],
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const config = { apiKey: 'test-only', model: 'gpt-5.4', timeoutMs: 60000 };

describe('analysis providers', () => {
  it('sends high-detail images with reasoning and preserves per-image source IDs', async () => {
    const id = crypto.randomUUID();
    const result = {
      status: 'ready',
      reason: '',
      observations: [
        {
          imageId: id,
          kind: 'scene',
          text: 'A bowl beside glaze test tiles.',
          uncertainty: 'The maker is unknown.',
        },
      ],
      subjects: [{ imageId: id, subject: 'object' }],
    };
    const fetch = respondWith(result);
    const signal = new AbortController().signal;
    expect(
      await imageProvider({ ...config, reasoningEffort: 'medium', maxOutputTokens: 4000 }).generate(
        {
          schemaVersion: '2',
          runId: crypto.randomUUID(),
          batchId: crypto.randomUUID(),
          snapshotId: crypto.randomUUID(),
          images: [{ id, dataUrl: 'data:image/jpeg;base64,ZmFrZQ==' }],
        },
        signal,
      ),
    ).toEqual(result);
    const call = fetch.mock.calls[0] as unknown as [unknown, RequestInit];
    const body = JSON.parse(String(call[1].body));
    expect(body).toMatchObject({
      model: 'gpt-5.4',
      store: false,
      reasoning: { effort: 'medium' },
      max_output_tokens: 4000,
    });
    expect(body.input[1].content).toEqual([
      { type: 'input_text', text: `imageId: ${id}` },
      { type: 'input_image', image_url: 'data:image/jpeg;base64,ZmFrZQ==', detail: 'high' },
    ]);
  });

  it.each([undefined, 'medium'] as const)(
    'supports text reasoning effort %s without forcing it on other models',
    async (reasoningEffort) => {
      const result = output('outreach');
      const fetch = respondWith(result);
      expect(
        await liveProvider({ ...config, maxOutputTokens: 8000, reasoningEffort }).generate(
          serverModes.outreach,
          request(),
          new AbortController().signal,
        ),
      ).toEqual(result);
      const call = fetch.mock.calls[0] as unknown as [unknown, RequestInit];
      const body = JSON.parse(String(call[1].body));
      expect(body.max_output_tokens).toBe(8000);
      expect(body.reasoning).toEqual(reasoningEffort ? { effort: reasoningEffort } : undefined);
      expect(body.text.format.strict).toBe(true);
    },
  );

  it('inherits image effort but allows an explicit none override', () => {
    expect(analysisSettings({ OPENAI_REASONING_EFFORT: 'medium' }).imageReasoningEffort).toBe(
      'medium',
    );
    expect(
      analysisSettings({ OPENAI_REASONING_EFFORT: 'medium', OPENAI_IMAGE_REASONING_EFFORT: 'none' })
        .imageReasoningEffort,
    ).toBe('none');
    expect(analysisSettings({ OPENAI_REASONING_EFFORT: '' }).reasoningEffort).toBeUndefined();
    expect(() => analysisSettings({ OPENAI_REASONING_EFFORT: 'invalid' })).toThrow();
    expect(() => analysisSettings({ IMAGE_MAX_OUTPUT_TOKENS: '0' })).toThrow();
    expect(() => analysisSettings({ ANALYSIS_TIMEOUT_MS: '65000' })).toThrow();
  });
});

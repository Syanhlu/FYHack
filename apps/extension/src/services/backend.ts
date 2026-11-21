import { responseSchema, type AnalysisRequest } from '@profile-lens/contracts';

export const API_BASE = 'http://127.0.0.1:8787';
export async function checkConnection(token: string) {
  const response = await fetch(`${API_BASE}/v1/capabilities`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
    credentials: 'omit',
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? 'The local token was not accepted.'
        : 'Connection rejected. Check ALLOWED_EXTENSION_ORIGIN on the backend.',
    );
  return response.json() as Promise<{
    images?: { enabled: boolean; maxPhotos: number; batchSize: number };
    provider: string;
    schemaVersion: string;
    catalogueVersion: string;
    modes: Array<{ id: string; version: string }>;
  }>;
}
export async function analyse(request: AnalysisRequest, token: string, signal: AbortSignal) {
  const response = await fetch(`${API_BASE}/v1/analyse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(request),
    signal,
    credentials: 'omit',
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = body as { error?: { message?: string } };
    throw new Error(error.error?.message ?? 'Analysis could not be completed. Please retry.');
  }
  const parsed = responseSchema.parse(body);
  if (
    parsed.requestId !== request.requestId ||
    parsed.snapshotId !== request.profile.snapshotId ||
    parsed.mode !== request.mode ||
    parsed.modeVersion !== request.modeVersion
  )
    throw new Error('The backend returned a result for a different request.');
  return parsed;
}

import { z } from 'zod';

export const SCHEMA_VERSION = '1';
export const CATALOGUE_VERSION = '1';
export const SESSION_TTL = 30 * 60 * 1000;
const text = (max = 600) => z.string().trim().min(1).max(max);
const refs = z.array(text(40)).min(1).max(30);
const userRefs = z.array(text(40)).max(10);
export const evidenceSchema = z
  .object({
    id: text(40),
    text: text(),
    sourceKind: z.enum(['headline', 'bio', 'experience', 'project', 'post', 'manual']),
    attribution: z.enum(['profile_owner', 'user_supplied']),
    sectionLabel: text(80),
  })
  .strict();
export const eligibilitySignalsSchema = z
  .object({ minorMentioned: z.boolean(), noRomanticContact: z.boolean() })
  .strict();
export const profileSchema = z
  .object({
    snapshotId: z.string().uuid(),
    displayName: text(120).nullable(),
    evidence: z.array(evidenceSchema).max(120),
    truncated: z.boolean(),
    eligibilitySignals: eligibilitySignalsSchema,
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.evidence.reduce((n, e) => n + e.text.length, 0) > 60000)
      ctx.addIssue({ code: 'custom', message: 'Profile exceeds 60,000 characters.' });
    if (new Set(p.evidence.map((e) => e.id)).size !== p.evidence.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate evidence IDs.' });
  });
export const userContextSchema = z
  .array(
    z
      .object({
        id: text(40),
        kind: z.enum(['role', 'project', 'interest', 'goal', 'preference']),
        text: text(),
      })
      .strict(),
  )
  .max(10);
export const citedSchema = z.object({ text: text(900), evidenceIds: refs }).strict();
export const draftSchema = z
  .object({
    id: text(40),
    label: text(80),
    text: text(1200),
    evidenceIds: refs,
    userContextIds: userRefs,
  })
  .strict();
export const moodboardSchema = z
  .object({
    title: text(80),
    paletteId: text(40),
    aestheticTags: z.array(text(30)).min(1).max(5),
    tiles: z
      .array(
        z
          .object({
            id: text(40),
            kind: z.enum(['image', 'typography', 'quote', 'palette']),
            assetId: text(40).nullable(),
            title: text(60),
            caption: text(160),
            rationale: text(250),
            evidenceIds: refs,
            quoteText: text(200).nullable(),
          })
          .strict(),
      )
      .length(6),
  })
  .strict();
export const outreachResultSchema = z
  .object({
    summary: citedSchema,
    professionalInterests: z.array(citedSchema).min(1).max(5),
    commonGround: z.array(citedSchema.extend({ userContextIds: userRefs.min(1) }).strict()).max(3),
    conversationStarters: z
      .array(
        z
          .object({ question: text(300), rationale: citedSchema, userContextIds: userRefs })
          .strict(),
      )
      .min(1)
      .max(3),
    coffeeAgenda: z.array(citedSchema).min(1).max(3),
    drafts: z.array(draftSchema).min(1).max(2),
    moodboard: moodboardSchema,
  })
  .strict();
export const romanticResultSchema = z
  .object({
    summary: citedSchema,
    interests: z
      .array(citedSchema.extend({ kind: z.enum(['hobby', 'stated_habit', 'preference']) }).strict())
      .min(1)
      .max(5),
    dateIdeas: z
      .array(
        z
          .object({
            id: text(40),
            title: text(80),
            activity: text(400),
            rationale: citedSchema,
            durationBand: z.enum(['30–60 min', '60–90 min', '90–120 min']),
            costBand: z.enum(['free', 'low', 'moderate']),
            setting: z.enum(['indoor', 'outdoor', 'either']),
            invitation: draftSchema,
            alternative: text(300),
            userContextIds: userRefs,
          })
          .strict(),
      )
      .min(1)
      .max(3),
    drafts: z.array(draftSchema).min(1).max(2),
    moodboard: moodboardSchema,
    song: z
      .object({
        catalogueId: text(60),
        rationale: citedSchema,
        selectionKind: z.literal('model_selected'),
      })
      .strict(),
  })
  .strict();
export const modeSchemas = {
  outreach: {
    version: '1',
    result: outreachResultSchema,
    config: z
      .object({
        tone: z.enum(['friendly_professional', 'concise']),
        goal: z.string().max(300),
        meetingFormat: z.enum(['coffee_or_video', 'coffee', 'video']),
      })
      .strict(),
  },
  romantic: {
    version: '1',
    result: romanticResultSchema,
    config: z
      .object({
        adultConfirmedBoth: z.boolean(),
        tone: z.enum(['warm', 'playful']),
        budget: z.enum(['free', 'low', 'moderate']),
        settingPreference: z.enum(['indoor', 'outdoor', 'either']),
      })
      .strict(),
  },
} as const;
export type ModeId = keyof typeof modeSchemas;
export const requestSchema = z
  .object({
    schemaVersion: text(10),
    catalogueVersion: text(10),
    requestId: z.string().uuid(),
    mode: text(40),
    modeVersion: text(10),
    profile: profileSchema,
    userContext: userContextSchema,
    modeConfig: z.record(z.string(), z.unknown()),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (new Set(r.userContext.map((u) => u.id)).size !== r.userContext.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate context IDs.' });
    if (
      r.userContext.reduce((n, u) => n + u.text.length, 0) + JSON.stringify(r.modeConfig).length >
      3000
    )
      ctx.addIssue({ code: 'custom', message: 'Context exceeds 3,000 characters.' });
  });
export function wireSchema<T extends z.ZodType>(result: T) {
  return z
    .object({
      status: z.enum(['ready', 'insufficient', 'blocked']),
      reason: z.string().max(400),
      missingInformation: z.array(text(100)).max(5),
      result: result.nullable(),
    })
    .strict();
}
export const responseSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    catalogueVersion: z.literal(CATALOGUE_VERSION),
    requestId: z.string().uuid(),
    snapshotId: z.string().uuid(),
    mode: text(40),
    modeVersion: text(10),
    provider: z.literal('live'),
    generatedAt: z.string().datetime(),
    status: z.enum(['ready', 'insufficient', 'blocked']),
    reason: z.string().max(400),
    missingInformation: z.array(text(100)).max(5),
    result: z.unknown().nullable(),
  })
  .strict();
export type Evidence = z.infer<typeof evidenceSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type UserContext = z.infer<typeof userContextSchema>;
export type AnalysisRequest = z.infer<typeof requestSchema>;
export type AnalysisResponse = z.infer<typeof responseSchema>;
export type Outcome = Pick<AnalysisResponse, 'status' | 'reason' | 'missingInformation' | 'result'>;
export type CitedText = z.infer<typeof citedSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Moodboard = z.infer<typeof moodboardSchema>;
export type OutreachResult = z.infer<typeof outreachResultSchema>;
export type RomanticResult = z.infer<typeof romanticResultSchema>;
export type LocalSnapshot = {
  profile: Profile;
  tabId: number | null;
  routeFingerprint: string | null;
  canonicalDisplayUrl: string | null;
  adapterId: string;
  capturedAt: string;
  inputRevision: number;
  captureWarnings?: string[];
};

export function cleanText(value: string): string {
  return value
    .replace(/\p{Cc}/gu, (character) => (/\s/u.test(character) ? character : ''))
    .replace(/\s+/g, ' ')
    .trim();
}
export function redactText(value: string): string {
  return cleanText(value)
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email removed]')
    .replace(/(?:\+?\d[\d ()-]{7,}\d)/g, '[phone removed]')
    .replace(
      /\b\d{1,5}\s+(?:[A-Za-z]+\s+){1,4}(?:Street|Road|Lane|Avenue|Drive|St|Rd)\b/gi,
      '[address removed]',
    )
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '[time removed]');
}
// Conservative obvious-signal checks, not age verification or a complete classifier.
export function detectEligibility(textValue: string) {
  return {
    minorMentioned:
      /\b(?:i(?:'m| am)|age(?:d)?[: ]*)\s*(?:[0-9]|1[0-7])\b|\b(?:[0-9]|1[0-7])[- ]year[- ]old\b|\bunder[- ]18\b/i.test(
        textValue,
      ),
    noRomanticContact:
      /\b(?:not (?:looking|interested) (?:in|to) (?:date|dating)|(?:do not|don't|please don't) (?:contact|message|ask me out)|no romantic (?:contact|messages))\b/i.test(
        textValue,
      ),
  };
}
export function manualProfile(raw: string, name: string | null = null): Profile {
  const pieces = raw.split(/\n+/).map(redactText).filter(Boolean);
  const evidence: Evidence[] = [];
  let count = 0;
  let truncated = false;
  for (const piece of pieces) {
    for (let start = 0; start < piece.length; start += 600) {
      if (evidence.length >= 30 || count >= 12000) {
        truncated = true;
        break;
      }
      const textValue = piece.slice(start, start + Math.min(600, 12000 - count));
      evidence.push({
        id: `e${evidence.length + 1}`,
        text: textValue,
        sourceKind: 'manual',
        attribution: 'user_supplied',
        sectionLabel: 'Provided by you',
      });
      count += textValue.length;
    }
  }
  return {
    snapshotId: crypto.randomUUID(),
    displayName: name ? cleanText(name).slice(0, 120) : null,
    evidence,
    truncated,
    eligibilitySignals: detectEligibility(raw),
  };
}

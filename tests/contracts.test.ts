import { describe, expect, it } from 'vitest';
import {
  manualProfile,
  requestSchema,
  detectEligibility,
  redactText,
  profileSchema,
  type OutreachResult,
  type RomanticResult,
} from '../packages/contracts/src';
import { promptFor, serverModes, validateOutcome } from '../apps/api/src/modes';
import { formatForMode } from '../apps/api/src/providers/live';
import { assets, songs } from '../packages/catalogues/src';
import { existsSync } from 'node:fs';
import { request, output } from './helpers';

describe('contracts and evidence', () => {
  it('bounds and labels manually supplied evidence', () => {
    const p = manualProfile('A useful hobby. '.repeat(2000));
    expect(p.evidence.length).toBeLessThanOrEqual(30);
    expect(p.evidence.reduce((n, e) => n + e.text.length, 0)).toBeLessThanOrEqual(12000);
    expect(p.truncated).toBe(true);
    expect(p.evidence.every((e) => e.attribution === 'user_supplied')).toBe(true);
  });
  it('redacts contact details before sending', () => {
    const text = redactText('Email me at alex@example.com or +44 7700 900123. Meet at 10pm.');
    expect(text).not.toContain('alex@example.com');
    expect(text).not.toContain('7700');
    expect(text).not.toContain('10pm');
  });
  it('rejects duplicated evidence identifiers', () => {
    const input = request();
    input.profile.evidence.push(input.profile.evidence[0]);
    expect(requestSchema.safeParse(input).success).toBe(false);
  });
  it('allows all 150 photo observations alongside 120 profile snippets, without expanding the profile-text limit', () => {
    const p = manualProfile('Their profile text.');
    const text = Array.from({ length: 120 }, (_, i) => ({
      ...p.evidence[0],
      id: `e${i}`,
      text: 'x'.repeat(500),
    }));
    const photos = Array.from({ length: 150 }, (_, i) => ({
      id: `v${i}`,
      text: 'x'.repeat(600),
      sourceKind: 'visual' as const,
      attribution: 'visual_observation' as const,
      sourceImageId: crypto.randomUUID(),
      observationKind: 'scene' as const,
      sectionLabel: 'Photo observation',
    }));
    expect(profileSchema.safeParse({ ...p, evidence: [...text, ...photos] }).success).toBe(true);
    expect(
      profileSchema.safeParse({ ...p, evidence: [...text, { ...text[0], id: 'extra' }] }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({ ...p, evidence: [...photos, { ...photos[0], id: 'extra' }] })
        .success,
    ).toBe(false);
  });
  it.each(['I am 17. I like art.', "I'm 16 and love books", 'A 15-year-old artist'])(
    'detects obvious underage signals: %s',
    (text) => expect(detectEligibility(text).minorMentioned).toBe(true),
  );
  it('does not classify an adult with years of experience as a minor', () =>
    expect(detectEligibility('I am 29, with 10 years of experience.').minorMentioned).toBe(false));
  it('detects a contact boundary', () =>
    expect(detectEligibility('I am not looking to date.').noRomanticContact).toBe(true));
  it.each(['outreach', 'romantic'])('compiles a strict provider schema for %s', (mode) => {
    const format = formatForMode(serverModes[mode]);
    expect(format.type).toBe('json_schema');
    expect(format.strict).toBe(true);
    expect(format.schema).toHaveProperty('type', 'object');
  });
  it.each(['outreach', 'romantic'])('validates the %s result contract', (mode) =>
    expect(validateOutcome(serverModes[mode], output(mode), request(mode)).status).toBe('ready'),
  );
  it('rejects fabricated references and drops unverified quotes', () => {
    const raw = output('outreach');
    const result = raw.result as OutreachResult;
    result.summary.evidenceIds = ['e99'];
    expect(() => validateOutcome(serverModes.outreach, raw, request())).toThrow(/reference/);
    result.summary.evidenceIds = ['e1'];
    result.moodboard.tiles[4].quoteText = 'A quote they never wrote.';
    const dropped = validateOutcome(serverModes.outreach, raw, request()).result as OutreachResult;
    expect(dropped.moodboard.tiles[4].quoteText).toBeNull();
    const curly = request();
    curly.profile.evidence[0].text = 'I studied at King’s College — London.';
    result.moodboard.tiles[4].quoteText = "King's College - London";
    expect(validateOutcome(serverModes.outreach, raw, curly).status).toBe('ready');
  });
  it('refiles CV IDs cited as profile evidence and never shows a CV quote as theirs', () => {
    const input = request();
    input.userContext = [{ id: 'c1', kind: 'cv', text: 'I founded the robotics club at school.' }];
    const raw = output('outreach');
    const result = raw.result as OutreachResult;
    result.drafts[0].evidenceIds = ['e1', 'c1'];
    result.moodboard.tiles[4].evidenceIds = ['e1', 'c1'];
    result.moodboard.tiles[4].quoteText = 'I founded the robotics club';
    const checked = validateOutcome(serverModes.outreach, raw, input).result as OutreachResult;
    expect(checked.drafts[0].evidenceIds).toEqual(['e1']);
    expect(checked.drafts[0].userContextIds).toContain('c1');
    expect(checked.moodboard.tiles[4].quoteText).toBeNull();
    const only = output('outreach');
    (only.result as OutreachResult).summary.evidenceIds = ['c1'];
    expect(() => validateOutcome(serverModes.outreach, only, input)).toThrow();
  });
  it('rejects fabricated common ground and unsafe asset IDs', () => {
    const raw = output('outreach');
    const result = raw.result as OutreachResult;
    result.commonGround = [
      { text: 'You both build tools', evidenceIds: ['e1'], userContextIds: ['u1'] },
    ];
    expect(() => validateOutcome(serverModes.outreach, raw, request())).toThrow();
    result.commonGround = [];
    result.moodboard.tiles[0].assetId = 'https://untrusted.example/image.jpg';
    expect(() => validateOutcome(serverModes.outreach, raw, request())).toThrow();
  });
  it('ships every allowlisted asset and verified song metadata', () => {
    expect(assets).toHaveLength(24);
    expect(songs).toHaveLength(12);
    for (const asset of assets) expect(existsSync(`apps/extension/public${asset.path}`)).toBe(true);
    expect(songs.every((song) => song.source.startsWith('https://'))).toBe(true);
  });
});

describe('visual evidence provenance', () => {
  it('requires visual attribution and a source image reference together', () => {
    const input = request();
    input.profile.evidence[0] = { ...input.profile.evidence[0], sourceKind: 'visual' };
    expect(requestSchema.safeParse(input).success).toBe(false);
    input.profile.evidence[0] = {
      ...input.profile.evidence[0],
      attribution: 'visual_observation',
      sourceImageId: crypto.randomUUID(),
      observationKind: 'scene',
    };
    expect(requestSchema.safeParse(input).success).toBe(true);
  });
  it('leaves out list items that cite no profile evidence, and still fails without any', () => {
    const input = request('romantic');
    input.userContext = [{ id: 'u1', kind: 'interest', text: 'I love hiking.' }];
    const raw = output('romantic');
    const result = raw.result as RomanticResult;
    result.interests.push(
      { text: 'Hiking', evidenceIds: [], kind: 'hobby' },
      { text: 'Trail running', evidenceIds: ['u1'], kind: 'hobby' },
    );
    result.dateIdeas.push({
      ...structuredClone(result.dateIdeas[0]!),
      id: 'hike',
      rationale: { text: 'You both like hills.', evidenceIds: ['u1'] },
    });
    const checked = validateOutcome(serverModes.romantic, raw, input).result as RomanticResult;
    expect(checked.interests).toHaveLength(1);
    expect(checked.dateIdeas.map((d) => d.id)).toEqual(['coffee']);
    result.interests = [{ text: 'Hiking', evidenceIds: [], kind: 'hobby' }];
    expect(() => validateOutcome(serverModes.romantic, raw, input)).toThrow();
  });
  it('shows the model short stand-ins for long evidence IDs and maps them back', () => {
    const input = request();
    const longId = `v${crypto.randomUUID()}`;
    input.profile.evidence.push({
      id: longId,
      text: 'A bicycle leans against a bookshop window.',
      sourceKind: 'visual',
      attribution: 'visual_observation',
      sourceImageId: crypto.randomUUID(),
      observationKind: 'scene',
      sectionLabel: 'Photo 1',
    });
    const shown = JSON.parse(promptFor(serverModes.outreach, input)[1]!.content).evidence;
    expect(shown.at(-1).id).toBe('p1');
    expect(JSON.stringify(shown)).not.toContain(longId);
    const raw = output('outreach');
    (raw.result as OutreachResult).summary.evidenceIds = ['e1', 'p1'];
    const checked = validateOutcome(serverModes.outreach, raw, input).result as OutreachResult;
    expect(checked.summary.evidenceIds).toEqual(['e1', longId]);
  });
  it('does not turn a visual observation into an exact quote by the owner', () => {
    const input = request();
    input.profile.evidence[0] = {
      id: 'e1',
      text: 'A bicycle is visible.',
      sourceKind: 'visual',
      attribution: 'visual_observation',
      sourceImageId: crypto.randomUUID(),
      observationKind: 'scene',
      sectionLabel: 'Photo 1',
    };
    const raw = output('outreach');
    const result = raw.result as OutreachResult;
    result.moodboard.tiles[4].quoteText = 'A bicycle is visible.';
    result.moodboard.tiles[4].evidenceIds = ['e1'];
    // Unverifiable quotes are dropped to a caption rather than failing the whole result.
    const checked = validateOutcome(serverModes.outreach, raw, input).result as OutreachResult;
    expect(checked.moodboard.tiles[4].quoteText).toBeNull();
  });
});

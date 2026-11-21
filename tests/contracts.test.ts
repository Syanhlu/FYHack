import { describe, expect, it } from 'vitest';
import {
  manualProfile,
  requestSchema,
  detectEligibility,
  redactText,
  type OutreachResult,
} from '../packages/contracts/src';
import { serverModes, validateOutcome } from '../apps/api/src/modes';
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
  it('rejects fabricated references and exact quotes', () => {
    const raw = output('outreach');
    const result = raw.result as OutreachResult;
    result.summary.evidenceIds = ['e99'];
    expect(() => validateOutcome(serverModes.outreach, raw, request())).toThrow(/reference/);
    result.summary.evidenceIds = ['e1'];
    result.moodboard.tiles[4].quoteText = 'A quote they never wrote.';
    expect(() => validateOutcome(serverModes.outreach, raw, request())).toThrow(/quote/);
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
    expect(() => validateOutcome(serverModes.outreach, raw, input)).toThrow(/quote/);
  });
});

import {
  manualProfile,
  type AnalysisRequest,
  type Outcome,
  type OutreachResult,
  type RomanticResult,
  type Moodboard,
} from '../packages/contracts/src';

export const sampleText =
  'I am 29. I build accessible developer tools and mentor open-source contributors.\nI enjoy pottery, cycling, coffee and second-hand bookshops.';
export function request(mode = 'outreach'): AnalysisRequest {
  return {
    schemaVersion: '2',
    catalogueVersion: '1',
    requestId: crypto.randomUUID(),
    mode,
    modeVersion: mode === 'romantic' ? '2' : '1',
    profile: manualProfile(sampleText, 'Alex'),
    userContext: [],
    modeConfig:
      mode === 'romantic'
        ? { adultConfirmedBoth: true, tone: 'warm', budget: 'low', settingPreference: 'either' }
        : { tone: 'friendly_professional', goal: '', meetingFormat: 'coffee_or_video' },
  };
}
// Test doubles only. Production code never imports this module.
export function output(mode: string): Outcome {
  const cited = {
    text: 'They mention accessible tools and creative hobbies.',
    evidenceIds: ['e1'],
  };
  const draft = {
    id: 'hello',
    label: 'A first hello',
    text: 'Your accessible tools project caught my eye. Would you be open to a short coffee chat?',
    evidenceIds: ['e1'],
    userContextIds: [],
  };
  const moodboard: Moodboard = {
    title: mode === 'outreach' ? 'Good work, good conversations.' : 'Small pleasures, shared.',
    paletteId: mode === 'outreach' ? 'studio' : 'clay',
    aestheticTags: ['thoughtful', 'creative', 'warm'],
    tiles: [
      ...['coffee-paper', 'books-warm', 'ceramics-warm'].map((assetId, i) => ({
        id: `tile-${i}`,
        kind: 'image' as const,
        assetId,
        title: ['Coffee & curiosity', 'A new chapter', 'Made by hand'][i],
        caption: 'A little space for conversation.',
        rationale: 'Inspired by the stated interests.',
        evidenceIds: ['e1'],
        quoteText: null,
      })),
      {
        id: 'type',
        kind: 'typography',
        assetId: null,
        title: 'Start with curiosity.',
        caption: 'A thoughtful first conversation.',
        rationale: 'A creative interpretation of their interests.',
        evidenceIds: ['e1'],
        quoteText: null,
      },
      {
        id: 'quote',
        kind: 'quote',
        assetId: null,
        title: 'A shared spark',
        caption: 'Creative work and learning.',
        rationale: 'A paraphrase of the supplied profile.',
        evidenceIds: ['e1'],
        quoteText: null,
      },
      {
        id: 'palette',
        kind: 'palette',
        assetId: null,
        title: 'The studio palette',
        caption: 'Paper, clay, and a little green.',
        rationale: 'An aesthetic interpretation.',
        evidenceIds: ['e1'],
        quoteText: null,
      },
    ],
  };
  const outreach: OutreachResult = {
    summary: cited,
    professionalInterests: [cited],
    commonGround: [],
    conversationStarters: [
      {
        question: 'What makes a developer tool feel welcoming?',
        rationale: cited,
        userContextIds: [],
      },
    ],
    coffeeAgenda: [cited],
    drafts: [draft],
    moodboard,
  };
  const romantic: RomanticResult = {
    summary: cited,
    interests: [{ ...cited, kind: 'hobby' }],
    dateIdeas: [
      {
        id: 'coffee',
        title: 'A bookshop and a flat white',
        activity: 'Browse a bookshop, then find a public café nearby.',
        rationale: cited,
        durationBand: '60–90 min',
        costBand: 'low',
        setting: 'indoor',
        invitation: {
          ...draft,
          id: 'date',
          text: 'Would you fancy a bookshop browse and a coffee sometime? No worries if not.',
        },
        alternative: 'Just a short coffee if you prefer.',
        userContextIds: [],
      },
    ],
    drafts: [
      { ...draft, id: 'romantic', text: 'Fancy a coffee and a browse in a bookshop sometime?' },
    ],
    scrapbook: null,
    song: { catalogueId: 'coffee', rationale: cited, selectionKind: 'model_selected' },
  };
  return {
    status: 'ready',
    reason: '',
    missingInformation: [],
    result: mode === 'romantic' ? romantic : outreach,
  };
}

// A romantic request with four analysed photos, and a result whose scrapbook uses them.
export const photoIds = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
export function scrapbookCase() {
  const input = request('romantic');
  const scenes = [
    'One person is the clear subject, facing the camera in daylight.',
    'One person is the clear subject, seated at a cafe table.',
    'A ceramic bowl on a pottery wheel in a studio.',
    'A tram on a steep cobbled street.',
  ];
  input.profile.evidence.push(
    ...scenes.map((text, i) => ({
      id: `v${i + 1}`,
      text,
      sourceKind: 'visual' as const,
      attribution: 'visual_observation' as const,
      sectionLabel: `Photo ${i + 1}`,
      sourceImageId: photoIds[i]!,
      observationKind: 'scene' as const,
      photoKind: (['person', 'person', 'activity', 'place'] as const)[i]!,
    })),
    {
      id: 'v5',
      text: 'A sign reads "Lisboa – Lisbon tram 28".',
      sourceKind: 'visual',
      attribution: 'visual_observation',
      sectionLabel: 'Photo 4',
      sourceImageId: photoIds[3]!,
      observationKind: 'ocr',
    },
  );
  const raw = output('romantic');
  (raw.result as RomanticResult).scrapbook = {
    boardTheme: 'soft-pastel',
    name: 'Alex',
    summary: {
      text: 'Alex makes pots, rides bikes and loves a good bookshop.',
      evidenceIds: ['e1'],
    },
    paletteId: 'blush',
    portraits: [
      { imageId: photoIds[0]!, caption: 'golden hour', evidenceIds: ['v1'] },
      { imageId: photoIds[1]!, caption: null, evidenceIds: ['v2'] },
    ],
    travel: [{ imageId: photoIds[3]!, place: 'Lisbon, Portugal', evidenceIds: ['v4', 'v5'] }],
    hobbies: [{ imageId: photoIds[2]!, label: 'pottery days', evidenceIds: ['v3'] }],
    moments: [],
    quote: { quoteText: 'I enjoy pottery', caption: 'In their words', evidenceIds: ['e2'] },
    stickerIds: ['coffee', 'book', 'bike', 'palette', 'heart', 'sparkle'],
  };
  return { input, raw, board: (raw.result as RomanticResult).scrapbook! };
}

export const palettes = {
  studio: { name: 'The working studio', colours: ['#1e3435', '#d6e0d4', '#e6ac75', '#f5f0e7'] },
  clay: { name: 'Clay & paper', colours: ['#8b4c39', '#e3b39b', '#a7b49a', '#faf0e4'] },
  forest: { name: 'Outside, slowly', colours: ['#314a3d', '#90a28a', '#d9c39d', '#f4eddf'] },
  midnight: { name: 'After hours', colours: ['#303954', '#7886a2', '#e2ad7c', '#ede6dc'] },
} as const;
const topics = [
  ['coffee', 'Coffee & conversation', ['coffee', 'conversation', 'cafe']],
  ['books', 'A well-read afternoon', ['books', 'reading', 'learning']],
  ['ceramics', 'Made by hand', ['pottery', 'ceramics', 'craft', 'art']],
  ['code', 'Tools for people', ['software', 'developer', 'technology', 'accessibility']],
  ['design', 'Thoughtful by design', ['design', 'illustration', 'creativity']],
  ['outdoors', 'A little fresh air', ['walking', 'cycling', 'nature', 'outdoors']],
  ['music', 'Something to listen to', ['music', 'jazz', 'records']],
  ['community', 'Better, together', ['mentoring', 'community', 'volunteering']],
] as const;
export const assets = topics.flatMap(([topic, title, tags]) =>
  ['paper', 'ink', 'warm'].map((variant) => ({
    id: `${topic}-${variant}`,
    path: `/moodboard/${topic}-${variant}.svg`,
    title,
    alt: `Original ${variant}-palette illustration of ${title.toLowerCase()}`,
    tags: [...tags],
    credit: 'Original Profile Lens vector artwork',
    licence: 'Project-owned original artwork',
  })),
);
const sylvanSource =
  'https://sylvanesso.bandcamp.com/album/sylvan-esso-10-year-anniversary-edition';
const khruangbinSource = 'https://shop.khruangbin.com/products/con-todo-el-mundo-cd';
export const songs = [
  {
    id: 'coffee',
    title: 'Coffee',
    artist: 'Sylvan Esso',
    tags: ['coffee', 'warm', 'electronic'],
    source: sylvanSource,
  },
  {
    id: 'hey-mami',
    title: 'Hey Mami',
    artist: 'Sylvan Esso',
    tags: ['playful', 'energetic'],
    source: sylvanSource,
  },
  {
    id: 'dreamy-bruises',
    title: 'Dreamy Bruises',
    artist: 'Sylvan Esso',
    tags: ['dreamy', 'electronic'],
    source: sylvanSource,
  },
  {
    id: 'could-i-be',
    title: 'Could I Be',
    artist: 'Sylvan Esso',
    tags: ['reflective', 'creative'],
    source: sylvanSource,
  },
  {
    id: 'come-down',
    title: 'Come Down',
    artist: 'Sylvan Esso',
    tags: ['quiet', 'soft'],
    source: sylvanSource,
  },
  {
    id: 'cosmos',
    title: 'The Cosmos',
    artist: 'Sylvan Esso',
    tags: ['space', 'reflective'],
    source: sylvanSource,
  },
  {
    id: 'friday-morning',
    title: 'Friday Morning',
    artist: 'Khruangbin',
    tags: ['relaxed', 'coffee', 'weekend'],
    source: khruangbinSource,
  },
  {
    id: 'august-10',
    title: 'August 10',
    artist: 'Khruangbin',
    tags: ['sunshine', 'outdoors'],
    source: khruangbinSource,
  },
  {
    id: 'como-me-quieres',
    title: 'Como Me Quieres',
    artist: 'Khruangbin',
    tags: ['warm', 'reflective'],
    source: khruangbinSource,
  },
  {
    id: 'maria-tambien',
    title: 'Maria También',
    artist: 'Khruangbin',
    tags: ['energetic', 'art'],
    source: khruangbinSource,
  },
  {
    id: 'a-hymn',
    title: 'A Hymn',
    artist: 'Khruangbin',
    tags: ['quiet', 'books'],
    source: khruangbinSource,
  },
  {
    id: 'evan',
    title: 'Evan Finds the Third Room',
    artist: 'Khruangbin',
    tags: ['playful', 'groove'],
    source: khruangbinSource,
  },
];
export const getAsset = (id: string) => assets.find((a) => a.id === id);
export const getSong = (id: string) => songs.find((s) => s.id === id);
export const songSearchUrl = (id: string) => {
  const song = getSong(id);
  return song
    ? `https://bandcamp.com/search?q=${encodeURIComponent(`${song.artist} ${song.title}`)}&item_type=t`
    : null;
};
export const promptCatalogue = {
  assets: assets.map(({ id, tags }) => ({ id, tags })),
  palettes: Object.keys(palettes),
  songs: songs.map(({ id, title, artist, tags }) => ({ id, title, artist, tags })),
};

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
    credit: 'Original WingMan vector artwork',
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
export const promptCatalogue = {
  assets: assets.map(({ id, tags }) => ({ id, tags })),
  palettes: Object.keys(palettes),
  songs: songs.map(({ id, title, artist, tags }) => ({ id, title, artist, tags })),
};

// ── Romantic Pursue scrapbook ────────────────────────────────────────────────
// Everything the model may choose for the scrapbook board is an ID from these lists.
// Colour order in every palette: paper, accent, second accent, ink.
export const scrapbookPalettes = {
  blush: {
    mood: 'soft pink, sage and plum',
    colours: ['#fbeef0', '#b54468', '#8fae9b', '#4a2c3a'],
  },
  meadow: {
    mood: 'cream, leaf green and tomato red',
    colours: ['#f7f3e3', '#487a3b', '#d9583e', '#2f3b26'],
  },
  cherry: {
    mood: 'pale pink, cherry red and forest green',
    colours: ['#fdf1ee', '#c2273d', '#2f6b4f', '#2a1a1c'],
  },
  sepia: {
    mood: 'aged paper, rust and faded teal',
    colours: ['#f1e6d0', '#a8552f', '#5b7f7a', '#3a2a1c'],
  },
  sky: {
    mood: 'cloud white, cornflower blue and butter yellow',
    colours: ['#f2f6fb', '#4a74c9', '#e0a92e', '#1f2b45'],
  },
  neon: {
    mood: 'off-white, hot pink and black with acid green',
    colours: ['#f4f4ee', '#d90077', '#4f8f00', '#111111'],
  },
} as const;
export type ScrapbookPaletteId = keyof typeof scrapbookPalettes;

// pattern, frame and font names are CSS hooks implemented in components/moodboard.
export const boardThemes = {
  'soft-pastel': {
    tags: ['dreamy', 'romantic', 'soft', 'floral'],
    pattern: 'linen',
    titleFont: 'serif',
    bodyFont: 'hand',
    frames: ['polaroid', 'torn'],
    palette: 'blush',
    stickers: ['peony', 'rose', 'daisy', 'heart', 'sparkle'],
  },
  'gingham-cottage': {
    tags: ['cosy', 'playful', 'homely', 'outdoorsy'],
    pattern: 'gingham',
    titleFont: 'serif',
    bodyFont: 'hand',
    frames: ['rounded', 'polaroid'],
    palette: 'meadow',
    stickers: ['clover', 'apple', 'button', 'mushroom', 'daisy'],
  },
  'plaid-y2k': {
    tags: ['cute', 'chaotic', 'bright', 'pop'],
    pattern: 'plaid',
    titleFont: 'script',
    bodyFont: 'hand',
    frames: ['scallop', 'polaroid'],
    palette: 'cherry',
    stickers: ['cherry', 'star', 'sparkle', 'bow', 'heart'],
  },
  'journal-vintage': {
    tags: ['nostalgic', 'introspective', 'bookish', 'quiet'],
    pattern: 'aged',
    titleFont: 'typewriter',
    bodyFont: 'typewriter',
    frames: ['torn', 'polaroid'],
    palette: 'sepia',
    stickers: ['leaf', 'book', 'key', 'moon', 'envelope'],
  },
  'bold-street': {
    tags: ['edgy', 'sporty', 'loud', 'urban'],
    pattern: 'checker',
    titleFont: 'serif',
    bodyFont: 'sans',
    frames: ['polaroid', 'rounded'],
    palette: 'neon',
    stickers: ['star', 'lightning', 'fire', 'sneaker', 'music'],
  },
} as const;
export type BoardThemeId = keyof typeof boardThemes;

// Emoji stickers: drawn by the system font, so nothing is fetched or bundled.
export const stickers = {
  peony: { emoji: '🌸', tags: ['flowers', 'soft'] },
  rose: { emoji: '🌹', tags: ['flowers', 'romantic'] },
  daisy: { emoji: '🌼', tags: ['flowers', 'sunny'] },
  tulip: { emoji: '🌷', tags: ['flowers', 'spring'] },
  leaf: { emoji: '🍂', tags: ['nature', 'autumn'] },
  clover: { emoji: '🍀', tags: ['nature', 'luck'] },
  mushroom: { emoji: '🍄', tags: ['nature', 'cottage'] },
  heart: { emoji: '💗', tags: ['love'] },
  sparkle: { emoji: '✨', tags: ['shine'] },
  star: { emoji: '⭐', tags: ['shine', 'bold'] },
  moon: { emoji: '🌙', tags: ['night', 'dreamy'] },
  sun: { emoji: '☀️', tags: ['sunshine', 'outdoors'] },
  bow: { emoji: '🎀', tags: ['cute'] },
  cherry: { emoji: '🍒', tags: ['fruit', 'cute'] },
  apple: { emoji: '🍎', tags: ['fruit', 'cottage'] },
  strawberry: { emoji: '🍓', tags: ['fruit', 'sweet'] },
  coffee: { emoji: '☕', tags: ['coffee', 'cafe'] },
  cake: { emoji: '🍰', tags: ['baking', 'food'] },
  pizza: { emoji: '🍕', tags: ['food'] },
  book: { emoji: '📚', tags: ['reading', 'study'] },
  camera: { emoji: '📷', tags: ['photography'] },
  palette: { emoji: '🎨', tags: ['art', 'painting'] },
  music: { emoji: '🎵', tags: ['music'] },
  guitar: { emoji: '🎸', tags: ['music', 'band'] },
  plane: { emoji: '✈️', tags: ['travel'] },
  globe: { emoji: '🌍', tags: ['travel'] },
  mountain: { emoji: '⛰️', tags: ['hiking', 'outdoors'] },
  wave: { emoji: '🌊', tags: ['beach', 'swimming', 'surf'] },
  bike: { emoji: '🚲', tags: ['cycling'] },
  football: { emoji: '⚽', tags: ['football', 'sport'] },
  tennis: { emoji: '🎾', tags: ['tennis', 'sport'] },
  sneaker: { emoji: '👟', tags: ['running', 'street'] },
  dog: { emoji: '🐶', tags: ['dogs', 'pets'] },
  cat: { emoji: '🐱', tags: ['cats', 'pets'] },
  plant: { emoji: '🪴', tags: ['plants', 'home'] },
  game: { emoji: '🎮', tags: ['gaming'] },
  film: { emoji: '🎬', tags: ['films'] },
  lightning: { emoji: '⚡', tags: ['energy', 'bold'] },
  fire: { emoji: '🔥', tags: ['energy', 'bold'] },
  key: { emoji: '🗝️', tags: ['vintage'] },
  envelope: { emoji: '💌', tags: ['letters', 'vintage'] },
  button: { emoji: '🧵', tags: ['craft', 'sewing'] },
} as const;
export type StickerId = keyof typeof stickers;

const ids = <T extends object>(value: T) =>
  Object.keys(value) as [keyof T & string, ...(keyof T & string)[]];
export const boardThemeIds = ids(boardThemes);
export const scrapbookPaletteIds = ids(scrapbookPalettes);
export const stickerIds = ids(stickers);
export const scrapbookCatalogue = {
  themes: boardThemeIds.map((id) => ({ id, tags: boardThemes[id].tags })),
  palettes: scrapbookPaletteIds.map((id) => ({ id, mood: scrapbookPalettes[id].mood })),
  stickers: stickerIds.map((id) => ({ id, tags: stickers[id].tags })),
};

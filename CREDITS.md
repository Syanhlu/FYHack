# Asset and music provenance

## Illustrations

All 24 `apps/extension/public/moodboard/*.svg` files are original vector compositions created for this project. Their reproducible source is `scripts/generate-art.mjs`. They use no external photos, logos, album art, portraits, or third-party illustrations.

Lucide icons are supplied by the pinned `lucide-react` package under its ISC licence. System fonts and Georgia are requested through CSS; no font files are redistributed.

## Music metadata

Track titles and artists were checked against the artists' own catalogues on 21 November 2026:

- [Sylvan Esso — 10 Year Anniversary Edition](https://sylvanesso.bandcamp.com/album/sylvan-esso-10-year-anniversary-edition): Coffee, Hey Mami, Dreamy Bruises, Could I Be, Come Down, The Cosmos.
- [Khruangbin — Con Todo El Mundo](https://shop.khruangbin.com/products/con-todo-el-mundo-cd): Friday Morning, August 10, Como Me Quieres, Maria También, A Hymn, Evan Finds the Third Room.

Mood tags are editorial choices for this app, not artist statements. No recordings, lyrics, album covers, or music previews are included. The catalogue is used only to choose a mood: the model picks one entry for a profile, and the app uses that entry's mood tags. Track titles and artists are not shown and nothing is linked or played.

## Generated soundtrack

The Romantic Pursue soundtrack is original music synthesised in the browser by `apps/extension/src/services/music.ts` from the chosen tone and those mood tags. It uses no samples or recordings.

## Romantic Pursue scrapbook

The scrapbook board is drawn from the person's own analysed photos, which are held as local data URLs in the panel's memory for the session and are never fetched from the source site at render time. Frames, tape, paper scraps and background patterns are CSS written for this project.

- Stickers are emoji drawn by the viewer's system font. No sticker artwork is bundled.
- Fonts are bundled locally through the pinned Fontsource packages, each under the SIL Open Font License 1.1: DM Serif Display, Pinyon Script, Caveat, Special Elite and DM Sans.
- PNG export uses the pinned `html-to-image` package (MIT).

The 24 SVG illustrations above are still used by the Outreach mood board.

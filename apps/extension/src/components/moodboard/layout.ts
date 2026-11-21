import type { Scrapbook } from '@profile-lens/contracts';

// All positions are in cqw (hundredths of the board's width). The board is 4:5, so it is
// 100 wide and 125 tall.
export type Slot = { left: number; top: number; width: number; rotate: number; z: number };

/** Small deterministic PRNG, so a board looks the same every time it is drawn. */
export function seeded(seed: string) {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    return ((state ^= state >>> 16) >>> 0) / 4294967296;
  };
}
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

// Photos in the lower bands sit in rows of up to three.
const rowsOf = (count: number) =>
  count <= 3 ? [count] : count === 4 ? [2, 2] : count === 5 ? [3, 2] : [3, 3];
const BAND_TOP = 80; // where the lower bands start, below the portraits and notes
const ROW = 36; // typical height of one row of small photos, for spacing stickers

export function layout(board: Scrapbook) {
  const labelled = board.hobbies.length + board.travel.length;
  const random = seeded(
    [...board.portraits, ...board.hobbies, ...board.travel, ...board.moments]
      .map((p) => p.imageId)
      .join(),
  );
  // Nudge every slot a little (about ±12px and ±3° in the panel) and keep it on the board.
  const jitter = (slot: Slot): Slot => ({
    ...slot,
    left: clamp(slot.left + (random() - 0.5) * 6, 1, 99 - slot.width),
    top: slot.top + (random() - 0.5) * 5,
    rotate: clamp(slot.rotate + (random() - 0.5) * 6, -6, 6),
  });
  let top = BAND_TOP;
  // Lays out one band of small photos, row by row, and moves `top` past it.
  const band = (count: number) =>
    rowsOf(count).flatMap((inRow, row) => {
      if (!inRow) return [];
      const width = [0, 36, 34, 28][inRow]!;
      const rowTop = top;
      // Tall enough for the photo, its frame and the caption strip under it.
      top += width + 8;
      return Array.from({ length: inRow }, (_, index) =>
        jitter({
          // A lone first photo sits left, under the quote and beside the summary.
          left: inRow === 1 ? (row ? 32 : 8) : 5 + (index * (90 - width)) / (inRow - 1),
          top: rowTop + (index % 2 ? 2 : -2),
          width,
          rotate: [-3, 3, -2][index]!,
          z: 5,
        }),
      );
    });
  const small = band(labelled);
  const moments = band(board.moments.length);
  return {
    portraits: [
      jitter({ left: 5, top: 17, width: 42, rotate: -3, z: 3 }),
      jitter({ left: 50, top: 15, width: 44, rotate: 3, z: 4 }),
    ],
    // With no quote and a full row below, the summary takes the middle of the board.
    summary: jitter(
      board.quote || labelled === 1
        ? { left: 45, top: 61, width: 50, rotate: -2, z: 6 }
        : { left: 22, top: 64, width: 58, rotate: -2, z: 6 },
    ),
    quote: jitter({ left: 4, top: 66, width: 36, rotate: 3, z: 7 }),
    small,
    moments,
    // The board grows with the number of photo rows; about 4:5 with a single row.
    height: top + 9,
  };
}

// Spots between the main pieces where a sticker can sit: [left, top]. The first group is
// fixed around the portraits; the rest hug the edges of each photo row and the foot.
const topAnchors: [number, number][] = [
  [89, 9],
  [40, 12],
  [0, 31],
  [90, 57],
  [43, 55],
  [93, 36],
  [30, 62],
  [62, 10],
];
export function stickerSpots(count: number, seed: string, height = 125) {
  const anchors: [number, number][] = [...topAnchors.slice(0, 5)];
  for (let y = BAND_TOP; y < height - 12; y += ROW) anchors.push([1, y + 4], [91, y + 2]);
  anchors.push([20, height - 9], [72, height - 8], ...topAnchors.slice(5));
  const random = seeded(`stickers:${seed}`);
  return anchors.slice(0, count).map(([left, top]) => ({
    left: clamp(left + (random() - 0.5) * 4, 0, 91),
    top: clamp(top + (random() - 0.5) * 4, 1, height - 9),
    size: 6.5 + random() * 3,
    rotate: (random() - 0.5) * 30,
  }));
}

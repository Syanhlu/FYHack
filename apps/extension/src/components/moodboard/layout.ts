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

export function layout(board: Scrapbook) {
  const small = board.hobbies.length + board.travel.length;
  const random = seeded(
    [...board.portraits, ...board.hobbies, ...board.travel].map((p) => p.imageId).join(),
  );
  // Nudge every slot a little (about ±12px and ±3° in the panel) and keep it on the board.
  const jitter = (slot: Slot): Slot => ({
    ...slot,
    left: clamp(slot.left + (random() - 0.5) * 6, 1, 99 - slot.width),
    top: slot.top + (random() - 0.5) * 6,
    rotate: clamp(slot.rotate + (random() - 0.5) * 6, -6, 6),
  });
  const width = [0, 38, 34, 29, 23.5][small]!;
  return {
    portraits: [
      jitter({ left: 5, top: 17, width: 42, rotate: -3, z: 3 }),
      jitter({ left: 50, top: 15, width: 44, rotate: 3, z: 4 }),
    ],
    // With no quote and a full bottom band, the summary takes the middle of the board.
    summary: jitter(
      board.quote || small === 1
        ? { left: 45, top: 61, width: 50, rotate: -2, z: 6 }
        : { left: 22, top: 64, width: 58, rotate: -2, z: 6 },
    ),
    quote: jitter({ left: 4, top: 66, width: 36, rotate: 3, z: 7 }),
    // Hobby and travel photos share the bottom band, spread to fill it whatever their number.
    small: Array.from({ length: small }, (_, index) =>
      jitter({
        // A lone photo sits bottom-left, under the quote and beside the summary.
        left: small === 1 ? 8 : 5 + (index * (90 - width)) / (small - 1),
        top: 114 - width + (index % 2 ? 2 : -2),
        width,
        rotate: [-3, 3, -2, 3][index]!,
        z: 5,
      }),
    ),
  };
}

// Spots between the main pieces where a sticker can sit: [left, top].
const anchors: [number, number][] = [
  [89, 9],
  [40, 12],
  [0, 31],
  [90, 57],
  [43, 55],
  [1, 84],
  [91, 82],
  [93, 36],
  [20, 116],
  [72, 117],
  [90, 110],
  [30, 62],
  [62, 10],
  [2, 108],
];
export function stickerSpots(count: number, seed: string) {
  const random = seeded(`stickers:${seed}`);
  return anchors.slice(0, count).map(([left, top]) => ({
    left: clamp(left + (random() - 0.5) * 4, 0, 91),
    top: clamp(top + (random() - 0.5) * 4, 1, 116),
    size: 6.5 + random() * 3,
    rotate: (random() - 0.5) * 30,
  }));
}

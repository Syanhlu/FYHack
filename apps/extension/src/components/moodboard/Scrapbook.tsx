import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { boardThemes, scrapbookPalettes, stickers, type StickerId } from '@profile-lens/catalogues';
import type { Evidence, Scrapbook as Board } from '@profile-lens/contracts';
import { photoPreview } from '../../services/photo-previews';
import { layout, stickerSpots, type Slot } from './layout';
import '@fontsource/dm-serif-display/latin-400.css';
import '@fontsource/pinyon-script/latin-400.css';
import '@fontsource/caveat/latin-400.css';
import '@fontsource/caveat/latin-700.css';
import '@fontsource/special-elite/latin-400.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-700.css';
import './scrapbook.css';

const place = (slot: Slot): CSSProperties => ({
  left: `${slot.left}cqw`,
  top: `${slot.top}cqw`,
  width: `${slot.width}cqw`,
  rotate: `${slot.rotate}deg`,
  zIndex: slot.z,
});
function Photo({
  src,
  alt,
  frame,
  slot,
  tape,
  small,
  children,
}: {
  src: string;
  alt: string;
  frame: string;
  slot: Slot;
  tape?: boolean;
  small?: boolean;
  children?: ReactNode;
}) {
  return (
    <figure
      className={`sb-item sb-photo sb-${frame}${small ? ' sb-small' : ''}`}
      style={place(slot)}
    >
      {tape && <span className="sb-tape" aria-hidden="true" />}
      <div className="sb-frame">
        <img src={src} alt={alt} />
      </div>
      {children}
    </figure>
  );
}

/** A hand-assembled scrapbook of the person's own analysed photos. Purely presentational:
 * every ID and string has already been validated by the backend and the result schema. */
export function Scrapbook({ board, evidence }: { board: Board; evidence: Evidence[] }) {
  const node = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('');
  const theme = boardThemes[board.boardTheme];
  const palette = scrapbookPalettes[board.paletteId].colours;
  const used = [...board.portraits, ...board.hobbies, ...board.travel, ...board.moments];
  // Photo pixels live only in this panel's memory. A board that outlives them is stale.
  if (used.some((photo) => !photoPreview(photo.imageId)))
    return (
      <p className="notice">
        The photos for this scrapbook are no longer held in this session. Analyse the profile’s
        photos again, then regenerate.
      </p>
    );
  const src = (id: string) => photoPreview(id)!;
  const alt = (photo: { imageId: string; evidenceIds: string[] }, fallback: string) =>
    evidence.find((e) => e.sourceImageId === photo.imageId && photo.evidenceIds.includes(e.id))
      ?.text ?? fallback;
  const slots = layout(board);
  // The model's picks first, then a few of the theme's own, never repeating one.
  const stickerIds = [...new Set<StickerId>([...board.stickerIds, ...theme.stickers])].slice(0, 13);
  const spots = stickerSpots(stickerIds.length, used.map((p) => p.imageId).join(), slots.height);
  const nameSize = board.name.length <= 7 ? 'xl' : board.name.length <= 13 ? 'lg' : 'md';
  const download = async () => {
    if (!node.current) return;
    setStatus('Preparing image…');
    try {
      const { toPng } = await import('html-to-image');
      await document.fonts.ready;
      const link = document.createElement('a');
      link.href = await toPng(node.current, { pixelRatio: 3, cacheBust: false });
      link.download = `${board.name.replace(/[^\w-]+/g, '-') || 'scrapbook'}.png`;
      link.click();
      setStatus('Saved as a PNG.');
    } catch {
      setStatus('Could not create the image. Take a screenshot instead.');
    }
  };
  return (
    <>
      <div
        ref={node}
        className={`scrapbook sb-pattern-${theme.pattern} sb-title-${theme.titleFont} sb-body-${theme.bodyFont}`}
        style={
          {
            '--sb-paper': palette[0],
            '--sb-accent': palette[1],
            '--sb-second': palette[2],
            '--sb-ink': palette[3],
            aspectRatio: `100 / ${slots.height}`,
          } as CSSProperties
        }
      >
        {board.portraits.map((photo, index) => (
          <Photo
            key={photo.imageId}
            src={src(photo.imageId)}
            alt={alt(photo, 'A photo from their profile')}
            frame={theme.frames[index]!}
            slot={slots.portraits[index]!}
            tape={index === 1}
          >
            {photo.caption && <figcaption className="sb-label">{photo.caption}</figcaption>}
          </Photo>
        ))}
        <h2 className={`sb-name sb-name-${nameSize}`}>{board.name}</h2>
        <div className="sb-item sb-scrap" style={place(slots.summary)}>
          <p>{board.summary.text}</p>
        </div>
        {board.quote && (
          <blockquote className="sb-item sb-sticky" style={place(slots.quote)}>
            <span className="sb-pin" aria-hidden="true" />
            <p>{board.quote.quoteText ? `“${board.quote.quoteText}”` : board.quote.caption}</p>
          </blockquote>
        )}
        {board.hobbies.map((photo, index) => (
          <Photo
            key={photo.imageId}
            src={src(photo.imageId)}
            alt={alt(photo, photo.label)}
            frame={index ? 'scallop' : 'oval'}
            slot={slots.small[index]!}
            small
          >
            <figcaption className="sb-label sb-label-accent">{photo.label}</figcaption>
          </Photo>
        ))}
        {board.travel.map((photo, index) => (
          <Photo
            key={photo.imageId}
            src={src(photo.imageId)}
            alt={alt(photo, `A photo from ${photo.place}`)}
            frame="polaroid"
            slot={slots.small[board.hobbies.length + index]!}
            tape
            small
          >
            <figcaption className="sb-label">📍 {photo.place}</figcaption>
          </Photo>
        ))}
        {board.moments.map((photo, index) => (
          <Photo
            key={photo.imageId}
            src={src(photo.imageId)}
            alt={alt(photo, 'A photo from their profile')}
            frame={(['polaroid', 'rounded', 'torn'] as const)[index % 3]!}
            slot={slots.moments[index]!}
            tape={index % 2 === 0}
            small
          />
        ))}
        <div className="sb-swatches" aria-hidden="true">
          {palette.map((colour) => (
            <span key={colour} style={{ backgroundColor: colour }} />
          ))}
        </div>
        {stickerIds.slice(0, spots.length).map((id, index) => (
          <span
            key={id}
            className="sb-sticker"
            aria-hidden="true"
            style={{
              left: `${spots[index]!.left}cqw`,
              top: `${spots[index]!.top}cqw`,
              fontSize: `${spots[index]!.size}cqw`,
              rotate: `${spots[index]!.rotate}deg`,
            }}
          >
            {stickers[id].emoji}
          </span>
        ))}
      </div>
      <div className="sb-actions">
        <button className="button secondary small" onClick={() => void download()}>
          <Download size={14} /> Download PNG
        </button>
        <span role="status" className="hint">
          {status}
        </span>
      </div>
    </>
  );
}

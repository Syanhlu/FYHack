import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Copy, Music2, Pause, Play, Quote, Sparkles } from 'lucide-react';
import { getAsset, getSong, palettes } from '@profile-lens/catalogues';
import type {
  CitedText,
  Draft,
  Evidence,
  Moodboard,
  OutreachResult,
  RomanticResult,
  UserContext,
} from '@profile-lens/contracts';
import { startMusic } from '../services/music';

// Model labels sometimes arrive as identifiers ("coffee_chat_invitation"); show them as words.
export const readable = (value: string) => {
  const words = value.replace(/[_-]+/g, ' ').trim();
  return words === value ? value : words.charAt(0).toUpperCase() + words.slice(1);
};
// Plays generated ambient music matched to the soundtrack pick's mood, with a pause control.
const toneNames: Record<string, string> = {
  warm: 'Warm & direct',
  playful: 'Light & playful',
  heartfelt: 'Sincere & heartfelt',
  confident: 'Confident & bold',
  relaxed: 'Relaxed & easygoing',
};
// The moodboard's soundtrack: original music generated in the browser from the chosen tone
// and the mood picked for this profile. The record spins while it plays.
function Soundtrack({ tone, tags }: { tone: string; tags: string[] }) {
  const canPlay = typeof AudioContext !== 'undefined';
  const [playing, setPlaying] = useState(canPlay);
  const mood = tags.join(' ');
  useEffect(() => {
    if (!playing) return;
    return startMusic(tone, mood.split(' '));
  }, [playing, tone, mood]);
  return (
    <section className="song-card">
      <div className={playing ? 'record spinning' : 'record'}>
        <Music2 size={23} />
      </div>
      <div>
        <span className="eyebrow">A soundtrack for this moodboard</span>
        <h3>{toneNames[tone] ?? toneNames.warm}</h3>
        <p>{tags.join(' · ')}</p>
      </div>
      {canPlay && (
        <button
          className="icon-button"
          aria-label={playing ? 'Pause soundtrack' : 'Play soundtrack'}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
      )}
      <small>Original music generated for your tone and this moodboard, not their taste.</small>
    </section>
  );
}
export interface ResultProps<T> {
  data: T;
  evidence: Evidence[];
  userContext: UserContext;
  beforeCopy: () => Promise<boolean>;
  config?: Record<string, unknown>;
}
export function Sources({
  ids,
  evidence,
  userIds = [],
  userContext = [],
}: {
  ids: string[];
  evidence: Evidence[];
  userIds?: string[];
  userContext?: UserContext;
}) {
  return (
    <details className="sources">
      <summary>
        View source <span>{ids.length + userIds.length}</span>
      </summary>
      {ids.map((id) => {
        const e = evidence.find((e) => e.id === id);
        return e ? (
          <blockquote key={id}>
            <small>
              {e.sourceKind === 'visual' ? 'Their photo · AI observation' : 'Their profile'} ·{' '}
              {e.attribution === 'user_supplied'
                ? 'text provided or edited by you'
                : e.sectionLabel}
            </small>
            {e.text}
          </blockquote>
        ) : null;
      })}
      {userIds.map((id) => {
        const u = userContext.find((u) => u.id === id);
        return u ? (
          <blockquote key={id}>
            <small>From you · {u.kind === 'cv' ? 'your CV' : u.kind}</small>
            {u.text}
          </blockquote>
        ) : null;
      })}
    </details>
  );
}
export function DraftCard({
  draft,
  beforeCopy,
}: {
  draft: Draft;
  beforeCopy: () => Promise<boolean>;
}) {
  const [value, setValue] = useState(draft.text);
  const [status, setStatus] = useState('');
  const copy = async () => {
    if (!(await beforeCopy())) {
      setStatus('The profile changed. Read it again before copying.');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Copied');
    } catch {
      setStatus('Select the text above and copy it manually.');
    }
  };
  return (
    <article className="draft-card">
      <label htmlFor={`draft-${draft.id}`}>{readable(draft.label)}</label>
      <textarea
        id={`draft-${draft.id}`}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setStatus('');
        }}
        rows={Math.min(8, Math.max(3, Math.ceil(value.length / 45)))}
      />
      <div className="draft-bottom">
        <span>Make it sound like you.</span>
        <button className="button secondary small" onClick={() => void copy()}>
          {status === 'Copied' ? <Check size={14} /> : <Copy size={14} />} Copy
        </button>
      </div>
      <span className="sr-only" role="status">
        {status}
      </span>
      {status && status !== 'Copied' && <p className="hint">{status}</p>}
    </article>
  );
}
function ImageTile({ assetId }: { assetId: string }) {
  const asset = getAsset(assetId);
  const [failed, setFailed] = useState(false);
  return asset && !failed ? (
    <img src={asset.path} alt={asset.alt} loading="lazy" onError={() => setFailed(true)} />
  ) : (
    <div className="image-fallback">
      <Sparkles size={32} />
      <span>A little inspiration</span>
    </div>
  );
}
export function MoodboardView({ board, evidence }: { board: Moodboard; evidence: Evidence[] }) {
  const palette = palettes[board.paletteId as keyof typeof palettes] ?? palettes.studio;
  return (
    <section className="board-section" aria-label="Moodboard">
      <div className="section-heading">
        <div>
          <span className="eyebrow">A little inspiration</span>
          <h2>{board.title}</h2>
        </div>
        <Sparkles size={18} />
      </div>
      <p className="hint">
        Creative interpretation · {board.aestheticTags.map(readable).join(' / ')}
      </p>
      <div
        className="moodboard"
        style={
          {
            '--board-ink': palette.colours[0],
            '--board-paper': palette.colours[3],
            '--board-accent': palette.colours[2],
          } as CSSProperties
        }
      >
        {board.tiles.map((tile) => (
          <article key={tile.id} className={`mood-tile tile-${tile.kind}`}>
            {tile.kind === 'image' && tile.assetId && <ImageTile assetId={tile.assetId} />}
            {tile.kind === 'quote' && <Quote className="quote-mark" size={24} />}
            {tile.kind === 'palette' && (
              <div className="swatches">
                {palette.colours.map((colour) => (
                  <span key={colour} style={{ backgroundColor: colour }} title={colour} />
                ))}
              </div>
            )}
            <div className="tile-copy">
              <h3>{tile.title}</h3>
              {tile.quoteText ? <p>“{tile.quoteText}”</p> : <p>{tile.caption}</p>}
              <details className="tile-why">
                <summary>Why this?</summary>
                <p>{tile.rationale}</p>
                <Sources ids={tile.evidenceIds} evidence={evidence} />
              </details>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
function Facts({ items, evidence }: { items: CitedText[]; evidence: Evidence[] }) {
  return (
    <div className="fact-list">
      {items.map((item, i) => (
        <article key={i}>
          <p>{item.text}</p>
          <Sources ids={item.evidenceIds} evidence={evidence} />
        </article>
      ))}
    </div>
  );
}
export function OutreachView({
  data,
  evidence,
  userContext,
  beforeCopy,
}: ResultProps<OutreachResult>) {
  return (
    <div className="results">
      <div className="result-intro">
        <span className="eyebrow">What stands out</span>
        <p>{data.summary.text}</p>
        <Sources ids={data.summary.evidenceIds} evidence={evidence} />
      </div>
      <MoodboardView board={data.moodboard} evidence={evidence} />
      <section>
        <div className="section-heading">
          <h2>Details worth asking about</h2>
          <span className="count">{data.professionalInterests.length}</span>
        </div>
        <Facts items={data.professionalInterests} evidence={evidence} />
      </section>
      {data.commonGround.length > 0 && (
        <section>
          <h2>Your common ground</h2>
          {data.commonGround.map((item, i) => (
            <article className="idea-card" key={i}>
              <p>{item.text}</p>
              <Sources
                ids={item.evidenceIds}
                userIds={item.userContextIds}
                evidence={evidence}
                userContext={userContext}
              />
            </article>
          ))}
        </section>
      )}
      <section>
        <span className="eyebrow">Possible ideas</span>
        <h2>A good place to start</h2>
        {data.conversationStarters.map((item, i) => (
          <article className="idea-card" key={i}>
            <span className="idea-number">0{i + 1}</span>
            <h3>{item.question}</h3>
            <p className="muted">{item.rationale.text}</p>
            <Sources
              ids={item.rationale.evidenceIds}
              evidence={evidence}
              userIds={item.userContextIds}
              userContext={userContext}
            />
          </article>
        ))}
      </section>
      <section>
        <h2>Over a coffee</h2>
        <Facts items={data.coffeeAgenda} evidence={evidence} />
      </section>
      <section>
        <span className="eyebrow">Your next move</span>
        <h2>Open the conversation</h2>
        {data.drafts.map((draft) => (
          <div key={draft.id}>
            <DraftCard draft={draft} beforeCopy={beforeCopy} />
            <Sources
              ids={draft.evidenceIds}
              userIds={draft.userContextIds}
              evidence={evidence}
              userContext={userContext}
            />
          </div>
        ))}
      </section>
    </div>
  );
}
export function RomanticView({
  data,
  evidence,
  userContext,
  beforeCopy,
  config,
}: ResultProps<RomanticResult>) {
  const song = getSong(data.song.catalogueId);
  return (
    <div className="results">
      <div className="result-intro">
        <span className="eyebrow">What stands out</span>
        <p>{data.summary.text}</p>
        <Sources ids={data.summary.evidenceIds} evidence={evidence} />
      </div>
      <MoodboardView board={data.moodboard} evidence={evidence} />
      {song && <Soundtrack tone={String(config?.tone ?? 'warm')} tags={[...song.tags]} />}
      <section>
        <h2>The things they enjoy</h2>
        <ul className="interest-list">
          {data.interests.map((item, i) => (
            <li key={i}>
              <span>{item.text}</span>
              <Sources ids={item.evidenceIds} evidence={evidence} />
            </li>
          ))}
        </ul>
      </section>
      <section>
        <span className="eyebrow">Possible ideas</span>
        <h2>Make a little plan</h2>
        {data.dateIdeas.map((idea, i) => (
          <article className="idea-card date-card" key={idea.id}>
            <span className="idea-number">0{i + 1}</span>
            <h3>{idea.title}</h3>
            <div className="tags">
              <span>{idea.durationBand}</span>
              <span>{idea.costBand} cost</span>
              <span>
                {idea.setting === 'either' ? 'Indoor or outdoor' : readable(idea.setting)}
              </span>
            </div>
            <p>{idea.activity}</p>
            <p className="muted">{idea.rationale.text}</p>
            <Sources
              ids={idea.rationale.evidenceIds}
              evidence={evidence}
              userIds={idea.userContextIds}
              userContext={userContext}
            />
            <details className="alternative">
              <summary>Another way to do it</summary>
              <p>{idea.alternative}</p>
            </details>
            <DraftCard draft={idea.invitation} beforeCopy={beforeCopy} />
          </article>
        ))}
      </section>
      <section>
        <span className="eyebrow">Keep it natural</span>
        <h2>Ask, with room for a no</h2>
        {data.drafts.map((draft) => (
          <div key={draft.id}>
            <DraftCard draft={draft} beforeCopy={beforeCopy} />
            <Sources
              ids={draft.evidenceIds}
              evidence={evidence}
              userIds={draft.userContextIds}
              userContext={userContext}
            />
          </div>
        ))}
      </section>
    </div>
  );
}

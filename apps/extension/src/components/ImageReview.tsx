import { useEffect, useRef, useState } from 'react';
import { SCHEMA_VERSION, type Evidence, type LocalSnapshot } from '@profile-lens/contracts';
import { analyseProfileImages, type PhotoReview, type PhotoSkipReason } from '../services/images';
import { checkConnection } from '../services/backend';

type Review = Omit<PhotoReview, 'observations'> & {
  observations: (PhotoReview['observations'][number] & { evidenceId: string })[];
};
export function ImageReview({
  snapshot,
  token,
  disabled,
  revision = snapshot.inputRevision,
  onBusy,
  onAccept,
  onRemove,
}: {
  snapshot: LocalSnapshot;
  token: string;
  disabled: boolean;
  revision?: number;
  onBusy: (busy: boolean) => void;
  onAccept: (evidence: Evidence) => void;
  onRemove: (imageId: string) => void;
}) {
  const [available, setAvailable] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState('Checking image analysis availability…');
  const [capabilityRevision, setCapabilityRevision] = useState(0);
  const [photos, setPhotos] = useState<Review[]>([]);
  const [running, setRunning] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [status, setStatus] = useState('');
  const [skipReasons, setSkipReasons] = useState<PhotoSkipReason[]>([]);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const completed = useRef(0);
  const busyCallback = useRef(onBusy);
  busyCallback.current = onBusy;
  const stop = () => {
    generation.current++;
    abort.current?.abort();
    abort.current = null;
    setRunning(false);
    busyCallback.current(false);
    setStatus(
      `${completed.current} / 50 photos analysed. Stopped; completed observations are available below.`,
    );
  };
  useEffect(() => {
    let active = true;
    let checking = false;
    let enabled = false;
    setAvailable(false);
    const refresh = async () => {
      if (checking) return;
      if (!token) {
        setConnectionIssue('Connect using your backend token in Settings first.');
        return;
      }
      checking = true;
      try {
        const caps = await checkConnection(token);
        if (!active) return;
        enabled = caps.schemaVersion === SCHEMA_VERSION && caps.images?.enabled === true;
        setAvailable(enabled);
        setConnectionIssue(
          caps.schemaVersion !== SCHEMA_VERSION
            ? 'Extension and backend versions differ. Restart the API and reload the extension.'
            : !caps.images?.enabled
              ? 'The running API has image analysis disabled. Set IMAGE_ANALYSIS_ENABLED=true in .env and restart the API.'
              : '',
        );
      } catch (error) {
        if (active) {
          enabled = false;
          setAvailable(false);
          setConnectionIssue(
            error instanceof TypeError
              ? 'Cannot reach the backend. Start the API and check your connection in Settings.'
              : error instanceof Error
                ? error.message
                : 'Could not check image analysis availability.',
          );
        }
      } finally {
        checking = false;
      }
    };
    void refresh();
    const retry = () => {
      void refresh();
    };
    const timer = setInterval(() => {
      if (!enabled) void refresh();
    }, 10000);
    window.addEventListener('focus', retry);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', retry);
    };
  }, [token, capabilityRevision]);
  useEffect(() => {
    return () => {
      generation.current++;
      abort.current?.abort();
      busyCallback.current(false);
    };
  }, []);
  useEffect(() => {
    if (abort.current) stop();
  }, [snapshot.inputRevision, revision]);
  const start = async () => {
    setAttempted(true);
    const revision = ++generation.current;
    const controller = new AbortController();
    abort.current = controller;
    completed.current = 0;
    setPhotos([]);
    setSkipReasons([]);
    setRunning(true);
    onBusy(true);
    setStatus(
      '0 / 50 photos analysed. Keep Instagram open; posts and carousel photos will open automatically.',
    );
    try {
      const message = await analyseProfileImages(
        snapshot,
        token,
        controller.signal,
        (batch, count) => {
          if (revision !== generation.current) return;
          completed.current = count;
          setPhotos((previous) => [
            ...previous,
            ...batch.map((p) => ({
              ...p,
              observations: p.observations.map((o) => ({
                ...o,
                evidenceId: `v${crypto.randomUUID()}`,
              })),
            })),
          ]);
          setStatus(`${count} / 50 photos analysed. Keep the profile open.`);
        },
        undefined,
        (message, skips) => {
          if (revision === generation.current) {
            setStatus(message);
            setSkipReasons(skips);
          }
        },
      );
      if (revision === generation.current) setStatus(message);
    } catch (error) {
      if (revision === generation.current)
        setStatus(
          `${completed.current} / 50 photos analysed. Partial result: ${error instanceof Error ? error.message : 'Photo analysis stopped.'}`,
        );
    } finally {
      if (revision === generation.current) {
        abort.current = null;
        setRunning(false);
        onBusy(false);
      }
    }
  };
  return (
    <section className="image-review" aria-label="Profile photo analysis">
      <h2>Explore their photos</h2>
      <p className="hint">
        Automatically open profile posts and inspect up to 50 photos, including carousel slides.
        Photos are analysed as displayed, including overlays. Sends cropped photos to your local
        backend and OpenAI. Image text and contact details may remain visible in the pixels.
      </p>
      {!available && (
        <div>
          <p className="hint" role="status">
            {connectionIssue}
          </p>
          <button
            className="text-button"
            onClick={() => setCapabilityRevision((value) => value + 1)}
          >
            Recheck image connection
          </button>
        </div>
      )}
      {running ? (
        <button className="button secondary" onClick={stop}>
          Stop photo analysis
        </button>
      ) : (
        <button
          className="button secondary"
          disabled={disabled || !available || attempted}
          onClick={() => void start()}
        >
          Analyse profile images
        </button>
      )}
      {attempted && !running && (
        <p className="hint">Read the profile again to start a fresh photo run.</p>
      )}
      <p role="status" aria-live="polite">
        {status}
      </p>
      {skipReasons.length > 0 && (
        <div aria-label="Skipped photo reasons">
          <strong>Why photos were skipped</strong>
          <ul>
            {skipReasons.map(({ reason, count }) => (
              <li key={reason}>
                {count} × {reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {photos.map((photo, index) => (
        <details key={photo.id} className="photo-review">
          <summary>
            Photo {index + 1} · {photo.observations.length} observations
          </summary>
          <img src={photo.thumbnail} alt={`Source photo ${index + 1}`} width={160} />
          <button
            className="text-button"
            disabled={disabled}
            onClick={() => {
              stop();
              onRemove(photo.id);
              setPhotos((previous) => previous.filter((p) => p.id !== photo.id));
            }}
          >
            Remove photo {index + 1}
          </button>
          {!photo.observations.length && (
            <p className="hint">No supported observations were returned for this photo.</p>
          )}
          {photo.observations.map((o) => {
            const accepted = snapshot.profile.evidence.some((e) => e.id === o.evidenceId);
            return (
              <div key={o.evidenceId} className="evidence-item">
                <label>
                  {o.kind === 'ocr' ? 'Text visible in photo' : 'Visual observation'}
                  <textarea
                    aria-label={`Photo ${index + 1} observation ${o.evidenceId}`}
                    value={o.text}
                    maxLength={450}
                    disabled={running || disabled || accepted}
                    onChange={(event) =>
                      setPhotos((previous) =>
                        previous.map((p) => ({
                          ...p,
                          observations: p.observations.map((item) =>
                            item.evidenceId === o.evidenceId
                              ? { ...item, text: event.target.value }
                              : item,
                          ),
                        })),
                      )
                    }
                  />
                </label>
                {o.uncertainty && <p className="hint">Uncertainty: {o.uncertainty}</p>}
                <p className="hint">
                  A photo observation does not establish the owner's interests or identity.
                </p>
                <button
                  className="text-button"
                  disabled={running || disabled || accepted || !o.text.trim()}
                  onClick={() =>
                    onAccept({
                      id: o.evidenceId,
                      text: `${o.text}${o.uncertainty ? ` (Uncertainty: ${o.uncertainty})` : ''}`.slice(
                        0,
                        600,
                      ),
                      sourceKind: 'visual',
                      attribution: 'visual_observation',
                      sourceImageId: photo.id,
                      observationKind: o.kind,
                      sectionLabel: `Photo ${index + 1} · ${o.kind === 'ocr' ? 'OCR' : 'visual observation'}`,
                    })
                  }
                >
                  {accepted ? 'Accepted as evidence' : 'Accept observation'}
                </button>
              </div>
            );
          })}
        </details>
      ))}
    </section>
  );
}

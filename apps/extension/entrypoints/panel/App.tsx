import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  CircleDot,
  Eye,
  Leaf,
  LoaderCircle,
  RefreshCw,
  ScanText,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  CATALOGUE_VERSION,
  SCHEMA_VERSION,
  SESSION_TTL,
  manualProfile,
  modeSchemas,
  requestSchema,
  redactText,
  type AnalysisResponse,
  type LocalSnapshot,
  type ModeId,
  type UserContext,
} from '@profile-lens/contracts';
import { ImageReview } from '../../src/components/ImageReview';
import { profileSchema, type Evidence } from '@profile-lens/contracts';
import { clientModes } from '../../src/modes';
import { analyse, checkConnection } from '../../src/services/backend';
import { capture, isCurrent, readToken, release, saveToken } from '../../src/services/browser';
import { cvContext, readCv, type SavedCv } from '../../src/services/cv';

type Stage = 'idle' | 'extracting' | 'reviewing' | 'analysing' | 'ready';
export default function App() {
  const [modeId, setModeId] = useState<ModeId>('outreach');
  const mode = clientModes[modeId];
  const [config, setConfig] = useState<Record<string, unknown>>({ ...mode.defaults });
  const [stage, setStage] = useState<Stage>('idle');
  const [snapshot, setSnapshot] = useState<LocalSnapshot | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [contextText, setContextText] = useState('');
  const [remember, setRemember] = useState(false);
  const [cv, setCv] = useState<SavedCv | null>(null);
  const [cvStatus, setCvStatus] = useState('');
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [token, setToken] = useState('');
  const [settings, setSettings] = useState(false);
  const [connection, setConnection] = useState('');
  const [checking, setChecking] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteName, setPasteName] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const [cached, setCached] = useState(false);
  const epoch = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const currentSnapshot = useRef<LocalSnapshot | null>(null);
  const cache = useRef(new Map<string, { result: AnalysisResponse; expiresAt: number }>());
  currentSnapshot.current = snapshot;
  const cancel = () => {
    epoch.current++;
    abort.current?.abort();
    abort.current = null;
  };
  const invalidate = () => {
    cancel();
    setResult(null);
    setCached(false);
    setError('');
    setStage(currentSnapshot.current ? 'reviewing' : 'idle');
  };
  const clear = (message = '') => {
    cancel();
    release(currentSnapshot.current);
    currentSnapshot.current = null;
    setSnapshot(null);
    setResult(null);
    cache.current.clear();
    setStage('idle');
    setError('');
    setNotice(message);
    setPasteText('');
    setPasteName('');
  };
  useEffect(() => {
    void readToken().then(setToken);
    void chrome.storage.local.get('savedCv').then(({ savedCv }) => {
      const value = savedCv as Partial<SavedCv> | undefined;
      if (typeof value?.name === 'string' && typeof value.text === 'string')
        setCv({ name: value.name, text: value.text });
    });
    void chrome.storage.local.get('savedContext').then(({ savedContext }) => {
      if (typeof savedContext === 'string') {
        setContextText(savedContext);
        setRemember(true);
      }
      setPreferencesLoaded(true);
    });
    return () => {
      epoch.current++;
      abort.current?.abort();
      release(currentSnapshot.current);
    };
  }, []);
  useEffect(() => {
    if (!preferencesLoaded) return;
    if (remember) void chrome.storage.local.set({ savedContext: contextText });
    else void chrome.storage.local.remove('savedContext');
  }, [remember, contextText, preferencesLoaded]);
  useEffect(() => {
    if (stage === 'ready' || stage === 'idle') window.scrollTo({ top: 0, behavior: 'instant' });
  }, [stage]);
  useEffect(() => {
    if (!snapshot) return;
    const captured = snapshot;
    const check = async () => {
      const expired = Date.now() - Date.parse(captured.capturedAt) >= SESSION_TTL;
      const current = !expired && (await isCurrent(captured));
      if (!current && currentSnapshot.current?.profile.snapshotId === captured.profile.snapshotId)
        clear(
          expired
            ? 'This session expired. Read the profile again.'
            : 'The active profile changed. Read it again to continue.',
        );
    };
    const timer = setInterval(() => void check(), 2000);
    const listener = (message: { type?: string }, sender: chrome.runtime.MessageSender) => {
      if (sender.id === chrome.runtime.id && message.type === 'PROFILE_LENS_TAB_CHANGED')
        void check();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      clearInterval(timer);
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [snapshot?.profile.snapshotId]); // Deliberately keyed to the capture, not review edits.

  const readProfile = async () => {
    clear();
    setStage('extracting');
    const revision = ++epoch.current;
    try {
      const value = await capture();
      if (revision !== epoch.current) {
        release(value);
        return;
      }
      currentSnapshot.current = value;
      setSnapshot(value);
      setStage('reviewing');
      setPasteOpen(false);
    } catch (e) {
      if (revision === epoch.current) {
        setError(e instanceof Error ? e.message : 'Could not read the profile.');
        setStage('idle');
      }
    }
  };
  const pasteProfile = () => {
    clear();
    const value: LocalSnapshot = {
      profile: manualProfile(pasteText, pasteName),
      tabId: null,
      routeFingerprint: null,
      canonicalDisplayUrl: null,
      adapterId: 'manual',
      capturedAt: new Date().toISOString(),
      inputRevision: 0,
    };
    currentSnapshot.current = value;
    setSnapshot(value);
    setStage('reviewing');
    setPasteOpen(false);
  };
  const editEvidence = (id: string, value: string | null) => {
    if (!snapshot) return;
    invalidate();
    setSnapshot({
      ...snapshot,
      inputRevision: snapshot.inputRevision + 1,
      profile: {
        ...snapshot.profile,
        evidence:
          value === null
            ? snapshot.profile.evidence.filter((e) => e.id !== id)
            : snapshot.profile.evidence.map((e) =>
                e.id === id
                  ? {
                      ...e,
                      text: value,
                      attribution:
                        e.sourceKind === 'visual' ? 'visual_observation' : 'user_supplied',
                      sourceKind: e.sourceKind === 'visual' ? 'visual' : 'manual',
                      sectionLabel: 'Edited by you',
                    }
                  : e,
              ),
      },
    });
  };
  const acceptVisual = (evidence: Evidence) => {
    if (!snapshot) return;
    const profile = profileSchema.safeParse({
      ...snapshot.profile,
      evidence: [...snapshot.profile.evidence, evidence],
    });
    if (!profile.success) {
      setError('Remove some evidence before accepting more observations.');
      return;
    }
    invalidate();
    setSnapshot({ ...snapshot, profile: profile.data, inputRevision: snapshot.inputRevision + 1 });
  };
  const removeVisual = (imageId?: string) => {
    if (!snapshot) return;
    invalidate();
    setSnapshot({
      ...snapshot,
      inputRevision: snapshot.inputRevision + 1,
      profile: {
        ...snapshot.profile,
        evidence: snapshot.profile.evidence.filter((e) =>
          imageId ? e.sourceImageId !== imageId : e.sourceKind !== 'visual',
        ),
      },
    });
  };
  const userContext = (): UserContext => [
    ...contextText
      .split(/\n+/)
      .filter((s) => s.trim())
      .slice(0, 5)
      .map((text, i) => ({
        id: `u${i + 1}`,
        kind: 'interest' as const,
        text: text.trim().slice(0, 600),
      })),
    ...(modeId === 'outreach' && cv ? cvContext(cv.text) : []),
  ];
  const uploadCv = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setCvStatus('That file is over 5 MB. Export a smaller PDF or a .txt file.');
      return;
    }
    setCvStatus('Reading your CV…');
    try {
      const value = await readCv(file);
      await chrome.storage.local.set({ savedCv: value });
      invalidate();
      setCv(value);
      setCvStatus('CV saved on this device. Contact details were removed.');
    } catch (error) {
      setCvStatus(
        error instanceof Error && error.message.startsWith('No readable')
          ? error.message
          : 'Could not read that file. Try a PDF or a .txt export.',
      );
    }
  };
  const beforeCopy = async () => {
    const value = currentSnapshot.current;
    if (
      !value ||
      Date.now() - Date.parse(value.capturedAt) >= SESSION_TTL ||
      !(await isCurrent(value))
    ) {
      clear('The profile changed or expired. Read it again before copying.');
      return false;
    }
    return true;
  };
  const generate = async (regenerate = false) => {
    if (!snapshot) return;
    const issue = mode.inputIssue(snapshot.profile, config);
    if (issue) {
      setError(issue);
      return;
    }
    const cleaned = snapshot.profile.evidence.map((e) => ({ ...e, text: redactText(e.text) }));
    if (cleaned.some((e, i) => e.text !== snapshot.profile.evidence[i]?.text)) {
      invalidate();
      setSnapshot({
        ...snapshot,
        profile: { ...snapshot.profile, evidence: cleaned },
        inputRevision: snapshot.inputRevision + 1,
      });
      setNotice(
        'Contact details or formatting were removed from your edits. Review the updated text, then generate again.',
      );
      return;
    }
    if (!token) {
      setSettings(true);
      setConnection(
        'Paste the local backend token to connect. The OpenAI key stays on the server.',
      );
      return;
    }
    cancel();
    const revision = epoch.current;
    setError('');
    setNotice('');
    setStage('analysing');
    setResult(null);
    setCached(false);
    const controller = new AbortController();
    abort.current = controller;
    try {
      if (!(await beforeCopy()) || revision !== epoch.current) return;
      const input = requestSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        catalogueVersion: CATALOGUE_VERSION,
        requestId: crypto.randomUUID(),
        mode: modeId,
        modeVersion: modeSchemas[modeId].version,
        profile: snapshot.profile,
        userContext: userContext(),
        modeConfig: config,
      });
      modeSchemas[modeId].config.parse(config);
      const key = JSON.stringify({ ...input, requestId: null });
      const saved = cache.current.get(key);
      if (!regenerate && saved && saved.expiresAt > Date.now()) {
        setResult(saved.result);
        setCached(true);
        setStage('ready');
        return;
      }
      const output = await analyse(
        input,
        token,
        AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
      );
      if (revision !== epoch.current || !(await isCurrent(snapshot))) return;
      if (output.status === 'ready') modeSchemas[modeId].result.parse(output.result);
      else if (output.result !== null) throw new Error('The backend returned an invalid outcome.');
      if (revision !== epoch.current) return;
      cache.current.set(key, { result: output, expiresAt: Date.now() + SESSION_TTL });
      setResult(output);
      setStage('ready');
    } catch (e) {
      if (revision !== epoch.current) return;
      setStage('reviewing');
      setError(
        e instanceof Error && e.name === 'ZodError'
          ? 'Some input or output fields are invalid. Check the profile and try again.'
          : e instanceof TypeError
            ? 'Cannot reach the local backend. Start it and check Settings.'
            : e instanceof Error
              ? e.message
              : 'Analysis failed. Please retry.',
      );
    }
  };
  const connect = async () => {
    setChecking(true);
    setConnection('');
    try {
      const caps = await checkConnection(token.trim());
      if (
        caps.schemaVersion !== SCHEMA_VERSION ||
        caps.catalogueVersion !== CATALOGUE_VERSION ||
        !Object.values(clientModes).every((m) =>
          caps.modes.some((c) => c.id === m.id && c.version === modeSchemas[m.id].version),
        )
      )
        throw new Error('Extension and backend versions do not match. Rebuild and reload both.');
      await saveToken(token.trim());
      setToken(token.trim());
      setConnection('Connected. Live analysis is ready.');
    } catch (e) {
      setConnection(
        e instanceof TypeError
          ? 'Backend unavailable. Start the local API first.'
          : e instanceof Error
            ? e.message
            : 'Connection failed.',
      );
    } finally {
      setChecking(false);
    }
  };
  const busy = stage === 'analysing' || stage === 'extracting' || imageBusy;
  return (
    <main className={`app theme-${mode.theme}`}>
      <header className="app-header">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-mark">
            <Leaf size={19} />
          </span>
          profile<span className="brand-serif">lens</span>
        </a>
        <button
          className="icon-button"
          aria-label="Connection settings"
          onClick={() => setSettings(!settings)}
        >
          <Settings2 size={18} />
        </button>
      </header>
      {settings && (
        <section className="settings-panel">
          <div className="section-heading">
            <h2>Local connection</h2>
            <button
              className="icon-button"
              aria-label="Close settings"
              onClick={() => setSettings(false)}
            >
              <X size={17} />
            </button>
          </div>
          <p className="hint">
            Your OpenAI key belongs in the backend’s .env. Paste only its local connection token
            here.
          </p>
          <label>
            Backend token
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => {
                removeVisual();
                setToken(e.target.value);
                setConnection('');
                invalidate();
              }}
            />
          </label>
          <p className="hint mono">Extension ID: {chrome.runtime.id}</p>
          <label className="context-label">
            Your CV <span>optional · used in Outreach</span>
            <input
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain"
              onChange={(e) => {
                void uploadCv(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          {cv && (
            <p className="hint">
              Using {cv.name} ({cv.text.length.toLocaleString()} characters).{' '}
              <button
                className="text-button"
                onClick={() => {
                  invalidate();
                  setCv(null);
                  setCvStatus('CV removed.');
                  void chrome.storage.local.remove('savedCv');
                }}
              >
                Remove CV
              </button>
            </p>
          )}
          <p role="status" className="hint">
            {cvStatus}
          </p>
          <button
            className="button secondary"
            disabled={checking || !token.trim()}
            onClick={() => void connect()}
          >
            {checking ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Check &
            save
          </button>
          <p role="status" className="hint">
            {connection}
          </p>
          <button
            className="text-button"
            onClick={() => {
              clear();
              setContextText('');
              setRemember(false);
              setCv(null);
              setCvStatus('');
              setToken('');
              setConnection('Settings cleared.');
              void chrome.storage.local.clear();
              void chrome.storage.session.clear();
            }}
          >
            Reset local settings
          </button>
        </section>
      )}
      <nav className="mode-switch" aria-label="Analysis mode">
        {Object.values(clientModes).map((item) => (
          <button
            key={item.id}
            aria-pressed={item.id === modeId}
            onClick={() => {
              invalidate();
              removeVisual();
              setImageBusy(false);
              setModeId(item.id);
              setConfig({ ...item.defaults });
            }}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </nav>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {!snapshot && (
        <section className="welcome">
          <span className="eyebrow">
            <CircleDot size={12} /> A thoughtful first hello
          </span>
          <h1>{mode.heading}</h1>
          <p>Turn what they share into a conversation that feels like you.</p>
          <div className="welcome-art" aria-hidden="true">
            <div className="art-card art-one">
              <img src="/moodboard/coffee-paper.svg" alt="" />
              <span>good conversations</span>
            </div>
            <div className="art-card art-two">
              <img src="/moodboard/books-warm.svg" alt="" />
              <span>begin with curiosity.</span>
            </div>
            <span className="art-spark">✳</span>
          </div>
          <button
            className="button primary full"
            disabled={busy}
            onClick={() => void readProfile()}
          >
            {busy ? <LoaderCircle size={17} className="spin" /> : <ScanText size={17} />} Read this
            profile <ArrowRight size={17} />
          </button>
          <button className="text-button full" onClick={() => setPasteOpen(!pasteOpen)}>
            Or paste profile text
          </button>
          <p className="privacy-note">
            <ShieldCheck size={14} /> Nothing leaves this browser until you generate or analyse
            photos.
          </p>
        </section>
      )}
      {pasteOpen && !snapshot && (
        <section className="paste-panel">
          <h2>Bring a little context</h2>
          <label>
            Name (optional)
            <input
              value={pasteName}
              maxLength={120}
              onChange={(e) => setPasteName(e.target.value)}
              placeholder="Their first name"
            />
          </label>
          <label>
            Profile text
            <textarea
              value={pasteText}
              maxLength={18000}
              onChange={(e) => setPasteText(e.target.value)}
              rows={7}
              placeholder="Paste their bio, projects, or stated interests…"
            />
          </label>
          <button
            className="button primary full"
            disabled={!pasteText.trim()}
            onClick={pasteProfile}
          >
            Review this text <ArrowRight size={16} />
          </button>
        </section>
      )}
      {stage === 'extracting' && (
        <p className="notice" role="status">
          Reading profile sections. LinkedIn capture scrolls and expands details and may take up to
          a minute. Keep this profile open.
        </p>
      )}
      {snapshot && (
        <>
          <div className="profile-strip">
            <div className="avatar">{(snapshot.profile.displayName ?? 'P').slice(0, 1)}</div>
            <div>
              <strong>{snapshot.profile.displayName ?? 'This profile'}</strong>
              <span>
                {snapshot.canonicalDisplayUrl
                  ? new URL(snapshot.canonicalDisplayUrl).hostname
                  : 'Text provided by you'}
              </span>
            </div>
            <button className="icon-button" aria-label="Clear session" onClick={() => clear()}>
              <X size={17} />
            </button>
          </div>
          <button
            className="button secondary full"
            disabled={busy}
            onClick={() => void readProfile()}
          >
            <ScanText size={17} /> Read this profile again
          </button>
          {snapshot.adapterId === 'instagram-best-effort' && (
            <ImageReview
              key={`${snapshot.profile.snapshotId}:${modeId}:${token}`}
              snapshot={snapshot}
              revision={epoch.current}
              token={token}
              disabled={stage === 'analysing'}
              onBusy={setImageBusy}
              onAccept={acceptVisual}
              onRemove={removeVisual}
            />
          )}
          {stage !== 'ready' && (
            <section className="review">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Start with what’s there</span>
                  <h1>Review the details.</h1>
                </div>
                <Eye size={20} />
              </div>
              <p className="hint">
                {snapshot.profile.evidence.length} snippets · Only retained text below is sent. Edit
                or remove anything you don’t want to use.
              </p>
              {snapshot.captureWarnings?.map((warning) => (
                <p className="notice" key={warning}>
                  {warning}
                </p>
              ))}
              {snapshot.profile.truncated && (
                <p className="notice">
                  Some content was shortened to fit. Review the retained snippets.
                </p>
              )}
              <details className="evidence-review" open={snapshot.profile.evidence.length < 3}>
                <summary>
                  Profile evidence <span>{snapshot.profile.evidence.length}</span>
                </summary>
                {snapshot.profile.evidence.map((e) => (
                  <div className="evidence-item" key={e.id}>
                    <div>
                      <small>{e.sectionLabel}</small>
                      <button
                        className="icon-button"
                        aria-label={`Remove ${e.id}`}
                        disabled={busy}
                        onClick={() => editEvidence(e.id, null)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <textarea
                      aria-label={`Evidence ${e.id}`}
                      maxLength={600}
                      value={e.text}
                      disabled={busy}
                      onChange={(event) => editEvidence(e.id, event.target.value)}
                      rows={3}
                    />
                  </div>
                ))}
              </details>
              <label className="context-label">
                A little about you <span>optional</span>
                <textarea
                  value={contextText}
                  disabled={busy}
                  maxLength={2400}
                  onChange={(e) => {
                    invalidate();
                    setContextText(e.target.value);
                  }}
                  rows={3}
                  placeholder="Your interests, projects, or what you’re curious about. One per line."
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>Remember my context on this device</span>
              </label>
              {modeId === 'outreach' && (
                <p className="hint">
                  {cv
                    ? `Your CV (${cv.name}) is included to personalise ideas and drafts.`
                    : 'Add your CV in settings to personalise ideas and drafts.'}
                </p>
              )}
              <mode.InputFields
                value={config}
                onChange={(value) => {
                  invalidate();
                  setConfig(value);
                }}
              />
              {mode.inputIssue(snapshot.profile, config) && (
                <p className="hint" role="status">
                  {mode.inputIssue(snapshot.profile, config)}
                </p>
              )}
              {stage === 'analysing' ? (
                <div className="loading-state" role="status">
                  <LoaderCircle className="spin" size={24} />
                  <h3>Finding a thoughtful connection…</h3>
                  <p>Creating suggestions from your reviewed details.</p>
                  <button
                    className="text-button"
                    onClick={() => {
                      cancel();
                      setStage('reviewing');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="button primary full"
                    disabled={
                      imageBusy ||
                      !snapshot.profile.evidence.length ||
                      !!mode.inputIssue(snapshot.profile, config)
                    }
                    onClick={() => void generate()}
                  >
                    <Sparkles size={17} /> Generate ideas <ArrowRight size={17} />
                  </button>
                  <p className="privacy-note">
                    Sends reviewed text to your local backend and OpenAI. Suggestions are
                    possibilities, not personal assessments.
                  </p>
                </>
              )}
            </section>
          )}
          {stage === 'ready' && result && (
            <>
              <div className="result-toolbar">
                <button className="text-button" onClick={invalidate}>
                  <ChevronLeft size={14} /> Edit input
                </button>
                <span className="live-badge">
                  <span />
                  {cached ? 'Cached result' : 'Live analysis'}
                </span>
                <button
                  className="icon-button"
                  aria-label="Regenerate"
                  disabled={imageBusy}
                  onClick={() => void generate(true)}
                >
                  <RefreshCw size={15} />
                </button>
              </div>
              {result.status === 'ready' ? (
                <mode.ResultView
                  key={result.generatedAt}
                  data={result.result}
                  evidence={snapshot.profile.evidence}
                  userContext={userContext()}
                  beforeCopy={beforeCopy}
                />
              ) : (
                <section className="empty-result">
                  <Sparkles size={30} />
                  <h2>
                    {result.status === 'blocked'
                      ? 'A little care comes first.'
                      : 'A little more to go on.'}
                  </h2>
                  <p>{result.reason}</p>
                  {result.missingInformation.length > 0 && (
                    <p className="hint">Useful context: {result.missingInformation.join(', ')}</p>
                  )}
                  <button className="button secondary" onClick={invalidate}>
                    Edit profile details
                  </button>
                </section>
              )}
            </>
          )}
        </>
      )}
      <footer className="app-footer">
        <span>Curiosity, with a little care.</span>
        <span>PROFILE LENS / 01</span>
      </footer>
    </main>
  );
}

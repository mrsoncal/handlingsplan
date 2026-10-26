import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareReply, Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import {
  subscribe,
  getState,
  remainingSeconds,
  addToQueueByDelegate,
  addToQueueDirect,
  removeFromQueue,
  restoreQueueItem,
  setTypeDuration,
  loadDelegates,
  updateDelegate,
  deleteDelegate,
  saveDelegatesToLocalStorageRaw,
  isTutorialMode,
  startNext,
  startSpecific,
  pauseTimer,
  resumeTimer,
  skipCurrent,
  restoreCurrentSpeaker,
  resetTimer,
  normalizeType,
} from "./store/bus.js";

import DelegatesTable from "./components/DelegatesTable.jsx";
import AppNavigation from "./components/AppNavigation.jsx";
import SiteFooter from "./components/SiteFooter.jsx";
import Tutorial, { TutorialIntro } from "./components/Tutorial.jsx";
import { readDelegatesCsvFile } from "./utils/delegatesCsv.js";
import "./app-extra.css";
import CsvTool from "./components/CsvTool.jsx";
import {
  clearCouncilSession,
  fetchCouncilDelegates,
  getCouncilId,
  getCouncilSession,
  redirectToCouncilSelector,
  saveCouncilDelegates,
  validateCouncilSession,
} from "./api/councilApi.js";


/* ============================
   Store / hash / timer helpers
   ============================ */
function useStore() {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((t) => t + 1)), []);
  return getState();
}
function useHash() {
  const get = () => {
    const h = (location.hash || "").toLowerCase();
    return h && h !== "#" ? h : "#admin";
  };
  const [hash, setHash] = useState(get);
  useEffect(() => {
    const on = () => setHash(get());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}
function useTimerRerender(enabled) {
  const [, setBeat] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setBeat((b) => b + 1), 200);
    return () => clearInterval(id);
  }, [enabled]);
}

const DISPLAY_PRESENCE_KEYS = {
  timer: "talestolen_presence_timer",
  queue: "talestolen_presence_queue",
};

function useDisplayPresence(display) {
  useEffect(() => {
    const key = DISPLAY_PRESENCE_KEYS[display];
    if (!key) return undefined;
    const instanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const announce = () => {
      try {
        localStorage.setItem(key, JSON.stringify({ instanceId, updatedAt: Date.now() }));
      } catch {}
    };
    announce();
    const heartbeat = window.setInterval(announce, 2000);
    return () => {
      window.clearInterval(heartbeat);
      try {
        const presence = JSON.parse(localStorage.getItem(key) || "null");
        if (presence?.instanceId === instanceId) localStorage.removeItem(key);
      } catch {}
    };
  }, [display]);
}

const speakingTypes = [
  { value: "innlegg", label: "Innlegg" },
  { value: "replikk", label: "Replikk" },
];

function TypeDropdown({ value, onChange, label, id }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = speakingTypes.find((option) => option.value === value) || speakingTypes[0];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const focusOption = (position) => {
    window.requestAnimationFrame(() => {
      const options = [...(rootRef.current?.querySelectorAll('[role="option"]') || [])];
      if (!options.length) return;
      const nextPosition = (position + options.length) % options.length;
      options[nextPosition]?.focus();
    });
  };

  const handleOptionKeyDown = (event, index) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(speakingTypes.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      rootRef.current?.querySelector(".type-select-trigger")?.focus();
    }
  };

  return (
    <div className="type-select" ref={rootRef}>
      <button
        id={id}
        type="button"
        className="type-select-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            focusOption(event.key === "ArrowDown" ? 0 : speakingTypes.length - 1);
          }
        }}
      >
        <span>{selected.label}</span>
        <span className="type-select-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="type-select-menu" role="listbox" aria-label={label}>
          {speakingTypes.map((option, index) => (
            <button
              type="button"
              className="type-select-option"
              role="option"
              aria-selected={option.value === value}
              tabIndex={option.value === value ? 0 : -1}
              key={option.value}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
              {option.value === value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TimeStepper({ label, value, onChange }) {
  const numericValue = Number(value) || 10;
  const update = (nextValue) => onChange(Math.max(10, nextValue));

  return (
    <div className="time-control">
      <label className="time-label" htmlFor={`duration-${label}`}>{label}</label>
      <div className="time-stepper">
        <button
          type="button"
          className="time-stepper-button"
          aria-label={`Reduser tid for ${label}`}
          disabled={numericValue <= 10}
          onClick={() => update(numericValue - 5)}
        >
          −
        </button>
        <div className="time-value-wrap">
          <input
            id={`duration-${label}`}
            className="time-value"
            type="number"
            min="10"
            step="5"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
        <button
          type="button"
          className="time-stepper-button"
          aria-label={`Øk tid for ${label}`}
          onClick={() => update(numericValue + 5)}
        >
          +
        </button>
      </div>
    </div>
  );
}

/* ============================
   App (routes)
   ============================ */
export default function App() {
  const state = useStore();
  const hash = useHash();
  const councilId = useMemo(() => getCouncilId(), []);
  const [councilAccess, setCouncilAccess] = useState({ loading: true, ready: false, error: "", council: null });
  const [delegateSaveError, setDelegateSaveError] = useState("");
  const lastSavedDelegatesRef = useRef(null);
  const delegateSaveQueueRef = useRef(Promise.resolve());
  useTimerRerender(hash !== "#queue");

  useEffect(() => {
    let cancelled = false;
    async function bootstrapCouncil() {
      if (!councilId || !getCouncilSession(councilId)) {
        redirectToCouncilSelector(councilId);
        return;
      }
      try {
        const [sessionResult, delegates] = await Promise.all([
          validateCouncilSession(councilId),
          fetchCouncilDelegates(councilId),
        ]);
        if (cancelled) return;
        loadDelegates(delegates);
        lastSavedDelegatesRef.current = JSON.stringify(
          Object.values(getState().delegates || {}).map(({ number, name, org }) => ({ number, name, org }))
        );
        setCouncilAccess({ loading: false, ready: true, error: "", council: sessionResult.council || null });
      } catch (error) {
        if (cancelled) return;
        if (error.status === 401 || error.status === 403) {
          clearCouncilSession(councilId);
          redirectToCouncilSelector(councilId);
          return;
        }
        setCouncilAccess({ loading: false, ready: false, error: error.message || "Talestolen kunne ikke åpnes.", council: null });
      }
    }
    bootstrapCouncil();
    return () => { cancelled = true; };
  }, [councilId]);

  useEffect(() => {
    if (!councilAccess.ready || !councilId || isTutorialMode()) return undefined;
    const delegates = Object.values(state.delegates || {}).map(({ number, name, org }) => ({ number, name, org }));
    const snapshot = JSON.stringify(delegates);
    if (snapshot === lastSavedDelegatesRef.current) return undefined;
    const timeout = window.setTimeout(() => {
      if (isTutorialMode()) return;
      delegateSaveQueueRef.current = delegateSaveQueueRef.current
        .catch(() => {})
        .then(async () => {
          if (isTutorialMode() || snapshot === lastSavedDelegatesRef.current) return;
          await saveCouncilDelegates(councilId, delegates);
          lastSavedDelegatesRef.current = snapshot;
          setDelegateSaveError("");
        })
        .catch((error) => {
          if (error.status === 401 || error.status === 403) {
            clearCouncilSession(councilId);
            redirectToCouncilSelector(councilId);
            return;
          }
          console.error("Kunne ikke lagre delegatlisten", error);
          setDelegateSaveError("Delegatlisten kunne ikke lagres i rådet. Endringene finnes foreløpig bare på denne enheten.");
        });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [councilAccess.ready, councilId, state.delegates]);

  if (councilAccess.loading) {
    return <main className="access-state"><p>Åpner Talestolen for valgt ungdomsråd …</p></main>;
  }
  if (councilAccess.error) {
    return <main className="access-state"><h1>Talestolen kunne ikke åpnes</h1><p>{councilAccess.error}</p><button className="btn" onClick={() => redirectToCouncilSelector(councilId)}>Til rådvelgeren</button></main>;
  }

  if (hash === "#timer") return <TimerFull state={state} />;
  if (hash === "#queue") return <QueueFull state={state} />;
  if (hash === "#csv-verktoy") return <CsvTool delegateSaveError={delegateSaveError} />;
  return <AdminView state={state} delegateSaveError={delegateSaveError} />;
}

/* ============================
   Admin
   ============================ */
function AdminView({ state, delegateSaveError }) {
  const introStorageKey = "talestolen_tutorial_intro_seen_v1";
  const [showTutorialIntro, setShowTutorialIntro] = useState(() => {
    try { return localStorage.getItem(introStorageKey) !== "1"; } catch { return true; }
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialFileName, setTutorialFileName] = useState("");
  const dismissTutorialIntro = useCallback(() => {
    setShowTutorialIntro(false);
    try { localStorage.setItem(introStorageKey, "1"); } catch {}
  }, []);
  const openTutorial = useCallback(() => {
    dismissTutorialIntro();
    setTutorialFileName("");
    setShowTutorial(true);
  }, [dismissTutorialIntro]);
  const closeTutorial = useCallback(() => {
    setShowTutorial(false);
    setTutorialFileName("");
  }, []);
  const [speakerQuery, setSpeakerQuery] = useState("");
  const [type, setType] = useState("innlegg");
  const [manualOrg, setManualOrg] = useState("");
  const [lastInnlegg, setLastInnlegg] = useState(null);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvImportProgress, setCsvImportProgress] = useState(null);
  const [csvImportError, setCsvImportError] = useState("");
  const csvImportRunRef = useRef(0);
  const [undoNotice, setUndoNotice] = useState(null);
  const undoTimerRef = useRef(null);

  useEffect(() => () => window.clearTimeout(undoTimerRef.current), []);

  // When current speaker switches to an innlegg, remember them
  useEffect(() => {
    const s = state.currentSpeaker;
    if (s && (normalizeType ? normalizeType(s.type) : s.type) === 'innlegg') {
      setLastInnlegg({
        id: s.id,
        name: s.name,
        org: s.org,
        delegateNumber: s.delegateNumber ?? '',
      });
    }
  }, [state.currentSpeaker?.id]);

  // type durations
  const [dInnlegg, setDInnlegg] = useState(state.typeDurations.innlegg);
  const [dReplikk, setDReplikk] = useState(state.typeDurations.replikk);
  const [dSvar, setDSvar] = useState(state.typeDurations.svar_replikk);
  useEffect(() => {
    setDInnlegg(state.typeDurations.innlegg);
    setDReplikk(state.typeDurations.replikk);
    setDSvar(state.typeDurations.svar_replikk);
  }, [state.typeDurations]);

  const cur = state.currentSpeaker;
  const remain = cur ? fmt(remainingSeconds(cur)) : "00:00";
  const delegates = useMemo(() => Object.values(state.delegates || {}), [state.delegates]);
  const normalizedQuery = speakerQuery.trim().toLocaleLowerCase("no");
  const matchedDelegate = delegates.find((delegate) =>
    String(delegate.number || "").toLocaleLowerCase("no") === normalizedQuery
    || String(delegate.name || "").toLocaleLowerCase("no") === normalizedQuery
    || `${delegate.number} - ${delegate.name}`.toLocaleLowerCase("no") === normalizedQuery
  );
  const hasSvarReplikk = cur?.type === "svar_replikk"
    || state.queue.some((item) => item.type === "svar_replikk");

  /* ---- LAN/P2P removed: keep a no-op stub so existing calls don't break ---- */
  const sendSync = () => { /* no-op */ };

  /* ---- handlers ---- */
  async function handleCSV(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const run = ++csvImportRunRef.current;
    const startedAt = Date.now();
    setCsvFileName(file.name);
    setCsvImportError("");
    setCsvImportProgress(5);
    try {
      const { text, rows } = await readDelegatesCsvFile(file, {
        onProgress: (progress) => {
          if (run === csvImportRunRef.current) setCsvImportProgress(Math.min(95, 5 + Math.round(progress * 0.9)));
        },
      });
      if (run !== csvImportRunRef.current) return;
      if (!rows.length) throw new Error("CSV-filen inneholder ingen gyldige delegater.");
      try { saveDelegatesToLocalStorageRaw(text); } catch {}
      loadDelegates(rows);
      setCsvImportProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, 700 - (Date.now() - startedAt))));
    } catch (error) {
      console.error("[CSV] parse error:", error);
      if (run === csvImportRunRef.current) setCsvImportError(error.message || "CSV-filen kunne ikke leses.");
    } finally {
      if (run === csvImportRunRef.current) setCsvImportProgress(null);
      e.target.value = "";
    }
  }
  function handleAddSpeaker(event) {
    event.preventDefault();
    if (!speakerQuery.trim()) return;
    if (matchedDelegate) {
      addToQueueByDelegate({ delegateNumber: matchedDelegate.number, type });
    } else {
      addToQueueDirect({ name: speakerQuery.trim(), org: manualOrg.trim(), type });
    }
    setSpeakerQuery("");
    setManualOrg("");
  }

  function offerUndo(message, undo) {
    window.clearTimeout(undoTimerRef.current);
    setUndoNotice({ message, undo });
    undoTimerRef.current = window.setTimeout(() => setUndoNotice(null), 7000);
  }

  function undoLastAction() {
    if (!undoNotice) return;
    undoNotice.undo();
    window.clearTimeout(undoTimerRef.current);
    setUndoNotice(null);
  }

  return (
    <div className="page">
      <AppNavigation active="admin" onOpenTutorial={openTutorial} />
      {delegateSaveError && <p className="delegate-save-error" role="alert">{delegateSaveError}</p>}
      <div className="container">
        <section className="card main-card">

          {/* Row: upload + type defaults */}
          <div className="split">

            <div className="card" data-tutorial="upload">
              <div className={Object.keys(state.delegates).length === 0 ? 'csv-alert' : ''}>
                <div className="title">Last opp delegater (CSV)</div>

                  {/* Show helper only when no delegates are loaded */}
                  {Object.keys(state.delegates).length === 0 && (
                    <div className="csv-helper">
                      Trenger du hjelp med CSV?{' '}
                      <a href="#csv-verktoy" target="talestolen-csv" className="csv-link">Åpne CSV-Verktøy</a>
                    </div>
                  )}

                  <div className="csv-upload">
                    <input
                      id="delegate-csv"
                      className="csv-upload-input"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleCSV}
                    />
                    <label className="csv-upload-button" htmlFor="delegate-csv">
                      <span className="csv-upload-icon" aria-hidden="true">↑</span>
                      Velg CSV-fil
                    </label>
                    <span className={`csv-file-name ${tutorialFileName || csvFileName ? 'has-file' : ''}`}>
                      {tutorialFileName || csvFileName || 'Ingen fil valgt'}
                    </span>
                  </div>
                  {csvImportProgress !== null && <div className="csv-import-progress" role="progressbar" aria-label="Laster inn delegater" aria-valuemin={0} aria-valuemax={100} aria-valuenow={csvImportProgress}><span style={{ width: `${csvImportProgress}%` }} /></div>}
                  {csvImportError && <p className="csv-import-error" role="alert">{csvImportError}</p>}
                  <div className="spacer"></div>
                  <div className="row">
                    <div className="muted">
                      Lastet inn <b>{Object.keys(state.delegates).length}</b> delegater
                    </div>
                  </div>
              </div>
            </div>

            <div className="card time-defaults" data-tutorial="durations">
              <div className="title">Taletid (sekunder)</div>
              <div className="grid-3">
                <TimeStepper
                  label="Innlegg"
                  value={dInnlegg}
                  onChange={(val) => {
                      setDInnlegg(val);
                      setTypeDuration("innlegg", val);
                      sendSync("timer:setDurations", { innlegg: val });
                  }}
                />
                <TimeStepper
                  label="Replikk"
                  value={dReplikk}
                  onChange={(val) => {
                      setDReplikk(val);
                      setTypeDuration("replikk", val);
                      sendSync("timer:setDurations", { replikk: val });
                  }}
                />
                <TimeStepper
                  label="Svar-replikk"
                  value={dSvar}
                  onChange={(val) => {
                      setDSvar(val);
                      setTypeDuration("svar_replikk", val);
                      sendSync("timer:setDurations", { svar_replikk: val });
                  }}
                />
              </div>
            </div>
          </div>

          <div className="spacer"></div>

          <div className="card speaker-add-card" data-tutorial="add-speaker">
            <div className="title">Legg til i talelista</div>
            <form className="speaker-add-form" onSubmit={handleAddSpeaker}>
              <div className="form-field speaker-search-field">
                <label htmlFor="speaker-search">Delegatnummer eller navn</label>
                <input
                  id="speaker-search"
                  className="input"
                  list="delegate-options"
                  autoComplete="off"
                  placeholder="Søk etter delegat"
                  value={speakerQuery}
                  onChange={(event) => setSpeakerQuery(event.target.value)}
                />
                <datalist id="delegate-options">
                  {delegates.map((delegate) => (
                    <option key={delegate.number} value={`${delegate.number} - ${delegate.name}`} />
                  ))}
                </datalist>
              </div>
              {!matchedDelegate && speakerQuery.trim() && (
                <div className="form-field">
                  <label htmlFor="speaker-org">Organisasjon for ny deltaker</label>
                  <input
                    id="speaker-org"
                    className="input"
                    placeholder="Organisasjon"
                    value={manualOrg}
                    onChange={(event) => setManualOrg(event.target.value)}
                  />
                </div>
              )}
              <div className="form-field">
                <label htmlFor="speaker-type">Taletype</label>
                <TypeDropdown
                  id="speaker-type"
                  value={type}
                  onChange={setType}
                  label="Velg taletype"
                />
              </div>
              <button className="btn speaker-add-button" type="submit" disabled={!speakerQuery.trim()}>
                Legg til
              </button>
            </form>
            {speakerQuery.trim() && (
              <div className="speaker-preview" aria-live="polite">
                <span>Forhåndsvisning:</span>{" "}
                <strong>{matchedDelegate?.name || speakerQuery.trim()}</strong>
                {(matchedDelegate?.org || manualOrg) ? ` — ${matchedDelegate?.org || manualOrg}` : ""}
                {!matchedDelegate && <>{" "}<span className="muted manual-note">Ny deltaker</span></>}
              </div>
            )}
          </div>

          <div className="spacer"></div>

          {/* Row: current speaker + queue */}
          <div className="split">
            <div className="card" data-tutorial="current-speaker">
              <div className="title">Snakker Nå</div>
              <div className="list">
                {cur ? (
                  <div className="queue-item current-speaker-card">
                    <div>
                      <div className="big">
                        {cur.name}{" "}
                        <span className="muted">
                          ({cur.delegateNumber ? `#${cur.delegateNumber}` : "–"})
                        </span>
                      </div>
                      <div className="muted">{cur.org || " "}</div>
                      <div className="muted">
                        Type: <b>{labelFor(cur.type)}</b> • Tid:{" "}
                        {cur.baseDurationSec}s{cur.paused && " • Pauset"}
                      </div>
                    </div>
                    <div className="badge">{remain}</div>
                  </div>
                ) : (
                  <div className="muted">Ingen snakker nå.</div>
                )}
              </div>
              <div className="row speaker-actions">
                {!cur && (
                  <button
                    className="btn icon-button"
                    aria-label="Start neste"
                    title="Start neste"
                    onClick={() => {
                      startNext();
                      sendSync("timer:startNext");
                    }}
                    disabled={state.queue.length === 0}
                  >
                    <Play aria-hidden="true" />
                  </button>
                )}
                {cur && (
                  <>
                    <button
                      className="btn secondary icon-button"
                      aria-label={cur.paused ? "Fortsett" : "Pause"}
                      title={cur.paused ? "Fortsett" : "Pause"}
                      onClick={() => {
                        if (cur.paused) {
                          resumeTimer();
                          sendSync("timer:resume");
                        } else {
                          pauseTimer();
                          sendSync("timer:pause");
                        }
                      }}
                    >
                      {cur.paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
                    </button>
                    <button
                      className="btn danger icon-button"
                      aria-label="Avslutt taler"
                      title="Avslutt taler"
                      onClick={() => {
                        const endedSpeaker = { ...cur };
                        const secondsLeft = remainingSeconds(cur);
                        skipCurrent();
                        sendSync("timer:reset");
                        offerUndo(`${cur.name} ble avsluttet.`, () => {
                          restoreCurrentSpeaker(endedSpeaker, secondsLeft);
                        });
                      }}
                    >
                      <Square aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="btn ghost icon-button"
                      aria-label="Nullstill tid"
                      title="Nullstill tid"
                      onClick={() => {
                        resetTimer();
                        sendSync("timer:reset");
                      }}
                    >
                      <RotateCcw aria-hidden="true" />
                    </button>
                    {(normalizeType ? normalizeType(cur.type) : cur.type) === 'replikk'
                      && lastInnlegg
                      && !hasSvarReplikk && (
                        <button
                          type="button"
                          className="btn icon-button"
                          aria-label={`Gi svar-replikk til ${lastInnlegg.name || 'innlegg-holder'}`}
                          title={`Gi svar-replikk til ${lastInnlegg.name || 'innlegg-holder'}`}
                          onClick={() => {
                            if (lastInnlegg.delegateNumber) {
                              addToQueueByDelegate({
                                delegateNumber: String(lastInnlegg.delegateNumber),
                                type: 'svar_replikk',
                              });
                            } else {
                              addToQueueDirect({
                                name: lastInnlegg.name || '',
                                org: lastInnlegg.org || '',
                                type: 'svar_replikk',
                              });
                            }
                          }}
                        >
                          <MessageSquareReply aria-hidden="true" />
                        </button>
                      )}
                  </>
                )}
              </div>
            </div>

            <div className="card" data-tutorial="queue">
              <div className="title">Taleliste</div>
              <div className="list">
                {state.queue.length === 0 ? (
                  <div className="muted">Talelisten er tom.</div>
                ) : (
                  state.queue.map((q, i) => (
                    <div key={q.id} className="queue-item">
                      <div>
                        <div className={"big queued"}>
                          {i === 0 ? "Neste: " : ""}
                          {q.name}{" "}
                          <span className="muted">
                            ({q.delegateNumber ? `#${q.delegateNumber}` : "–"})
                          </span>
                        </div>
                        <div className="desc">{q.org || " "}</div>
                        <div className="desc">
                          Type: <b>{labelFor(q.type)}</b>
                        </div>
                      </div>
                      <div className="col">
                        <button
                          className="btn secondary icon-button"
                          aria-label={`Start ${q.name}`}
                          title="Start"
                          onClick={() => {
                            startSpecific(q.id);
                            sendSync("timer:startSpecific", { id: q.id });
                          }}
                        >
                          <Play aria-hidden="true" />
                        </button>
                        <button
                          className="btn danger icon-button"
                          aria-label={`Fjern ${q.name}`}
                          title="Fjern"
                          onClick={() => {
                            removeFromQueue(q.id);
                            offerUndo(`${q.name} ble fjernet fra køen.`, () => {
                              restoreQueueItem(q, i);
                            });
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Single, real delegates table at the very end */}
          <DelegatesTable state={state} />
        </section>
      </div>
      {showTutorialIntro && !showTutorial && <TutorialIntro onDismiss={dismissTutorialIntro} />}
      {showTutorial && <Tutorial onClose={closeTutorial} onDemoFileLoaded={() => setTutorialFileName("demo-delegater.csv")} timerDisplay={remain} />}
      {undoNotice && (
        <div className="undo-toast" role="status" aria-live="polite">
          <span>{undoNotice.message}</span>
          <button type="button" className="undo-toast-button" onClick={undoLastAction}>
            Angre
          </button>
          <button
            type="button"
            className="undo-toast-close"
            aria-label="Lukk angremelding"
            onClick={() => setUndoNotice(null)}
          >
            ×
          </button>
        </div>
      )}
      <SiteFooter />
    </div>
  );
}

/* ============================
   Timer & Queue views
   ============================ */
function TimerFull({ state }) {
  useDisplayPresence("timer");
  const cur = state.currentSpeaker;
  const secs = cur ? remainingSeconds(cur) : 0;
  const text = fmt(secs);
  const typeLabel = cur ? labelFor(cur.type) : "";
  const isExpired = Boolean(cur && secs <= 0);
  const isPaused = Boolean(cur?.paused && !isExpired);
  const timerStateClass = isExpired
    ? "timer-state-expired"
    : isPaused
      ? "timer-state-paused"
      : "";
  return (
    <div id="timer" className={`full ${timerStateClass}`}>
      <div className="name">
        {cur
          ? `${cur.name} ${
              cur.delegateNumber ? `(#${cur.delegateNumber})` : ""
            }`
          : ""}
      </div>
      <div className="name">{cur?.org || ""}</div>
      <div className="timer">{text}</div>
      <div className="status">
        {isPaused && <Pause className="timer-state-icon" aria-hidden="true" />}
        <span>
          {cur
            ? typeLabel + (isExpired ? " · Tiden er ute" : cur.paused ? " · Pauset" : " · Live")
            : "Venter på neste taler…"}
        </span>
      </div>
    </div>
  );
}

function QueueFull({ state }) {
  useDisplayPresence("queue");
  const cur = state?.currentSpeaker ?? null;
  const queue = Array.isArray(state?.queue) ? state.queue : [];

  return (
    <div id="queue" className="full queuePage" style={{ alignItems: 'stretch' }}>
      <div className="queue">
        {cur ? (
          <div
            className="queueRow queueNow"
            data-type={normalizeType ? normalizeType(cur.type) : cur.type}
          >
            <div className="queueRow-content">
              <div className="big">
                Nå: {cur.name}{" "}
                {cur.delegateNumber ? `(#${cur.delegateNumber})` : ""}
                <div className="muted">{cur.org || " "}</div>
              </div>
              <span className="label-pill">{labelFor(cur.type)}</span>
            </div>
          </div>
        ) : null}

        {queue.length === 0 ? (
          <div className="queueRow">
            <div className="muted">Ingen i køen.</div>
          </div>
        ) : (
          queue.map((q, i) => (
            <div
              key={q.id ?? `${q.name || 'anon'}-${i}`}
              className="queueRow"
              data-type={normalizeType ? normalizeType(q.type) : q.type}
            >
              <div className="queueRow-content">
                <div className={"big " + (i === 0 ? "next" : "")}>
                  {i === 0 ? "Neste: " : ""}
                  {q.name} {q.delegateNumber ? `(#${q.delegateNumber})` : ""}
                  <div className="muted">{q.org || " "}</div>
                </div>

                {/* NEW: Type label badge */}
                <span className="label-pill">{labelFor(q.type)}</span>
              </div>

            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ============================
   helpers
   ============================ */
function labelFor(t) {
  const v = (typeof normalizeType === "function" ? normalizeType(t) : t) || "";
  if (v === "replikk") return "Replikk";
  if (v === "svar_replikk") return "Svar-replikk";
  return "Innlegg";
}
function fmt(s) {
  const sec = Number.isFinite(s) ? Math.max(0, Math.floor(s)) : 0;
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

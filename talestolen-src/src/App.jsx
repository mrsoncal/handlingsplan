import React, { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareReply, Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import {
  subscribe,
  getState,
  remainingSeconds,
  addToQueueByDelegate,
  addToQueueDirect,
  removeFromQueue,
  setTypeDuration,
  loadDelegates,
  updateDelegate,
  deleteDelegate,
  saveDelegatesToLocalStorageRaw,
  startNext,
  startSpecific,
  pauseTimer,
  resumeTimer,
  skipCurrent,
  resetTimer,
  normalizeType,
} from "./store/bus.js";

import DelegatesTable from "./components/DelegatesTable.jsx";
import "./app-extra.css";
import CsvTool from "./components/CsvTool.jsx";


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
      >
        <span>{selected.label}</span>
        <span className="type-select-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="type-select-menu" role="listbox" aria-label={label}>
          {speakingTypes.map((option) => (
            <button
              type="button"
              className="type-select-option"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
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
  useTimerRerender(hash !== "#queue");

  if (hash === "#timer") return <TimerFull state={state} />;
  if (hash === "#queue") return <QueueFull state={state} />;
  if (hash === "#csv-verktoy") return <CsvTool />;
  return <AdminView state={state} />;
}

/* ============================
   CSV utils
   ============================ */
function parseCSV(text) {
  if (!text) return [];
  let s = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const lines = s.split("\n").filter(Boolean);
  if (!lines.length) return [];

  const delim = detectDelimiter(lines[0]);
  const split = (line) => splitRow(line, delim);
  const sample = lines[0];
  const hasHeader =
    /[A-Za-z]/.test(sample.split(delim)[0]) && /[A-Za-z]/.test(sample);

  let rows = [];
  if (hasHeader) {
    const headers = split(lines[0]).map((h) => h.trim().toLowerCase());
    for (let i = 1; i < lines.length; i++) {
      const cells = split(lines[i]);
      const row = {};
      headers.forEach((h, idx) => (row[h] = (cells[idx] ?? "").trim()));
      rows.push(normalizeRow(row));
    }
  } else {
    for (const line of lines) {
      const [number = "", name = "", org = ""] = split(line).map((x) =>
        (x ?? "").trim()
      );
      rows.push({ number, name, org });
    }
  }
  return rows.filter((r) => String(r.number || "").trim() !== "");
}
function detectDelimiter(line) {
  const counts = {
    ",": (line.match(/,/g) || []).length,
    ";": (line.match(/;/g) || []).length,
    "\t": (line.match(/\t/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ",";
}
function splitRow(line, delim) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
function normalizeRow(row) {
  const r = {};
  const get = (keys) => {
    for (const k of keys) {
      const v = row[k];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };
  r.number = get([
    "number",
    "nr",
    "delegatenummer",
    "delegatnummer",
    "Delegatnummer",
    "delegate number",
    "delegatenr",
    "id",
  ]);
  r.name = get([
    "name",
    "navn",
    "Fullt Navn",
    "fullt navn",
  ]);
  r.org = get([
    "org",
    "organisasjon",
    "kommune",
    "representerer",
    "org.",
    "råd/eleråd/organisasjon",
    "Råd/eleråd/organisasjon",
  ]);
  return r;
}

/* ============================
   Admin
   ============================ */
function AdminView({ state }) {
  const [speakerQuery, setSpeakerQuery] = useState("");
  const [type, setType] = useState("innlegg");
  const [manualOrg, setManualOrg] = useState("");
  const [lastInnlegg, setLastInnlegg] = useState(null);
  const [csvFileName, setCsvFileName] = useState("");

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
  function handleCSV(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const rows = parseCSV(text);
        if (rows.length) {
          try {
            saveDelegatesToLocalStorageRaw(text);
          } catch {}
          loadDelegates(rows);
        }
      } catch (err) {
        console.error("[CSV] parse error:", err);
      }
    };
    reader.onerror = (err) => console.error("[CSV] FileReader error:", err);
    reader.readAsText(file, "utf-8");
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

  return (
    <div className="page">
      <header className="header">
        <div className="nav-container">
          <div className="navigation-bar">
            <nav className="nav">
              <a className="btn nav" href="#admin">Admin</a>
              <a className="btn nav" href="#timer" target="talestolen-timer">Timer</a>
              <a className="btn nav" href="#queue" target="talestolen-queue">Taleliste</a>
            </nav>
            <nav className="nav-r">
              <a className="btn nav-r" href="#csv-verktoy" target="talestolen-csv">CSV Verktøy</a>
            </nav>
          </div>     
            <img className="brand" src={`${import.meta.env.BASE_URL}TU-logov2.png`} alt="Telemark Ungdomsråd" />    
        </div>

        <div className="header-space-container">
          <div className="header-space">
          </div>
        </div>
      </header>
      <div className="container">
        <section className="card main-card">

          {/* Row: upload + type defaults */}
          <div className="split">

            <div className="card">
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
                    <span className={`csv-file-name ${csvFileName ? 'has-file' : ''}`}>
                      {csvFileName || 'Ingen fil valgt'}
                    </span>
                  </div>
                  <div className="spacer"></div>
                  <div className="row">
                    <div className="muted">
                      Lastet inn <b>{Object.keys(state.delegates).length}</b> delegater
                    </div>
                  </div>
              </div>
            </div>

            <div className="card time-defaults">
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

          <div className="card speaker-add-card">
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
            <div className="card">
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
                        {cur.baseDurationSec}s • {cur.paused ? "Pauset" : "Tiden går"}
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
                        skipCurrent();
                        sendSync("timer:reset");
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

            <div className="card">
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
                          onClick={() => removeFromQueue(q.id)}
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
      <footer className="site-footer">
        <div className="footer-social">
          <div className="container">
            <div className="footer-social-row">
              <a href="https://www.facebook.com/telemarkfylkeskommune"
                title="Facebook - Telemark fylkeskommune"
                className="footer-social-btn footer-social-facebook"
                target="_blank" rel="noreferrer noopener">
                <span className="footer-social-icon">
                    <img src={`${import.meta.env.BASE_URL}f.png`} className="footer-social-img" alt="Facebook" />
                </span>

              </a>
              <a href="https://www.instagram.com/telemarkungdom/"
                title="Instagram - Telemark fylkeskommune"
                className="footer-social-btn footer-social-instagram"
                target="_blank" rel="noreferrer noopener">
                <span className="footer-social-icon">
                    <img src={`${import.meta.env.BASE_URL}ig.png`} className="footer-social-img" alt="Instagram" />
                </span>

              </a>
            </div>
          </div>
        </div>

        <div className="footer-main">
          <div className="container footer-main-grid">
            <div className="footer-col">
              <p><strong>Kontakt oss</strong></p>
              <p>Telemark Ungdomsråd<br/>Postboks 2844<br/>3702 Skien</p>
              <p>Koordinator for Telemark Ungdomsråd<br/><a href="mailto:heidi.bekkevold@telemarkfylke.no">heidi.bekkevold@telemarkfylke.no</a><br/>+47 991 55 531</p>
            </div>

            <div className="footer-col">
              <p><strong>Telemark Ungdomsråd</strong></p>
              <p><strong>Leder:</strong> Jan Sander Ravn Gudbrandsen<br/><a href="mailto:jan.sander.ravn.gudbrandsen@telemarkfylke.no">jan.sander.ravn.gudbrandsen@telemarkfylke.no</a><br/>+47 969 06 790</p>
              <p><strong>Nestleder:</strong> Helene Clausen Endresen<br/><a href="mailto:helene.c.endresen@gmail.com">helene.c.endresen@gmail.com</a><br/>+47 463 14 573</p>
              <p><strong>Nettsideutvikler:</strong> Sondre Callaerts<br/><a href="mailto:mrsoncal@gmail.com">mrsoncal@gmail.com</a><br/>+47 929 57 188</p>
            </div>

            <div className="footer-col">
              <p><strong></strong></p>
              <p></p>
            </div>

            <div className="footer-col footer-decoration">
              <svg xmlns="http://www.w3.org/2000/svg" width="158" height="243" viewBox="0 0 158 243" fill="none" aria-hidden="true">
                <path opacity="0.8" d="M79 81V161.985V162V243C35.3754 242.985 0.01422 206.729 0 162V81H79Z" fill="white"></path>
                <path opacity="0.4" d="M79 162C79.0063 117.264 114.362 81 157.974 81C157.983 81 157.991 81 158 81V162H79Z" fill="white"></path>
                <path opacity="0.6" d="M158 243C157.994 198.264 122.638 162 79.0261 162C79.0174 162 79.0087 162 79 162V243H158Z" fill="white"></path>
                <rect opacity="0.8" x="79" width="79" height="81" fill="white"></rect>
              </svg>
            </div>
          </div>

          <div className="container footer-bottom">
            <div className="footer-logo-block">
              <img src={`${import.meta.env.BASE_URL}TU-logo-bw-wide.png`} alt="Telemark Ungdomsråd" className="footer-logo" />
            </div>
            <ul className="footer-links">
              <p>© Sondre Callaerts — Frigitt til fri bruk</p>
              <li className="footer-links-badge">
                <a href="https://www.telemarkfylke.no/link/22cdc346a84a49e5add33a4198ce23ed.aspx" target="_blank" rel="noreferrer noopener">
                  <img src="https://www.telemarkfylke.no/globalassets/Administrasjon/tfk/system/layout/miljofyrtaarn-logo-svart.svg" alt="Miljøfyrtårn logo" />
                </a>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ============================
   Timer & Queue views
   ============================ */
function TimerFull({ state }) {
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

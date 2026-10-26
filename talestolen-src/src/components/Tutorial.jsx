import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  enterTutorialMode,
  exitTutorialMode,
  getState,
  loadDelegates,
  subscribe,
} from "../store/bus.js";
import { readDelegatesCsvFile } from "../utils/delegatesCsv.js";
import "./tutorial.css";

const STEPS = [
  { target: ".display-shortcuts", title: "Koble til visningsskjermene", description: "Bruk én skjerm til talelisten og én til nedtellingen. Åpne hver visning fra lenkene over kortene, og flytt nettleservinduene til riktig skjerm. Prikken blir grønn når visningsvinduet er åpent." },
  { target: '[data-tutorial="upload"]', title: "Last opp delegatlisten", description: "Her laster du opp en delegatliste i CSV format. Lurer du på hva CSV er eller hvordan du lager den? Bruk CSV-verktøy øverst på siden." },
  { target: '[data-tutorial="delegates"]', title: "Kontroller delegatene", description: "Etter opplasting vises alle delegatene her. Kontroller særlig delegatnummer og organisasjon; bruk Rediger hvis noe er feil." },
  { target: '[data-tutorial="durations"]', title: "Still inn taletid", description: "Velg antall sekunder for innlegg, replikk og svar-replikk før eller underveis i møtet. Juster taletiden direkte i det markerte kortet." },
  { target: '[data-tutorial="add-speaker"]', title: "Legg en delegat i talelisten", description: "Søk etter delegatnummer eller navn i kortet over, velg taletype og trykk Legg til. Prøv med en av de fiktive delegatene." },
  { target: '[data-tutorial="add-speaker"]', title: "Følg talelisten", description: "Bruk Legg til i talelista-kortet til å legge til en annen delegat, gjerne som replikk. Se deretter i talelisten hvordan replikker prioriteres foran innlegg." },
  { target: '[data-tutorial="current-speaker"]', title: "Styr taleren og klokken", description: "Trykk på play-knappen i «Snakker nå» for å starte neste taler i køen. Når taleren er i gang, kan du bruke knappene i samme kort til å pause, fortsette, nullstille tiden eller avslutte taleren. Dette er fortsatt bare en øving." },
  { target: ".display-shortcuts", title: "Begge skjermene oppdateres live", description: "Tidsskjermen viser taleren og nedtellingen. Køskjermen viser hvem som snakker nå og hvem som er neste. Forhåndsvisningene under bruker samme øvingsdata og oppdateres samtidig." },
];

function focusHole(rect) {
  return `M${rect.left} ${rect.top}H${rect.left + rect.width}V${rect.top + rect.height}H${rect.left}Z`;
}

export function TutorialIntro({
  onDismiss,
  title = "Ny i Talestolen?",
  description = "Trykk på spørsmålstegnet (?) over kortene for å åpne en praktisk veiledning av hele siden.",
}) {
  const [spotlight, setSpotlight] = useState(null);
  const [panelStyle, setPanelStyle] = useState({});
  const panelRef = useRef(null);

  useEffect(() => {
    const trigger = document.querySelector(".tutorial-trigger");
    if (!trigger) return undefined;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    window.scrollTo({ top: 0, behavior: "instant" });
    panelRef.current?.focus();

    const measure = () => {
      const rect = trigger.getBoundingClientRect();
      const left = Math.max(8, rect.left - 8);
      const top = Math.max(8, rect.top - 8);
      const right = Math.min(window.innerWidth - 8, rect.right + 8);
      const bottom = Math.min(window.innerHeight - 8, rect.bottom + 8);
      setSpotlight({ left, top, width: right - left, height: bottom - top });
      setPanelStyle({
        top: Math.max(12, Math.min(rect.bottom + 20, window.innerHeight - 180)),
        right: Math.max(12, window.innerWidth - rect.right - 8),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(trigger);
    const onKeyDown = (event) => {
      if (event.key === "Escape") onDismiss();
      if (event.key !== "Tab") return;
      const focusable = [trigger, ...panelRef.current.querySelectorAll("button")];
      const index = focusable.indexOf(document.activeElement);
      event.preventDefault();
      focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      trigger.focus();
    };
  }, [onDismiss]);

  return createPortal(
    <div className="tutorial-layer tutorial-layer-interactive">
      <div className="tutorial-backdrop" aria-hidden="true" />
      {spotlight && (
        <>
          <div aria-hidden="true">
            <div className="tutorial-interaction-guard" style={{ left: 0, top: 0, right: 0, height: spotlight.top }} />
            <div className="tutorial-interaction-guard" style={{ left: 0, top: spotlight.top, width: spotlight.left, height: spotlight.height }} />
            <div className="tutorial-interaction-guard" style={{ left: spotlight.left + spotlight.width, top: spotlight.top, right: 0, height: spotlight.height }} />
            <div className="tutorial-interaction-guard" style={{ left: 0, top: spotlight.top + spotlight.height, right: 0, bottom: 0 }} />
          </div>
          <div className="tutorial-spotlight tutorial-spotlight-shadow" style={spotlight} aria-hidden="true" />
        </>
      )}
      <section className="tutorial-panel tutorial-intro-panel" style={panelStyle} role="region" aria-labelledby="tutorial-intro-title" ref={panelRef} tabIndex={-1}>
        <div className="tutorial-panel-top">Et lite tips</div>
        <h2 id="tutorial-intro-title">{title}</h2>
        <p>{description}</p>
        <button type="button" className="tutorial-demo-button" onClick={onDismiss}>Skjønner</button>
      </section>
    </div>,
    document.body,
  );
}

function ConnectionDiagram() {
  return (
    <figure className="tutorial-connection">
      <svg viewBox="0 0 560 290" role="img" aria-label="Bærbar PC koblet til en stor køskjerm og en liten tidsskjerm foran talepodiet">
        <path className="tutorial-cable" d="M148 131 H210 V63 H348" />
        <path className="tutorial-cable tutorial-cable-second" d="M148 145 H235 V210 H350" />
        <rect className="tutorial-device" x="25" y="96" width="122" height="79" rx="7" />
        <path className="tutorial-device" d="M17 178 H154 L169 190 H5 Z" />
        <rect className="tutorial-device" x="348" y="24" width="176" height="91" rx="7" />
        <path className="tutorial-device" d="M436 115 V131 M408 131 H464" />
        <rect className="tutorial-device" x="350" y="184" width="94" height="51" rx="5" />
        <path className="tutorial-device" d="M397 235 V244 M377 244 H417" />
        <circle className="tutorial-person" cx="512" cy="159" r="13" />
        <path className="tutorial-person-line" d="M490 194 Q512 172 534 194" />
        <path className="tutorial-podium" d="M472 193 H548 L539 262 H481 Z" />
        <text x="86" y="137">PC</text>
        <text x="436" y="74">Køskjerm</text>
        <text className="tutorial-small-screen-text" x="397" y="206">Tid</text>
        <text className="tutorial-small-screen-time" x="397" y="226">01:10</text>
        <text className="tutorial-context-label" x="397" y="270">Liten tidsskjerm</text>
        <text className="tutorial-context-label" x="510" y="282">Talepodium</text>
        <text className="tutorial-cable-label" x="246" y="54">HDMI</text>
        <text className="tutorial-cable-label" x="290" y="202">HDMI / USB-C</text>
      </svg>
      <figcaption>Køskjermen vises for salen. Den lille tidsskjermen står foran talepodiet, vendt mot taleren og ikke publikum. PC-en trenger to skjermutganger: 2 × HDMI, eller HDMI + USB-C–til–HDMI-adapter.</figcaption>
    </figure>
  );
}

export default function Tutorial({ onClose, onDemoFileLoaded, timerDisplay }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState(null);
  const [secondarySpotlight, setSecondarySpotlight] = useState(null);
  const [panelStyle, setPanelStyle] = useState({});
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [demoState, setDemoState] = useState(() => getState());
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const uploadAbortRef = useRef(null);
  const panelRef = useRef(null);
  const stepSixStartingCountRef = useRef(null);
  const transitionRef = useRef(false);
  const navigationTimerRef = useRef(null);
  const delegates = Object.values(demoState.delegates || {});
  const queue = demoState.queue || [];
  const current = demoState.currentSpeaker;
  const paused = Boolean(current?.paused);
  const demoLoaded = delegates.length === 10;
  const interactiveStep = stepIndex === 3 || stepIndex === 4 || stepIndex === 5 || stepIndex === 6;
  const stepIndexRef = useRef(stepIndex);
  stepIndexRef.current = stepIndex;

  useEffect(() => {
    enterTutorialMode();
    setDemoState(getState());
    const unsubscribe = subscribe(() => setDemoState(getState()));
    return () => {
      window.clearTimeout(navigationTimerRef.current);
      uploadAbortRef.current?.abort();
      unsubscribe();
      exitTutorialMode();
    };
  }, []);

  useEffect(() => {
    panelRef.current?.focus();
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      if (transitionRef.current) {
        event.preventDefault();
        return;
      }
      const index = stepIndexRef.current;
      const card = index === 3 || index === 4 || index === 5 || index === 6 ? document.querySelector(STEPS[index].target) : null;
      const selector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]";
      const focusable = [
        ...(card ? card.querySelectorAll(selector) : []),
        ...panelRef.current.querySelectorAll(selector),
      ].filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
      if (!focusable.length) return;
      const currentIndex = focusable.indexOf(document.activeElement);
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      event.preventDefault();
      focusable[nextIndex].focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.querySelector(".tutorial-trigger")?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (stepIndex === 5 && stepSixStartingCountRef.current === null) {
      stepSixStartingCountRef.current = queue.length;
    }
  }, [stepIndex, queue.length]);

  useEffect(() => {
    document.body.classList.toggle("tutorial-queue-step", stepIndex === 5);
    document.body.classList.toggle("tutorial-add-speaker-step", !isTransitioning && (stepIndex === 4 || stepIndex === 5));
    return () => {
      document.body.classList.remove("tutorial-queue-step");
      document.body.classList.remove("tutorial-add-speaker-step");
    };
  }, [stepIndex, isTransitioning]);

  useEffect(() => {
    const element = document.querySelector(STEPS[stepIndex].target);
    if (!element) return undefined;
    const queueElement = stepIndex === 5 ? document.querySelector('[data-tutorial="queue"]') : null;
    const desiredScrollY = () => {
      const rect = element.getBoundingClientRect();
      const queueRect = queueElement?.getBoundingClientRect();
      const panelHeight = panelRef.current?.offsetHeight || 230;
      if (stepIndex === 0 || stepIndex === STEPS.length - 1) return 0;
      if (stepIndex !== 4 && stepIndex !== 5) {
        return window.scrollY + rect.top - (window.innerHeight - rect.height) / 2;
      }
      let groupHeight = rect.height + 16 + panelHeight;
      if (stepIndex === 5 && queueRect) {
        const queueOffset = queueRect.top - rect.top;
        groupHeight = window.innerWidth <= 900
          ? queueOffset + queueRect.height + 16 + panelHeight
          : Math.max(rect.height, queueOffset + Math.max(queueRect.height, panelHeight));
      }
      const desiredTop = Math.max(16, (window.innerHeight - groupHeight) / 2);
      return window.scrollY + rect.top - desiredTop;
    };
    const scrollToFocus = (behavior) => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const top = Math.min(maxScroll, Math.max(0, desiredScrollY()));
      window.scrollTo({ top, behavior });
      return top;
    };
    if (!transitionRef.current) scrollToFocus("instant");

    const measure = () => {
      const rect = element.getBoundingClientRect();
      const focusRect = (box) => {
        const left = Math.max(8, box.left - 8);
        const top = Math.max(8, box.top - 8);
        const right = Math.min(window.innerWidth - 8, box.right + 8);
        const bottom = Math.min(window.innerHeight - 8, box.bottom + 8);
        return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
      };
      setSpotlight({ ...focusRect(rect), viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
      const queueRect = queueElement?.getBoundingClientRect();
      setSecondarySpotlight(queueRect ? focusRect(queueRect) : null);

      const panelWidth = Math.min(420, window.innerWidth - 24);
      if (stepIndex === 5 && queueRect && window.innerWidth <= 900) {
        const panelTop = Math.max(16, queueRect.bottom + 16);
        setPanelStyle({
          left: 12,
          right: 12,
          top: panelTop,
          width: "auto",
          maxHeight: Math.max(100, window.innerHeight - panelTop - 12),
        });
      } else if (window.innerWidth < 740) {
        setPanelStyle({ left: 12, right: 12, bottom: 12, width: "auto" });
      } else if (stepIndex === 5 && queueRect) {
        const panelTop = Math.max(16, queueRect.top);
        setPanelStyle({
          left: Math.max(12, rect.left),
          top: panelTop,
          width: Math.min(panelWidth, Math.max(220, queueRect.left - rect.left - 16)),
          maxHeight: Math.max(100, window.innerHeight - panelTop - 16),
        });
      } else if (stepIndex === 4) {
        const panelTop = Math.max(16, rect.bottom + 16);
        setPanelStyle({
          left: Math.max(12, rect.left),
          top: panelTop,
          width: Math.min(rect.width, window.innerWidth - 24),
          maxHeight: Math.max(100, window.innerHeight - panelTop - 16),
        });
      } else if (window.innerWidth - rect.right >= panelWidth + 24) {
        setPanelStyle({ left: rect.right + 16, top: Math.max(16, Math.min(rect.top, window.innerHeight - 500)), width: panelWidth });
      } else if (rect.left >= panelWidth + 24) {
        setPanelStyle({ left: rect.left - panelWidth - 16, top: Math.max(16, Math.min(rect.top, window.innerHeight - 500)), width: panelWidth });
      } else {
        setPanelStyle({ right: 16, bottom: 16, width: panelWidth });
      }
    };
    measure();
    let firstFrame = 0;
    let secondFrame = 0;
    let scrollFallback = 0;
    let scrollTarget = 0;
    const finishTransition = () => {
      if (!transitionRef.current || Math.abs(window.scrollY - scrollTarget) > 3) return;
      window.clearTimeout(scrollFallback);
      window.removeEventListener("scrollend", finishTransition);
      scrollToFocus("instant");
      measure();
      transitionRef.current = false;
      setIsTransitioning(false);
    };
    if (transitionRef.current) {
      // Let the next step's panel settle before calculating its scroll destination.
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          scrollTarget = scrollToFocus("smooth");
          if (Math.abs(window.scrollY - scrollTarget) <= 3) {
            finishTransition();
          } else {
            window.addEventListener("scrollend", finishTransition);
            scrollFallback = window.setTimeout(() => {
              scrollToFocus("instant");
              scrollTarget = window.scrollY;
              finishTransition();
            }, 1100);
          }
        });
      });
    }
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    let recenterFrame = 0;
    const sizeObserver = new ResizeObserver(() => {
      if (transitionRef.current) {
        measure();
      } else if (stepIndex === 4 || stepIndex === 5) {
        window.cancelAnimationFrame(recenterFrame);
        recenterFrame = window.requestAnimationFrame(() => {
          scrollToFocus("instant");
          measure();
        });
      } else {
        measure();
      }
    });
    sizeObserver.observe(element);
    if (queueElement) sizeObserver.observe(queueElement);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(scrollFallback);
      window.removeEventListener("scrollend", finishTransition);
      window.cancelAnimationFrame(recenterFrame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      sizeObserver.disconnect();
    };
  }, [stepIndex]);

  useEffect(() => {
    if (stepIndex !== 4 && stepIndex !== 5) return;
    if (transitionRef.current) return;
    const card = document.querySelector(STEPS[stepIndex].target);
    const panel = panelRef.current;
    if (!card || !panel) return;
    if (stepIndex === 4 && Math.abs(Number(panelStyle.width) - card.getBoundingClientRect().width) > 1) return;
    const rect = card.getBoundingClientRect();
    const queueRect = stepIndex === 5 ? document.querySelector('[data-tutorial="queue"]')?.getBoundingClientRect() : null;
    const queueOffset = queueRect ? queueRect.top - rect.top : 0;
    const groupHeight = queueRect
      ? window.innerWidth <= 900
        ? queueOffset + queueRect.height + 16 + panel.offsetHeight
        : Math.max(rect.height, queueOffset + Math.max(queueRect.height, panel.offsetHeight))
      : rect.height + 16 + panel.offsetHeight;
    const desiredTop = Math.max(16, (window.innerHeight - groupHeight) / 2);
    window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - desiredTop), behavior: "instant" });
  }, [stepIndex, panelStyle.width]);

  async function uploadDemoFile() {
    setUploading(true);
    setUploadProgress(5);
    setUploadError("");
    const startedAt = Date.now();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    try {
      const response = await fetch(import.meta.env.BASE_URL + "demo-delegater.csv", { signal: controller.signal });
      if (!response.ok) throw new Error("Demo-filen kunne ikke hentes.");
      const file = new File([await response.blob()], "demo-delegater.csv", { type: "text/csv" });
      setUploadProgress(15);
      const { rows } = await readDelegatesCsvFile(file, {
        onProgress: (progress) => setUploadProgress(15 + Math.round(progress * 0.8)),
      });
      if (rows.length !== 10 || rows.some((row) => !row.name || !row.org)) {
        throw new Error("Demo-filen har ikke de forventede ti delegatene.");
      }
      if (!controller.signal.aborted) {
        loadDelegates(rows);
        onDemoFileLoaded?.();
        setUploadProgress(100);
        await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, 700 - (Date.now() - startedAt))));
      }
    } catch (error) {
      if (error.name !== "AbortError") setUploadError(error.message || "Demo-filen kunne ikke leses.");
    } finally {
      if (!controller.signal.aborted) setUploading(false);
      uploadAbortRef.current = null;
    }
  }

  function navigateStep(nextIndex) {
    if (transitionRef.current || nextIndex < 0 || nextIndex >= STEPS.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStepIndex(nextIndex);
      return;
    }
    transitionRef.current = true;
    setIsTransitioning(true);
    navigationTimerRef.current = window.setTimeout(() => setStepIndex(nextIndex), 180);
  }

  const step = STEPS[stepIndex];
  const canContinue = stepIndex !== 1 || (demoLoaded && !uploading);
  const canContinueFromQueue = stepIndex !== 4 || queue.length > 0;
  const canContinueFromSecondQueue = stepIndex !== 5 || queue.length > Math.max(1, stepSixStartingCountRef.current ?? 1);
  const canContinueFromSpeaker = stepIndex !== 6 || Boolean(current);

  return createPortal(
    <div className={`tutorial-layer${interactiveStep ? " tutorial-layer-interactive" : ""}${isTransitioning ? " tutorial-layer-transitioning" : ""}`}>
      <div className="tutorial-backdrop" aria-hidden="true" />
      {interactiveStep && spotlight && stepIndex !== 5 && (
        <div aria-hidden="true">
          <div className="tutorial-interaction-guard" style={{ left: 0, top: 0, right: 0, height: spotlight.top }} />
          <div className="tutorial-interaction-guard" style={{ left: 0, top: spotlight.top, width: spotlight.left, height: spotlight.height }} />
          <div className="tutorial-interaction-guard" style={{ left: spotlight.left + spotlight.width, top: spotlight.top, right: 0, height: spotlight.height }} />
          <div className="tutorial-interaction-guard" style={{ left: 0, top: spotlight.top + spotlight.height, right: 0, bottom: 0 }} />
        </div>
      )}
      {spotlight && (
        <svg className="tutorial-dimmer" viewBox={`0 0 ${spotlight.viewportWidth} ${spotlight.viewportHeight}`} preserveAspectRatio="none" aria-hidden="true">
          <path
            fillRule="evenodd"
            d={`M0 0H${spotlight.viewportWidth}V${spotlight.viewportHeight}H0Z ${focusHole(spotlight)} ${stepIndex === 5 && secondarySpotlight ? focusHole(secondarySpotlight) : ""}`}
          />
        </svg>
      )}
      {spotlight && <div className="tutorial-spotlight" style={spotlight} aria-hidden="true" />}
      {stepIndex === 5 && secondarySpotlight && <div className="tutorial-spotlight" style={secondarySpotlight} aria-hidden="true" />}
      <div className="tutorial-transition-shade" aria-hidden="true" />
      <section className="tutorial-panel" style={panelStyle} role={interactiveStep ? "region" : "dialog"} aria-modal={interactiveStep ? undefined : "true"} aria-labelledby="tutorial-title" ref={panelRef} tabIndex={-1}>
        <div className="tutorial-panel-top">
          <span>Veiledning · {stepIndex + 1} av {STEPS.length}</span>
          <button type="button" className="tutorial-close" onClick={onClose} aria-label="Lukk veiledning"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4 16 16 M16 4 4 16" /></svg></button>
        </div>
        <div className="tutorial-progress" aria-hidden="true"><span style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} /></div>
        <h2 id="tutorial-title">{step.title}</h2>
        <p className="tutorial-description">{step.description}</p>

        {stepIndex === 0 && <ConnectionDiagram />}

        {stepIndex === 1 && (
          <div className="tutorial-demo-block">
            <strong>Øvingsfil: demo-delegater.csv</strong>
            <span>10 delegater · nummer, navn, representerer</span>
            {demoLoaded && !uploading ? <p className="tutorial-success" role="status">✓ 10 delegater er lest fra demo-filen og vises i delegatkortet.</p> : <button type="button" className="tutorial-demo-button" onClick={uploadDemoFile} disabled={uploading}>{uploading ? "Laster inn delegater …" : "Last inn demo-CSV"}</button>}
            {uploading && <div className="csv-import-progress" role="progressbar" aria-label="Laster inn demo-delegater" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}><span style={{ width: `${uploadProgress}%` }} /></div>}
            {uploadError && <p className="tutorial-error" role="alert">{uploadError}</p>}
          </div>
        )}

        {stepIndex === 2 && (
          <div className="tutorial-demo-list" aria-label="Ti fiktive delegater">
            {delegates.map((item) => <div key={item.number}><b>#{item.number}</b><span>{item.name}</span><small>{item.org}</small></div>)}
          </div>
        )}

        {stepIndex === 4 && queue.length > 0 && <p className="tutorial-success" role="status">✓ Delegaten er lagt til i talelisten.</p>}

        {stepIndex === 5 && canContinueFromSecondQueue && <p className="tutorial-success" role="status">✓ En ny delegat er lagt til. Talelisten er oppdatert.</p>}

        {stepIndex === 6 && current && <p className="tutorial-success" role="status">✓ {current.name} snakker nå. Klokken vises i kortet.</p>}

        {stepIndex === 7 && (
          <div className="tutorial-screen-pair" aria-live="polite">
            <div className="tutorial-screen tutorial-timer-screen"><span>Tidsskjerm</span><strong>{timerDisplay}</strong><b>{current?.name || "Venter på taler"}</b><small>{paused ? "Pauset" : current ? "Live" : "Klar"}</small></div>
            <div className="tutorial-screen tutorial-queue-screen"><span>Køskjerm</span><b>Nå: {current?.name || "Ingen"}</b><small>Neste: {queue[0]?.name || "Ingen i kø"}</small></div>
          </div>
        )}

        <div className="tutorial-panel-actions">
          <button type="button" className="tutorial-quiet-button" onClick={() => navigateStep(stepIndex - 1)} disabled={isTransitioning || stepIndex === 0}>Forrige</button>
          <button type="button" className="tutorial-demo-button" onClick={() => stepIndex === STEPS.length - 1 ? onClose() : navigateStep(stepIndex + 1)} disabled={isTransitioning || !canContinue || !canContinueFromQueue || !canContinueFromSecondQueue || !canContinueFromSpeaker}>{stepIndex === STEPS.length - 1 ? "Fullfør" : "Neste"}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

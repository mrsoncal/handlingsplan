import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./tutorial.css";

const STEPS = [
  {
    target: '[data-csv-tutorial="upload"]',
    title: "Prøv med en Excel-fil",
    description: "Påmeldingslister kan ha langt flere kolonner enn Talestolen trenger. Last inn demo-arket, og se hvordan et påmeldingsskjema i excel kan omgjøres til csv.",
  },
  {
    target: '[data-csv-tutorial="editor"]',
    title: "Se hva som ble hentet inn",
    description: "Deltakerne vises i radeditoren. Påmeldings-ID, e-post, matpreferanser og kommentarer tas ikke med. Et manglende delegatnummer er tildelt automatisk; røde rader markerer deltakere med manglende opplysninger.",
  },
  {
    target: '[data-csv-tutorial="mapping-toggle"]',
    title: "Åpne kolonnevalgene",
    description: "Verktøyet foreslår kolonner automatisk. Trykk «Juster kolonner» for å kontrollere valgene og se hvordan to representasjonskolonner kan brukes sammen.",
  },
  {
    target: '[data-csv-tutorial="columns"]',
    title: "Koble kolonnene til feltene",
    description: "Her velger du hvilken rad som inneholder overskriftene, og hvilke Excel-kolonner som er delegatnummer og fullt navn. I demoarket ligger overskriftene på rad 3. Andre påmeldingsark kan ha dem et annet sted.",
  },
  {
    target: '[data-csv-tutorial="representation"]',
    title: "Slå sammen representasjon",
    description: "Noen svar ligger under ungdomsråd, andre under VGS. Trykk «Legg til reservekolonne» og velg «E – Representerer VGS». Verktøyet bruker første utfylte verdi for hver person, og beholder forskjellen mellom for eksempel Skien ungdomsråd og Skien VGS.",
  },
  {
    target: '[data-csv-tutorial="apply"]',
    title: "Oppdater deltakerlisten",
    description: "Kolonnevalgene er klare. Trykk «Oppdater deltakerlisten» for å bygge radene på nytt. VGS-deltakerne får nå riktig representasjon.",
  },
  {
    target: '[data-csv-tutorial="fix"]',
    title: "Rett en manglende opplysning",
    description: "Hedda mangler hvem hun representerer i demoarket. Skriv for eksempel «Ekstern deltaker» i det markerte feltet. En liste med røde feilrader kan ikke brukes før feilene er rettet.",
  },
  {
    target: '[data-csv-tutorial="actions"]',
    title: "Bruk eller last ned listen",
    description: "En gyldig liste kan brukes direkte i Talestolen eller lastes ned som CSV. CSV-filen inneholder bare delegatnummer, fullt navn og representasjon. Øvingsknappene er deaktivert her, så demoen ikke lagres som ekte deltakere.",
  },
];

function focusHole(rect) {
  return `M${rect.left} ${rect.top}H${rect.left + rect.width}V${rect.top + rect.height}H${rect.left}Z`;
}

export default function CsvTutorial({
  onClose, onLoadDemo, demoLoaded, demoLoading, demoError,
  mappingOpen, orgMapped, mappingApplied, rowsValid, csvPreview,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState(null);
  const [panelStyle, setPanelStyle] = useState({});
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [demoImporting, setDemoImporting] = useState(false);
  const [demoProgress, setDemoProgress] = useState(0);
  const transitionRef = useRef(false);
  const navigationTimerRef = useRef(null);
  const panelRef = useRef(null);
  const stepRef = useRef(stepIndex);
  stepRef.current = stepIndex;

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      if (transitionRef.current) {
        event.preventDefault();
        return;
      }
      const target = document.querySelector(STEPS[stepRef.current].target);
      const selector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], summary";
      const focusable = [
        ...(target?.querySelectorAll(selector) || []),
        ...(target?.matches(selector) ? [target] : []),
        ...panelRef.current.querySelectorAll(selector),
      ].filter((item) => item.getClientRects().length > 0);
      if (!focusable.length) return;
      const currentIndex = focusable.indexOf(document.activeElement);
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      event.preventDefault();
      focusable[nextIndex].focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(navigationTimerRef.current);
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.querySelector('[aria-label="Vis veiledning for CSV-verktøyet"]')?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    const target = document.querySelector(STEPS[stepIndex].target);
    const targetIsInteractive = stepIndex >= 2 && stepIndex <= 6;
    document.body.classList.toggle("csv-tutorial-active", !isTransitioning && targetIsInteractive);
    if (!isTransitioning && targetIsInteractive) target?.classList.add("csv-tutorial-focus");
    return () => {
      document.body.classList.remove("csv-tutorial-active");
      target?.classList.remove("csv-tutorial-focus");
    };
  }, [stepIndex, isTransitioning, demoLoaded, mappingOpen]);

  useEffect(() => {
    document.body.classList.toggle("csv-tutorial-list-step", stepIndex === 1);
    return () => document.body.classList.remove("csv-tutorial-list-step");
  }, [stepIndex]);

  useEffect(() => {
    const target = document.querySelector(STEPS[stepIndex].target);
    if (!target) return undefined;
    const focusBounds = () => {
      const rect = target.getBoundingClientRect();
      return rect.toJSON();
    };
    const desiredScrollY = () => {
      const rect = focusBounds();
      if (stepIndex === 1) return window.scrollY + rect.top - 16;
      const panelHeight = panelRef.current?.offsetHeight || 240;
      const panelBelow = rect.width > window.innerWidth * 0.55;
      const groupHeight = panelBelow ? rect.height + 16 + panelHeight : Math.max(rect.height, panelHeight);
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
      const rect = focusBounds();
      const left = Math.max(8, rect.left - 8);
      const top = Math.max(8, rect.top - 8);
      const right = Math.min(window.innerWidth - 8, rect.right + 8);
      const bottom = Math.min(window.innerHeight - 8, rect.top + rect.height + 8);
      setSpotlight({ left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top), viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });

      const panelWidth = Math.min(420, window.innerWidth - 24);
      const panelHeight = panelRef.current?.offsetHeight || 240;
      if (stepIndex === 1) {
        setPanelStyle({ right: 16, bottom: 16, width: panelWidth });
        return;
      }
      const fitsBelow = rect.top + rect.height + 16 + panelHeight <= window.innerHeight - 12;
      const fitsAbove = rect.top - panelHeight - 16 >= 12;
      if (window.innerWidth >= 740 && window.innerWidth - rect.right >= panelWidth + 20) {
        setPanelStyle({ left: rect.right + 16, top: Math.max(12, Math.min(rect.top, window.innerHeight - panelHeight - 12)), width: panelWidth });
      } else if (window.innerWidth >= 740 && rect.left >= panelWidth + 20) {
        setPanelStyle({ left: rect.left - panelWidth - 16, top: Math.max(12, Math.min(rect.top, window.innerHeight - panelHeight - 12)), width: panelWidth });
      } else if (fitsBelow) {
        setPanelStyle({ left: Math.max(12, Math.min(rect.left, window.innerWidth - panelWidth - 12)), top: rect.top + rect.height + 16, width: panelWidth });
      } else if (fitsAbove) {
        setPanelStyle({ left: Math.max(12, Math.min(rect.left, window.innerWidth - panelWidth - 12)), top: rect.top - panelHeight - 16, width: panelWidth });
      } else {
        setPanelStyle({ right: 12, bottom: 12, width: panelWidth });
      }
    };
    measure();
    let firstFrame = 0;
    let secondFrame = 0;
    let recenterFrame = 0;
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
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          scrollTarget = scrollToFocus("smooth");
          if (Math.abs(window.scrollY - scrollTarget) <= 3) finishTransition();
          else {
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
    const recenter = () => {
      if (transitionRef.current) return measure();
      window.cancelAnimationFrame(recenterFrame);
      recenterFrame = window.requestAnimationFrame(() => {
        scrollToFocus("instant");
        measure();
      });
    };
    const observer = new ResizeObserver(recenter);
    observer.observe(target);
    window.addEventListener("resize", recenter);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.cancelAnimationFrame(recenterFrame);
      window.clearTimeout(scrollFallback);
      window.removeEventListener("scrollend", finishTransition);
      window.removeEventListener("resize", recenter);
      window.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [stepIndex, demoLoaded, mappingOpen]);

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

  async function importDemo() {
    setDemoImporting(true);
    setDemoProgress(5);
    const startedAt = Date.now();
    const progressTimer = window.setInterval(() => {
      setDemoProgress((current) => Math.min(90, current + Math.max(1, Math.round((90 - current) / 8))));
    }, 100);
    try {
      const loaded = await onLoadDemo();
      window.clearInterval(progressTimer);
      if (loaded) setDemoProgress(100);
      // Keep the progress indicator visible long enough to be perceived.
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, 650 - (Date.now() - startedAt))));
    } finally {
      window.clearInterval(progressTimer);
      setDemoImporting(false);
    }
  }

  const canContinue = [demoLoaded && !demoImporting, true, mappingOpen, true, orgMapped, mappingApplied, rowsValid, true][stepIndex];
  const step = STEPS[stepIndex];
  return createPortal(
    <div className={`tutorial-layer tutorial-layer-interactive${isTransitioning ? " tutorial-layer-transitioning" : ""}`}>
      <div className="tutorial-backdrop" aria-hidden="true" />
      {spotlight && (
        <svg className="tutorial-dimmer" viewBox={`0 0 ${spotlight.viewportWidth} ${spotlight.viewportHeight}`} preserveAspectRatio="none" aria-hidden="true">
          <path fillRule="evenodd" d={`M0 0H${spotlight.viewportWidth}V${spotlight.viewportHeight}H0Z ${focusHole(spotlight)}`} />
        </svg>
      )}
      {spotlight && <div className="tutorial-spotlight" style={spotlight} aria-hidden="true" />}
      <div className="tutorial-transition-shade" aria-hidden="true" />
      <section className="tutorial-panel csv-tutorial-panel" style={panelStyle} role="region" aria-labelledby="csv-tutorial-title" ref={panelRef} tabIndex={-1}>
        <div className="tutorial-panel-top">
          <span>CSV-veiledning · {stepIndex + 1} av {STEPS.length}</span>
          <button type="button" className="tutorial-close" onClick={onClose} aria-label="Lukk CSV-veiledning"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4 16 16 M16 4 4 16" /></svg></button>
        </div>
        <div className="tutorial-progress" aria-hidden="true"><span style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} /></div>
        <h2 id="csv-tutorial-title">{step.title}</h2>
        <p className="tutorial-description">{step.description}</p>
        {stepIndex === 0 && (
          <div className="tutorial-demo-block">
            <strong>Demo: 8 fiktive påmeldte</strong>
            <span>Ungdomsråd, VGS og ekstra skjemakolonner</span>
            {demoLoaded && !demoImporting && !demoLoading
              ? <p className="tutorial-success" role="status">✓ Demoarket er lastet inn. Åtte deltakere vises i radeditoren.</p>
              : <button type="button" className="tutorial-demo-button" onClick={importDemo} disabled={demoImporting || demoLoading}>{demoImporting || demoLoading ? "Leser demoarket …" : "Last inn demo-Excel"}</button>}
            {(demoImporting || demoLoading) && <div className="csv-import-progress" role="progressbar" aria-label="Laster inn demo-Excel" aria-valuemin={0} aria-valuemax={100} aria-valuenow={demoProgress}><span style={{ width: `${demoProgress}%` }} /></div>}
            {demoError && <p className="tutorial-error" role="alert">{demoError}</p>}
          </div>
        )}
        {stepIndex === 1 && <p className="tutorial-description">Birk og Daniel mangler representasjon. Det retter vi ved å koble til VGS-kolonnen senere i veiledningen.</p>}
        {stepIndex === 4 && orgMapped && <p className="tutorial-success" role="status">✓ VGS-kolonnen er lagt til som reserve.</p>}
        {stepIndex === 5 && mappingApplied && <p className="tutorial-success" role="status">✓ Deltakerlisten er oppdatert med begge representasjonskolonnene.</p>}
        {stepIndex === 6 && rowsValid && <p className="tutorial-success" role="status">✓ Alle åtte deltakerne har nødvendige opplysninger.</p>}
        {stepIndex === 7 && <pre className="csv-tutorial-preview">{csvPreview.split("\n").slice(0, 3).join("\n")}</pre>}
        <div className="tutorial-panel-actions">
          <button type="button" className="tutorial-quiet-button" onClick={() => navigateStep(stepIndex - 1)} disabled={isTransitioning || stepIndex === 0}>Forrige</button>
          <button type="button" className="tutorial-demo-button" onClick={() => stepIndex === STEPS.length - 1 ? onClose() : navigateStep(stepIndex + 1)} disabled={isTransitioning || !canContinue}>{stepIndex === STEPS.length - 1 ? "Fullfør" : "Neste"}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

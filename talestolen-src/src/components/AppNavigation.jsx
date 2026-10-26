import React, { useEffect, useState } from "react";

const DISPLAY_PRESENCE_KEYS = {
  timer: "talestolen_presence_timer",
  queue: "talestolen_presence_queue",
};

function isDisplayConnected(display) {
  try {
    const presence = JSON.parse(localStorage.getItem(DISPLAY_PRESENCE_KEYS[display]) || "null");
    return Boolean(presence?.updatedAt && Date.now() - presence.updatedAt < 5000);
  } catch {
    return false;
  }
}

function useDisplayConnections() {
  const [connections, setConnections] = useState(() => ({
    timer: isDisplayConnected("timer"),
    queue: isDisplayConnected("queue"),
  }));

  useEffect(() => {
    const update = () => setConnections({
      timer: isDisplayConnected("timer"),
      queue: isDisplayConnected("queue"),
    });
    const interval = window.setInterval(update, 2000);
    window.addEventListener("storage", update);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", update);
      window.removeEventListener("focus", update);
    };
  }, []);

  return connections;
}

export default function AppNavigation({ active = "admin", onOpenTutorial }) {
  const connections = useDisplayConnections();
  const councilId = new URLSearchParams(window.location.search).get("id");
  const councilHome = councilId
    ? `../handlingsplan/raad-portal.html?id=${encodeURIComponent(councilId)}`
    : "../handlingsplan/raad-oversikt.html";
  return (
    <>
      <header className="header">
        <div className="nav-container">
          <div className="navigation-bar">
            <nav className="nav" aria-label="Hovednavigasjon">
              <a className="btn nav" href={councilHome}>Tilbake</a>
              <a
                className="btn nav"
                href="#admin"
                aria-current={active === "admin" ? "page" : undefined}
              >
                Møteledelse
              </a>
            </nav>
            <nav className="nav-r" aria-label="Deltakerimport">
              <a
                className="btn nav-r"
                href="#csv-verktoy"
                aria-current={active === "import" ? "page" : undefined}
              >
                CSV-verktøy
              </a>
            </nav>
          </div>
          <img
            className="brand"
            src={`${import.meta.env.BASE_URL}TU-logov2.png`}
            alt="Telemark Ungdomsråd"
          />
        </div>
        <div className="header-space-container" aria-hidden="true">
          <div className="header-space" />
        </div>
      </header>
      {active === "admin" && <nav className="display-shortcuts" aria-label="Visningsskjermer">
        <a
          className="display-shortcut"
          href="#timer"
          target="talestolen-timer"
          rel="noopener"
          aria-label={`Åpne tidsskjerm i et eget vindu – ${connections.timer ? "tilkoblet" : "ikke tilkoblet"}`}
        >
          Åpne tidsskjerm <span className={`header-status-dot${connections.timer ? " is-connected" : ""}`} aria-hidden="true" />
        </a>
        <a
          className="display-shortcut"
          href="#queue"
          target="talestolen-queue"
          rel="noopener"
          aria-label={`Åpne køskjerm i et eget vindu – ${connections.queue ? "tilkoblet" : "ikke tilkoblet"}`}
        >
          Åpne køskjerm <span className={`header-status-dot${connections.queue ? " is-connected" : ""}`} aria-hidden="true" />
        </a>
        {onOpenTutorial && (
          <button
            type="button"
            className="tutorial-trigger"
            onClick={onOpenTutorial}
            aria-label="Vis veiledning for Talestolen"
            title="Slik bruker du Talestolen"
          >
            ?
          </button>
        )}
      </nav>}
    </>
  );
}

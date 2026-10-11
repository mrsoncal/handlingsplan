// Holder innspill-visninger synkronisert mellom faner og enheter.
(() => {
  const CHANNEL_NAME = "handlingsplan-innspill-updates";
  const STORAGE_KEY = "handlingsplan:innspill-updated";
  let publisher = null;

  function normalizeCouncilId(councilId) {
    return councilId == null ? "" : String(councilId);
  }

  function notify(councilId) {
    const normalizedId = normalizeCouncilId(councilId);
    if (!normalizedId) return;

    const message = {
      type: "innspill-updated",
      councilId: normalizedId,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).slice(2),
    };

    if ("BroadcastChannel" in window) {
      publisher ||= new BroadcastChannel(CHANNEL_NAME);
      publisher.postMessage(message);
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
    } catch {
      // Privat nettlesermodus kan blokkere localStorage. BroadcastChannel/polling virker fortsatt.
    }
  }

  function subscribe(councilId, onUpdate) {
    const normalizedId = normalizeCouncilId(councilId);
    if (!normalizedId || typeof onUpdate !== "function") return () => {};

    const handleMessage = (message) => {
      if (
        message?.type === "innspill-updated" &&
        normalizeCouncilId(message.councilId) === normalizedId
      ) {
        onUpdate();
      }
    };

    let channel = null;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener("message", (event) => handleMessage(event.data));
    }

    const handleStorage = (event) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        handleMessage(JSON.parse(event.newValue));
      } catch {
        // Ignorer ugyldige eller eldre lagrede meldinger.
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      channel?.close();
      window.removeEventListener("storage", handleStorage);
    };
  }

  function startAutoRefresh(refresh, { intervalMs = 3000 } = {}) {
    if (typeof refresh !== "function") return () => {};

    const refreshWhenVisible = () => {
      if (!document.hidden) refresh();
    };
    const timer = window.setInterval(refreshWhenVisible, intervalMs);

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }

  window.HPInnspillSync = {
    notify,
    subscribe,
    startAutoRefresh,
  };
})();

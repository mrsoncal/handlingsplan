(function () {
  const PREFIX = "hp_council_session_v1:";

  function key(councilId) {
    return `${PREFIX}${String(councilId || "")}`;
  }

  function get(councilId) {
    if (!councilId) return null;
    try {
      const session = JSON.parse(localStorage.getItem(key(councilId)) || "null");
      if (!session?.token || !session?.expiresAt || Number(session.expiresAt) <= Date.now()) {
        localStorage.removeItem(key(councilId));
        return null;
      }
      return session;
    } catch {
      localStorage.removeItem(key(councilId));
      return null;
    }
  }

  function set(councilId, session) {
    if (!councilId || !session?.token || !session?.expiresAt) return;
    localStorage.setItem(key(councilId), JSON.stringify({
      token: session.token,
      expiresAt: Number(session.expiresAt),
      councilName: session.councilName || "",
    }));
  }

  function clear(councilId) {
    if (councilId) localStorage.removeItem(key(councilId));
  }

  function headers(councilId) {
    const session = get(councilId);
    return session ? { "X-Council-Session": session.token } : {};
  }

  function requireSession(councilId, redirect = "raad-oversikt.html") {
    const session = get(councilId);
    if (session) return session;
    const target = new URL(redirect, window.location.href);
    if (councilId) target.searchParams.set("council", councilId);
    window.location.replace(target.toString());
    return null;
  }

  window.HPCouncilSession = { get, set, clear, headers, require: requireSession };
})();

(function () {
  const params = new URLSearchParams(window.location.search);
  const councilId = params.get("raadId") || params.get("councilId") || params.get("id");
  const storageKey = councilId ? `raad_brand_${councilId}` : null;

  function readCachedBrand() {
    if (!storageKey) return null;
    try {
      return JSON.parse(localStorage.getItem(storageKey));
    } catch (_) {
      return null;
    }
  }

  function applyBrand(brand) {
    const image = document.getElementById("raadBrandLogo");
    if (!image || !brand?.src) return false;
    image.src = brand.src;
    image.alt = brand.alt || "Ungdomsråd";
    return true;
  }

  function restoreBrand() {
    const image = document.getElementById("raadBrandLogo");
    if (!image) return false;
    const brand = readCachedBrand();
    if (!applyBrand(brand)) {
      image.src = image.dataset.fallbackLogo || "../UFR-logo.png";
    }
    return true;
  }

  const observer = new MutationObserver(() => {
    if (restoreBrand()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.HPBrand = {
    restore: restoreBrand,
    update(council, apiBase) {
      if (!council) return;
      const name = council.display_name || council.name || "Ungdomsråd";
      const brand = {
        src: council.has_logo
          ? `${apiBase}/api/ungdomsrad/${encodeURIComponent(
              council.id
            )}/logo-file?v=${encodeURIComponent(council.logo_version || "current")}`
          : "../UFR-logo.png",
        alt: `Logo for ${name}`,
      };
      applyBrand(brand);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(brand));
        } catch (_) {}
      }
    },
  };
})();
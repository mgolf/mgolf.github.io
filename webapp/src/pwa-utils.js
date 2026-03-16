export const INSTALL_BANNER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldShowInstallBanner({
  visits = 0,
  isStandalone = false,
  hasDeferredPrompt = false,
  dismissedAt = 0,
  now = Date.now(),
  cooldownMs = INSTALL_BANNER_COOLDOWN_MS,
  isInstalled = false,
} = {}) {
  if (isStandalone || isInstalled) return false;
  if (!hasDeferredPrompt) return false;
  if (visits < 2) return false;
  if (dismissedAt && now - dismissedAt < cooldownMs) return false;
  return true;
}

export function parseLaunchState(search, defaults = { activeTab: "map", currentView: "nearby" }) {
  const raw = typeof search === "string" ? search : "";
  const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);
  const tab = params.get("tab");
  const mode = params.get("mode");
  const allowedTabs = new Set(["map", "list", "rules", "score"]);
  const allowedModes = new Set(["nearby", "all", "saved"]);
  return {
    activeTab: allowedTabs.has(tab) ? tab : defaults.activeTab,
    currentView: allowedModes.has(mode) ? mode : defaults.currentView,
    hasExplicitTab: allowedTabs.has(tab),
    hasExplicitMode: allowedModes.has(mode),
  };
}

export function buildConnectivityMessage({ isOnline, activeTab = "map" } = {}) {
  if (isOnline) {
    return {
      tone: "online",
      text: "Wieder online. Daten und Karten koennen aktualisiert werden.",
    };
  }

  if (activeTab === "map") {
    return {
      tone: "offline",
      text: "Offline: zeige Cache. Kartenkacheln und Routen koennen unvollstaendig sein.",
    };
  }

  return {
    tone: "offline",
    text: "Offline: zeige lokal gespeicherte Daten. Neue Inhalte laden spaeter nach.",
  };
}

export function shouldHoldWakeLock({
  activeTab = "map",
  scorePhase = "setup",
  visibilityState = "visible",
  hasWakeLockApi = false,
} = {}) {
  return hasWakeLockApi && visibilityState === "visible" && activeTab === "score" && scorePhase === "play";
}

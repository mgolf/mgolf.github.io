import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "./styles.css";
import { getVenueDetailsById, loadInitialData, scheduleBackgroundWarmup } from "./data-loader.js";
import { getSetting, listFavorites, listVisited, setSetting, toggleFavorite, toggleVisited } from "./storage.js";

const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

const listEl = document.getElementById("venueList");
const searchEl = document.getElementById("searchInput");
const typeEl = document.getElementById("typeFilter");
const metaEl = document.getElementById("datasetMeta");
const appVersionMetaEl = document.getElementById("appVersionMeta");
const updateBannerEl = document.getElementById("updateBanner");
const updateBannerTextEl = document.getElementById("updateBannerText");
const updateReloadBtn = document.getElementById("updateReloadBtn");
const updateDismissBtn = document.getElementById("updateDismissBtn");
const locateBtn = document.getElementById("locateBtn");
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const panelViews = Array.from(document.querySelectorAll(".panel-view"));
const detailDialog = document.getElementById("detailDialog");
const detailTitle = document.getElementById("detailTitle");
const detailContent = document.getElementById("detailContent");
const detailClose = document.getElementById("detailClose");
const aroundMeMetaEl = document.getElementById("aroundMeMeta");
const nearbyRadiusEl = document.getElementById("nearbyRadius");
const nearbyRadiusValueEl = document.getElementById("nearbyRadiusValue");
const refAutoBtn = document.getElementById("refAutoBtn");
const refPointBtn = document.getElementById("refPointBtn");
const refLocationBtn = document.getElementById("refLocationBtn");
const refMapBtn = document.getElementById("refMapBtn");
const listModeNearbyBtn = document.getElementById("listModeNearbyBtn");
const listModeAllBtn = document.getElementById("listModeAllBtn");
const listModeSavedBtn = document.getElementById("listModeSavedBtn");
const panelListEl = document.getElementById("panelList");
const hideVisitedToggle = document.getElementById("hideVisitedToggle");
const pickPointBtn = document.getElementById("pickPointBtn");
const clearPointBtn = document.getElementById("clearPointBtn");
const followMapToggle = document.getElementById("followMapToggle");
const mapFocusMeta = document.getElementById("mapFocusMeta");
const quickToAroundBtn = document.getElementById("quickToAroundBtn");
const quickToListBtn = document.getElementById("quickToListBtn");
const quickResetViewBtn = document.getElementById("quickResetViewBtn");
const onboardingCard = document.getElementById("onboardingCard");
const onboardingDismissBtn = document.getElementById("onboardingDismissBtn");
const scorePlayerNameEl = document.getElementById("scorePlayerName");
const scoreVenueNameEl = document.getElementById("scoreVenueName");
const addScorePlayerBtn = document.getElementById("addScorePlayerBtn");
const scorePlayersListEl = document.getElementById("scorePlayersList");
const confirmParBtn = document.getElementById("confirmParBtn");
const scoreResetRoundBtn = document.getElementById("scoreResetRoundBtn");
const scoreResetOptionsEl = document.getElementById("scoreResetOptions");
const scoreKeepPlayersEl = document.getElementById("scoreKeepPlayers");
const scoreKeepParEl = document.getElementById("scoreKeepPar");
const scoreApplyResetBtn = document.getElementById("scoreApplyResetBtn");
const scoreCancelResetBtn = document.getElementById("scoreCancelResetBtn");
const scoreTurnCard = document.getElementById("scoreTurnCard");
const scoreCurrentPlayerEl = document.getElementById("scoreCurrentPlayer");
const scoreCurrentHoleEl = document.getElementById("scoreCurrentHole");
const scoreCurrentParEl = document.getElementById("scoreCurrentPar");
const scoreStrokeInputEl = document.getElementById("scoreStrokeInput");
const scoreNextTurnBtn = document.getElementById("scoreNextTurnBtn");
const scoreUndoTurnBtn = document.getElementById("scoreUndoTurnBtn");
const scoreGameStatusEl = document.getElementById("scoreGameStatus");
const scoreDensityCompactBtn = document.getElementById("scoreDensityCompactBtn");
const scoreDensityComfortBtn = document.getElementById("scoreDensityComfortBtn");
const scoreA11yLargeBtn = document.getElementById("scoreA11yLargeBtn");
const scoreA11yContrastBtn = document.getElementById("scoreA11yContrastBtn");
const scoreA11yDyslexiaBtn = document.getElementById("scoreA11yDyslexiaBtn");
const scoreResumeBannerEl = document.getElementById("scoreResumeBanner");
const scoreResumeTextEl = document.getElementById("scoreResumeText");
const scoreResumeContinueBtn = document.getElementById("scoreResumeContinueBtn");
const scoreResumeRestartBtn = document.getElementById("scoreResumeRestartBtn");
const scoreHoleStatusEl = document.getElementById("scoreHoleStatus");
const scoreHistoryListEl = document.getElementById("scoreHistoryList");
const scoreTableWrap = document.getElementById("scoreTableWrap");
const scoreFinishedCardEl = document.getElementById("scoreFinishedCard");
const scoreFinishedRankingEl = document.getElementById("scoreFinishedRanking");
const scoreTiebreakerWrapEl = document.getElementById("scoreTiebreakerWrap");
const scoreTiebreakerRowsEl = document.getElementById("scoreTiebreakerRows");
const scoreTiebreakerEvalBtnEl = document.getElementById("scoreTiebreakerEvalBtn");
const scoreShareBtnEl = document.getElementById("scoreShareBtn");
const scoreNewRoundSamePlayersBtnEl = document.getElementById("scoreNewRoundSamePlayersBtn");
const scoreFullResetBtnEl = document.getElementById("scoreFullResetBtn");
const scoreSkipHoleBtnEl = document.getElementById("scoreSkipHoleBtn");
const scoreSkipReasonPanelEl = document.getElementById("scoreSkipReasonPanel");
const scoreSkipCancelBtnEl = document.getElementById("scoreSkipCancelBtn");
const scoreOfflineStatusEl = document.getElementById("scoreOfflineStatus");
const template2BtnEl = document.getElementById("template2Btn");
const template3BtnEl = document.getElementById("template3Btn");
const template4BtnEl = document.getElementById("template4Btn");
const scoreTemplatesRowEl = document.getElementById("scoreTemplatesRow");

const MIN_AROUND_ME_COUNT = 10;
const DEFAULT_NEARBY_RADIUS_KM = 30;
const DEFAULT_FOCUS_RADIUS_KM = 30;
const SCORE_SESSION_KEY = "scoreSessionV2";
const SCORE_DENSITY_KEY = "scoreDensityMode";
const SCORE_A11Y_KEY = "scoreAccessibilityPrefs";
const SCORE_DEFAULT_DENSITY = "comfort";
const SCORE_DEFAULT_A11Y = {
  largeText: true,
  highContrast: true,
  dyslexiaFont: false,
};

let markers = [];
let map = null;
let markerLayer = null;
let userLatLng = null;
let lastKnownLatLng = null;
let referenceMode = "auto";
let nearbyRadiusKm = DEFAULT_NEARBY_RADIUS_KM;
let favorites = new Set();
let visited = new Set();
let currentView = "nearby";
let activeTab = "map";
let hideVisited = false;
let mapCenterLatLng = null;
let customPointLatLng = null;
let followMapCenter = true;
let pickPointMode = false;
let customPointLayer = null;
let mapCenterLayer = null;
let reloadScheduled = false;
let pendingServiceWorker = null;
const SCORE_HOLES = 18;
const MAX_STROKES_PER_HOLE = 7;
let scorePlayers = [];
let scorePar = Array(SCORE_HOLES).fill(2);
let scorePhase = "setup";
let scoreTurn = { holeIndex: 0, playerIndex: 0 };
let scoreHistory = [];
let scoreDensityMode = SCORE_DEFAULT_DENSITY;
let scoreResumeNoticeVisible = false;
let scoreSkips = {};
let scoreLastSavedAt = null;
let scoreTiebreaker = {};
let scoreVenueName = "";
let lastSelectedVenue = null;
let scoreAccessibilityPrefs = { ...SCORE_DEFAULT_A11Y };

async function updateLocateButtonState() {
  if (!locateBtn) return;

  let permissionGranted = false;
  try {
    if (navigator.permissions?.query) {
      const result = await navigator.permissions.query({ name: "geolocation" });
      permissionGranted = result.state === "granted";
      result.onchange = () => {
        updateLocateButtonState().catch(() => {});
      };
    }
  } catch {
    permissionGranted = false;
  }

  const hasLiveLocation = Boolean(userLatLng?.lat && userLatLng?.lng);
  locateBtn.classList.toggle("is-active", permissionGranted && hasLiveLocation);
  const label = locateBtn.querySelector(".label");
  if (label) {
    label.textContent = hasLiveLocation ? "Standort aktiv" : "Standort aktivieren";
  }
}

function triggerClientRefresh(reason = "update") {
  if (reloadScheduled) return;
  reloadScheduled = true;
  if (appVersionMetaEl) {
    appVersionMetaEl.textContent = `Version ${APP_VERSION} • ${reason}, aktualisiere...`;
  }
  window.setTimeout(() => {
    window.location.reload();
  }, 300);
}

function showUpdateBanner(message) {
  if (!updateBannerEl || !updateBannerTextEl) return;
  updateBannerTextEl.textContent = message;
  updateBannerEl.classList.remove("is-hidden");
}

function hideUpdateBanner() {
  if (!updateBannerEl) return;
  updateBannerEl.classList.add("is-hidden");
}

function activatePendingUpdate() {
  if (pendingServiceWorker) {
    pendingServiceWorker.postMessage({ type: "SKIP_WAITING" });
    return;
  }
  triggerClientRefresh("neu laden");
}

function wireServiceWorkerUpdates() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    triggerClientRefresh("neue Version aktiv");
  });

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(APP_VERSION)}`, {
        updateViaCache: "none",
      });

        const promoteWaitingWorker = () => {
        if (registration.waiting) {
            pendingServiceWorker = registration.waiting;
            showUpdateBanner(`Neue Version verfuegbar (${APP_VERSION}).`);
        }
      };

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            promoteWaitingWorker();
          }
        });
      });

      if (registration.waiting) {
        promoteWaitingWorker();
      }
    } catch {
      // Ignore SW registration failures; app still works without offline support.
    }
  });
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const earthRadius = 6371;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const x = s1 * s1 + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * s2 * s2;
  return 2 * earthRadius * Math.asin(Math.sqrt(x));
}

function getActiveReferencePoint() {
  if (referenceMode === "point" && refPointBtn) {
    return customPointLatLng ? { ...customPointLatLng, source: "point" } : null;
  }
  if (referenceMode === "location") {
    return userLatLng ? { ...userLatLng, source: "location" } : null;
  }
  if (referenceMode === "map") {
    return mapCenterLatLng ? { ...mapCenterLatLng, source: "map" } : null;
  }
  if (refPointBtn && customPointLatLng) return { ...customPointLatLng, source: "point" };
  if (userLatLng) return { ...userLatLng, source: "location" };
  if (followMapCenter && mapCenterLatLng) return { ...mapCenterLatLng, source: "map" };
  return null;
}

function updateNearbyRadiusLabel() {
  if (nearbyRadiusValueEl) nearbyRadiusValueEl.textContent = `${nearbyRadiusKm} km`;
  if (nearbyRadiusEl) nearbyRadiusEl.value = String(nearbyRadiusKm);
}

function updateReferenceModeButtons() {
  const buttons = [
    { el: refAutoBtn, mode: "auto" },
    { el: refPointBtn, mode: "point" },
    { el: refLocationBtn, mode: "location" },
    { el: refMapBtn, mode: "map" },
  ];

  for (const { el, mode } of buttons) {
    if (!el) continue;
    el.classList.toggle("is-active", referenceMode === mode);
  }

  if (refPointBtn) refPointBtn.disabled = !customPointLatLng;
  if (refLocationBtn) refLocationBtn.disabled = !userLatLng;
  if (refMapBtn) refMapBtn.disabled = !mapCenterLatLng;
}

function setReferenceMode(mode) {
  if (mode === "point" && !refPointBtn) {
    referenceMode = "auto";
    setSetting("referenceMode", referenceMode).catch(() => {});
    updateReferenceModeButtons();
    updateMapMetaText();
    renderList();
    return;
  }

  referenceMode = mode;
  setSetting("referenceMode", referenceMode).catch(() => {});
  if (mode !== "auto") {
    const reference = getActiveReferencePoint();
    if (reference && map) {
      const focusBounds = L.circle([reference.lat, reference.lng], {
        radius: DEFAULT_FOCUS_RADIUS_KM * 1000,
      }).getBounds();
      map.fitBounds(focusBounds, { padding: [24, 24], maxZoom: 13, animate: true });
    }
  }
  updateReferenceModeButtons();
  updateMapMetaText();
  renderList();
}

function describeReferenceSource(source) {
  if (source === "point") return "Punkt";
  if (source === "map") return "Map-Center";
  return "Standort";
}

function updateMapMetaText() {
  const ref = getActiveReferencePoint();
  if (!ref) {
    mapFocusMeta.textContent = "Keine aktive Referenz. Nutze Standort oder Map-Center.";
    return;
  }
  mapFocusMeta.textContent = `Aktive Referenz: ${describeReferenceSource(ref.source)} (${ref.lat.toFixed(4)}, ${ref.lng.toFixed(4)}) • Radius ${nearbyRadiusKm} km`;
}

function updateMapPointLayers() {
  if (!map || !markerLayer) return;

  if (mapCenterLayer) {
    map.removeLayer(mapCenterLayer);
    mapCenterLayer = null;
  }
  if (customPointLayer) {
    map.removeLayer(customPointLayer);
    customPointLayer = null;
  }

  if (mapCenterLatLng) {
    mapCenterLayer = L.circleMarker([mapCenterLatLng.lat, mapCenterLatLng.lng], {
      radius: 6,
      color: "#2c6d5a",
      weight: 2,
      fillColor: "#ffffff",
      fillOpacity: 0.85,
      interactive: false,
    }).addTo(map);
  }

  if (customPointLatLng) {
    customPointLayer = L.circleMarker([customPointLatLng.lat, customPointLatLng.lng], {
      radius: 8,
      color: "#7a4b00",
      weight: 2,
      fillColor: "#f3b542",
      fillOpacity: 0.9,
    })
      .bindPopup("Custom-Suchpunkt")
      .addTo(map);
  }
}

function setActiveTab(tabName) {
  activeTab = tabName;
  setSetting("activeTab", activeTab).catch(() => {});

  for (const btn of tabButtons) {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  }
  for (const panel of panelViews) {
    panel.classList.toggle("is-active", panel.dataset.panel === tabName);
  }

  if (tabName === "map" && map) {
    window.setTimeout(() => map.invalidateSize(), 60);
  }
}

function wireTabs() {
  for (const btn of tabButtons) {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      if (!target) return;
      setActiveTab(target);
    });
  }
}

function showOnboardingIfNeeded() {
  if (!onboardingCard) return;
  getSetting("onboardingSeen")
    .then((seen) => {
      if (!seen) onboardingCard.classList.remove("is-hidden");
    })
    .catch(() => {
      onboardingCard.classList.remove("is-hidden");
    });

  onboardingDismissBtn?.addEventListener("click", () => {
    onboardingCard.classList.add("is-hidden");
    setSetting("onboardingSeen", true).catch(() => {});
  });
}

function scoreTotal(scores) {
  return scores.reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function applyScoreDensityMode() {
  document.body.dataset.scoreDensity = scoreDensityMode;
  if (scoreDensityCompactBtn) {
    scoreDensityCompactBtn.classList.toggle("is-active", scoreDensityMode === "compact");
  }
  if (scoreDensityComfortBtn) {
    scoreDensityComfortBtn.classList.toggle("is-active", scoreDensityMode === "comfort");
  }
}

function setScoreDensityMode(mode, persist = true) {
  if (mode !== "compact" && mode !== "comfort") return;
  scoreDensityMode = mode;
  applyScoreDensityMode();
  if (persist) {
    setSetting(SCORE_DENSITY_KEY, scoreDensityMode).catch(() => {});
  }
}

function applyScoreAccessibilityPrefs() {
  document.body.classList.toggle("score-a11y-large", Boolean(scoreAccessibilityPrefs.largeText));
  document.body.classList.toggle("score-a11y-contrast", Boolean(scoreAccessibilityPrefs.highContrast));
  document.body.classList.toggle("score-a11y-dyslexia", Boolean(scoreAccessibilityPrefs.dyslexiaFont));

  const config = [
    { el: scoreA11yLargeBtn, key: "largeText" },
    { el: scoreA11yContrastBtn, key: "highContrast" },
    { el: scoreA11yDyslexiaBtn, key: "dyslexiaFont" },
  ];

  for (const { el, key } of config) {
    if (!el) continue;
    const isOn = Boolean(scoreAccessibilityPrefs[key]);
    el.classList.toggle("is-active", isOn);
    el.setAttribute("aria-pressed", isOn ? "true" : "false");
  }
}

function setScoreAccessibilityPref(key, value) {
  if (!(key in scoreAccessibilityPrefs)) return;
  scoreAccessibilityPrefs = {
    ...scoreAccessibilityPrefs,
    [key]: Boolean(value),
  };
  applyScoreAccessibilityPrefs();
  setSetting(SCORE_A11Y_KEY, scoreAccessibilityPrefs).catch(() => {});
}

function createScorePlayer(name, indexHint = 1) {
  return {
    id: `p${Date.now()}${Math.floor(Math.random() * 1000)}`,
    name: (name || "").trim() || `Spieler ${indexHint}`,
    scores: Array(SCORE_HOLES).fill(null),
  };
}

function clampStroke(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.min(MAX_STROKES_PER_HOLE, Math.round(n)));
}

function normalizeScorePlayers(players) {
  if (!Array.isArray(players)) return [];
  return players
    .map((p, index) => {
      const name = (p?.name || "").trim() || `Spieler ${index + 1}`;
      const rawScores = Array.isArray(p?.scores) ? p.scores : [];
      const scores = Array.from({ length: SCORE_HOLES }, (_, i) => {
        const value = rawScores[i];
        if (value === null || value === undefined || value === "") return null;
        return clampStroke(value);
      });
      return { id: p?.id || createScorePlayer(name, index + 1).id, name, scores };
    })
    .filter((p) => p.name);
}

function persistScoreSession() {
  const payload = {
    players: scorePlayers,
    par: scorePar,
    phase: scorePhase,
    turn: scoreTurn,
    history: scoreHistory,
    skips: scoreSkips,
    venueName: scoreVenueName,
  };
  setSetting(SCORE_SESSION_KEY, payload).catch(() => {});
  scoreLastSavedAt = Date.now();
}

function loadScoreSession(session) {
  if (!session || typeof session !== "object") return;

  const loadedPlayers = normalizeScorePlayers(session.players);
  if (loadedPlayers.length > 0) scorePlayers = loadedPlayers;

  if (Array.isArray(session.par)) {
    scorePar = Array.from({ length: SCORE_HOLES }, (_, i) => clampStroke(session.par[i] ?? 2));
  }

  if (session.phase === "setup" || session.phase === "play" || session.phase === "finished") {
    scorePhase = session.phase;
  }

  const maxPlayerIdx = Math.max(0, scorePlayers.length - 1);
  const holeIndex = Number(session?.turn?.holeIndex);
  const playerIndex = Number(session?.turn?.playerIndex);
  scoreTurn = {
    holeIndex: Number.isInteger(holeIndex) ? Math.min(Math.max(holeIndex, 0), SCORE_HOLES - 1) : 0,
    playerIndex: Number.isInteger(playerIndex) ? Math.min(Math.max(playerIndex, 0), maxPlayerIdx) : 0,
  };

  if (Array.isArray(session.history)) {
    scoreHistory = session.history
      .filter((entry) => Number.isInteger(entry?.holeIndex) && Number.isInteger(entry?.playerIndex))
      .map((entry) => ({
        holeIndex: Math.min(Math.max(Number(entry.holeIndex), 0), SCORE_HOLES - 1),
        playerIndex: Math.min(Math.max(Number(entry.playerIndex), 0), maxPlayerIdx),
        previousValue: entry.previousValue === null || entry.previousValue === undefined ? null : clampStroke(entry.previousValue),
        newValue: entry.newValue === null || entry.newValue === undefined ? null : clampStroke(entry.newValue),
        at: Number.isFinite(Number(entry.at)) ? Number(entry.at) : null,
      }));
  }

  if (session.skips && typeof session.skips === "object" && !Array.isArray(session.skips)) {
    scoreSkips = {};
    for (const key of Object.keys(session.skips)) {
      const idx = Number(key);
      if (Number.isInteger(idx) && idx >= 0 && idx < SCORE_HOLES) {
        scoreSkips[idx] = String(session.skips[key]).slice(0, 64);
      }
    }
  }

  if (typeof session.venueName === "string") {
    scoreVenueName = session.venueName.trim();
    if (scoreVenueNameEl) scoreVenueNameEl.value = scoreVenueName;
  }
}

function inferVenueFromContext() {
  if (scoreVenueName) return scoreVenueName;
  if (lastSelectedVenue?.name) {
    return `${lastSelectedVenue.name}${lastSelectedVenue.place ? `, ${lastSelectedVenue.place}` : ""}`;
  }

  const reference = getActiveReferencePoint();
  if (!reference || markers.length === 0) return "";

  const nearest = markers
    .map((item) => ({
      ...item,
      _distanceKm: haversineKm(reference.lat, reference.lng, item.lat, item.lng),
    }))
    .sort((a, b) => a._distanceKm - b._distanceKm)[0];

  if (!nearest || nearest._distanceKm > 5) return "";
  return `${nearest.name}${nearest.place ? `, ${nearest.place}` : ""}`;
}

function scoreTotalTurns() {
  return scorePlayers.length * SCORE_HOLES;
}

function scoreCompletedTurns() {
  return scorePlayers.reduce(
    (sum, player) => sum + player.scores.reduce((acc, value) => acc + (value === null || value === undefined ? 0 : 1), 0),
    0,
  );
}

function getHoleStatus(holeIndex) {
  if (scoreSkips[holeIndex] !== undefined) return "skipped";
  const values = scorePlayers.map((player) => player.scores[holeIndex]);
  const filled = values.filter((value) => value !== null && value !== undefined);
  if (filled.length === 0) return "open";
  if (filled.some((value) => Number(value) === MAX_STROKES_PER_HOLE)) return "max";
  if (filled.length < scorePlayers.length) return "partial";
  return "done";
}

function renderScoreHoleStatus() {
  if (!scoreHoleStatusEl) return;
  if (scorePlayers.length === 0) {
    scoreHoleStatusEl.innerHTML = "";
    return;
  }

  scoreHoleStatusEl.innerHTML = Array.from({ length: SCORE_HOLES }, (_, idx) => {
    const status = getHoleStatus(idx);
    const isCurrent = scorePhase === "play" && scoreTurn.holeIndex === idx;
    const mark = status === "skipped" ? "\u2298" : status === "max" ? "X" : status === "done" ? "OK" : status === "partial" ? "~" : "-";
    return `<button type="button" class="score-hole-chip is-${status} ${isCurrent ? "is-current" : ""}" data-hole-index="${idx}" title="Bahn ${idx + 1}, Status ${status}"><span class="num">${idx + 1}</span><span class="mark">${mark}</span></button>`;
  }).join("");
}

function renderScoreHistory() {
  if (!scoreHistoryListEl) return;
  if (scoreHistory.length === 0) {
    scoreHistoryListEl.innerHTML = "<li class='score-history-empty'>Noch keine Aktionen.</li>";
    return;
  }

  const recent = scoreHistory.slice(-5).reverse();
  scoreHistoryListEl.innerHTML = recent
    .map((entry) => {
      const playerName = scorePlayers[entry.playerIndex]?.name || `Spieler ${entry.playerIndex + 1}`;
      const rawValue = entry.newValue ?? entry.previousValue;
      const shown = Number(rawValue) === MAX_STROKES_PER_HOLE ? "X" : `${rawValue}`;
      return `<li><strong>${playerName}</strong> • Bahn ${entry.holeIndex + 1} • ${shown}</li>`;
    })
    .join("");
}

function renderScoreResumeBanner() {
  if (!scoreResumeBannerEl || !scoreResumeTextEl) return;
  if (!scoreResumeNoticeVisible) {
    scoreResumeBannerEl.classList.add("is-hidden");
    return;
  }

  const done = scoreCompletedTurns();
  const total = scoreTotalTurns();
  scoreResumeTextEl.textContent = `Runde wiederhergestellt: ${done}/${total} Eintraege. Du kannst direkt weitermachen.`;
  scoreResumeBannerEl.classList.remove("is-hidden");
}

function resetScoreRound({ keepPlayers = true, keepPar = true } = {}) {
  if (keepPlayers) {
    scorePlayers = scorePlayers.map((player) => ({
      ...player,
      scores: Array(SCORE_HOLES).fill(null),
    }));
  } else {
    scorePlayers = [];
  }

  if (!keepPar) {
    scorePar = Array(SCORE_HOLES).fill(2);
  }

  scorePhase = "setup";
  scoreTurn = { holeIndex: 0, playerIndex: 0 };
  scoreHistory = [];
  scoreSkips = {};
  scoreTiebreaker = {};
  scoreResetOptionsEl?.classList.add("is-hidden");
  persistScoreSession();
  renderScorePanel();
}

function renderScorePlayersList() {
  if (!scorePlayersListEl) return;
  if (scorePlayers.length === 0) {
    scorePlayersListEl.innerHTML = "<li class='score-player-empty'>Noch keine Spieler. Fuege mindestens einen Spieler hinzu.</li>";
    return;
  }

  scorePlayersListEl.innerHTML = scorePlayers
    .map(
      (player) =>
        `<li><span>${player.name}</span>${
          scorePhase === "setup"
            ? `<button type="button" class="ghost-btn tiny-btn" data-action="remove-setup-player" data-player-id="${player.id}" title="Spieler entfernen" aria-label="Spieler entfernen"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>`
            : ""
        }</li>`,
    )
    .join("");
}

function renderScoreTable() {
  if (!scoreTableWrap) return;

  const parSum = scoreTotal(scorePar);
  const headPlayers = scorePlayers
    .map(
      (p) =>
        `<th>
          <div class="score-player-head">
            <span>${p.name}</span>
            ${
              scorePhase === "setup"
                ? `<button type="button" class="ghost-btn tiny-btn" data-action="remove-player" data-player-id="${p.id}" title="Spieler entfernen" aria-label="Spieler entfernen"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>`
                : ""
            }
          </div>
        </th>`,
    )
    .join("");

  const bodyRows = Array.from({ length: SCORE_HOLES }, (_, idx) => {
    const hole = idx + 1;
    const parCell =
      scorePhase === "setup"
        ? `<input class="score-par-input score-par-inline" type="number" min="1" max="7" step="1" data-hole-index="${idx}" value="${scorePar[idx]}" />`
        : `<span class="score-par-fixed">PAR ${scorePar[idx]}</span>`;

    const isSkipped = scoreSkips[idx] !== undefined;
    const cells = scorePlayers
      .map((p, playerIdx) => {
        if (isSkipped) {
          return `<td class="score-skip-cell" title="\u00dcbersprungen: ${scoreSkips[idx]}">\u2298</td>`;
        }
        const value = p.scores[idx];
        const isCurrent = scorePhase === "play" && scoreTurn.holeIndex === idx && scoreTurn.playerIndex === playerIdx;
        const isMax = Number(value) === MAX_STROKES_PER_HOLE;
        const displayValue = value === null || value === undefined ? "-" : isMax ? "X" : value;
        const classes = `${isCurrent ? "score-current-cell " : ""}${isMax ? "score-max-cell" : ""}`.trim();
        const title = isMax ? ` title="Maximalpunktzahl (${MAX_STROKES_PER_HOLE})"` : "";
        return `<td class="${classes}"${title}>${displayValue}</td>`;
      })
      .join("");
    return `<tr><th class="score-hole-cell"><div class="score-hole-num">${hole}</div><div class="score-hole-par">${parCell}</div></th>${cells}</tr>`;
  }).join("");

  const totalCells = scorePlayers
    .map((p) => {
      const total = scoreTotal(p.scores);
      const delta = total - parSum;
      const deltaText = delta === 0 ? "PAR" : delta > 0 ? `+${delta}` : `${delta}`;
      const deltaCls = delta === 0 ? "score-delta-zero" : delta < 0 ? "score-delta-negative" : "score-delta-positive";
      return `<td><strong>${total}</strong><div class="score-delta ${deltaCls}">${deltaText}</div></td>`;
    })
    .join("");

  scoreTableWrap.innerHTML = `
    <table class="score-table">
      <thead>
        <tr>
          <th>Bahn</th>
          ${headPlayers || "<th>Spieler</th>"}
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
      <tfoot>
        <tr>
          <th><div>Summe</div><div class="score-par-total">PAR ${parSum}</div></th>
          ${totalCells}
        </tr>
      </tfoot>
    </table>
  `;
}

function renderScoreFinishedCard() {
  if (!scoreFinishedCardEl || !scoreFinishedRankingEl) return;

  const parSum = scoreTotal(scorePar);
  const ranked = [...scorePlayers]
    .map((p, originalIdx) => ({ ...p, originalIdx, _total: scoreTotal(p.scores) }))
    .sort((a, b) => a._total - b._total);

  if (ranked.length === 0) {
    scoreFinishedRankingEl.innerHTML = "<li>Keine Spieler.</li>";
    scoreTiebreakerWrapEl?.classList.add("is-hidden");
    return;
  }

  const minTotal = ranked[0]._total;
  const leaders = ranked.filter((p) => p._total === minTotal);
  const hasTie = leaders.length > 1;
  const medals = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];
  let rank = 1;
  let prevTotal = null;
  let displayRank = 1;

  scoreFinishedRankingEl.innerHTML = ranked
    .map((p) => {
      if (p._total !== prevTotal) displayRank = rank;
      prevTotal = p._total;
      rank++;
      const isLeader = p._total === minTotal;
      const medal = displayRank <= 3 ? medals[displayRank - 1] : `${displayRank}.`;
      const delta = p._total - parSum;
      const deltaText = delta === 0 ? "= PAR" : delta > 0 ? `+${delta}` : `${delta}`;
      const deltaCls = delta < 0 ? "score-delta-negative" : delta === 0 ? "score-delta-zero" : "score-delta-positive";
      return `<li class="score-finished-rank-item${isLeader ? " is-winner" : ""}${hasTie && isLeader ? " is-tied" : ""}">
        <span class="rank-medal">${medal}</span>
        <span class="rank-name">${p.name}</span>
        <span class="rank-total"><strong>${p._total}</strong>&nbsp;<span class="score-delta ${deltaCls}">${deltaText}</span></span>
      </li>`;
    })
    .join("");

  if (scoreTiebreakerWrapEl) {
    if (hasTie) {
      scoreTiebreakerWrapEl.classList.remove("is-hidden");
      if (scoreTiebreakerRowsEl) {
        scoreTiebreakerRowsEl.innerHTML = leaders
          .map((p) => {
            const strokes = scoreTiebreaker[p.originalIdx] ?? 2;
            return `<div class="score-tiebreaker-row" data-player-idx="${p.originalIdx}">
              <span class="tb-name">${p.name}</span>
              <button type="button" class="ghost-btn tiny-btn tb-minus" data-player-idx="${p.originalIdx}">&minus;</button>
              <span class="tb-strokes">${strokes}</span>
              <button type="button" class="ghost-btn tiny-btn tb-plus" data-player-idx="${p.originalIdx}">+</button>
            </div>`;
          })
          .join("");
      }
    } else {
      scoreTiebreakerWrapEl.classList.add("is-hidden");
    }
  }
}

function evalTiebreaker() {
  const minTotal = Math.min(...scorePlayers.map((p) => scoreTotal(p.scores)));
  const leaders = scorePlayers
    .map((p, idx) => ({ name: p.name, originalIdx: idx, _total: scoreTotal(p.scores) }))
    .filter((p) => p._total === minTotal);
  const withTb = leaders
    .map((p) => ({ ...p, tbStrokes: scoreTiebreaker[p.originalIdx] ?? 999 }))
    .sort((a, b) => a.tbStrokes - b.tbStrokes);
  const minTb = withTb[0].tbStrokes;
  const winners = withTb.filter((p) => p.tbStrokes === minTb);
  const resultEl = document.getElementById("scoreTiebreakerResult");
  if (!resultEl) return;
  if (minTb === 999) {
    resultEl.textContent = "Bitte Schlaege eintragen.";
    return;
  }
  resultEl.textContent =
    winners.length > 1
      ? `Noch Gleichstand: ${winners.map((p) => p.name).join(" und ")} (${minTb} Schl.)`
      : `\uD83C\uDFC6 Gewinner: ${winners[0].name} mit ${minTb} Schlag/Schlaegen`;
}

function skipHole(reason) {
  if (scorePhase !== "play" || scorePlayers.length === 0) return;
  const holeIndex = scoreTurn.holeIndex;
  scoreSkips[holeIndex] = reason;
  scoreSkipReasonPanelEl?.classList.add("is-hidden");
  if (holeIndex === SCORE_HOLES - 1) {
    scorePhase = "finished";
  } else {
    scoreTurn = { holeIndex: holeIndex + 1, playerIndex: 0 };
  }
  persistScoreSession();
  renderScorePanel();
}

function applyTemplate(count) {
  if (scorePhase !== "setup") return;
  scorePlayers = Array.from({ length: count }, (_, i) => createScorePlayer(`Spieler ${i + 1}`, i + 1));
  persistScoreSession();
  renderScorePanel();
}

function buildScoreShareData() {
  const parSum = scoreTotal(scorePar);
  const venueLabel = inferVenueFromContext();
  const ranked = [...scorePlayers]
    .map((p) => ({ name: p.name, total: scoreTotal(p.scores) }))
    .sort((a, b) => a.total - b.total);

  const lines = ranked.map((p, i) => {
    const delta = p.total - parSum;
    const deltaText = delta === 0 ? "= PAR" : delta > 0 ? `+${delta}` : `${delta}`;
    return `${i + 1}. ${p.name}: ${p.total} (${deltaText})`;
  });

  const skippedKeys = Object.keys(scoreSkips);
  const skippedLine = skippedKeys.length > 0 ? `Uebersprungene Bahnen: ${skippedKeys.map((h) => Number(h) + 1).join(", ")}` : "";
  const hashtagLine = "#Minigolf #gGolf #Scorecard #Freizeit #Team";
  const text = [
    "Minigolf-Ergebnis",
    venueLabel ? `Ort/Bahn: ${venueLabel}` : "",
    "",
    ...lines,
    skippedLine,
    "",
    `PAR-Summe: ${parSum}`,
    hashtagLine,
  ]
    .filter(Boolean)
    .join("\n");

  return { parSum, ranked, lines, skippedLine, hashtagLine, text, venueLabel };
}

async function shareScoreResult() {
  const data = buildScoreShareData();

  if (navigator.share) {
    try {
      await navigator.share({ title: "Minigolf Ergebnis", text: data.text });
      return;
    } catch {
      // Fall through to clipboard.
    }
  }

  try {
    await navigator.clipboard.writeText(data.text);
    const btn = scoreShareBtnEl;
    if (btn) {
      const original = btn.textContent;
      btn.textContent = "\u2713 Text kopiert";
      window.setTimeout(() => {
        btn.textContent = original;
      }, 2000);
    }
  } catch {
    /* ignore */
  }
}

function renderOfflineStatus() {
  if (!scoreOfflineStatusEl) return;
  if (!scoreLastSavedAt) {
    scoreOfflineStatusEl.textContent = "";
    return;
  }
  const secAgo = Math.round((Date.now() - scoreLastSavedAt) / 1000);
  let text;
  if (secAgo < 5) text = "Gerade gespeichert";
  else if (secAgo < 60) text = `Gespeichert vor ${secAgo} Sek.`;
  else if (secAgo < 120) text = "Gespeichert vor 1 Min.";
  else text = `Gespeichert vor ${Math.round(secAgo / 60)} Min.`;
  scoreOfflineStatusEl.textContent = `\uD83D\uDCBE ${text}`;
}

function renderScorePanel() {
  renderScorePlayersList();
  renderScoreHoleStatus();
  renderScoreHistory();
  renderScoreResumeBanner();
  renderScoreTable();
  renderOfflineStatus();

  const hasPlayers = scorePlayers.length > 0;
  if (confirmParBtn) confirmParBtn.disabled = !hasPlayers || scorePhase !== "setup";

  if (scorePhase === "play" && hasPlayers) {
    scoreTurnCard?.classList.remove("is-hidden");
    const activePlayer = scorePlayers[scoreTurn.playerIndex] || scorePlayers[0];
    scoreCurrentPlayerEl.textContent = activePlayer?.name || "Spieler";
    scoreCurrentHoleEl.textContent = `Bahn ${scoreTurn.holeIndex + 1}`;
    scoreCurrentParEl.textContent = `PAR ${scorePar[scoreTurn.holeIndex]}`;
    if (scoreStrokeInputEl && document.activeElement !== scoreStrokeInputEl) {
      scoreStrokeInputEl.value = String(scorePar[scoreTurn.holeIndex] || 2);
    }
  } else {
    scoreTurnCard?.classList.add("is-hidden");
  }

  // Show/hide finished card
  if (scoreFinishedCardEl) {
    scoreFinishedCardEl.classList.toggle("is-hidden", scorePhase !== "finished");
  }
  if (scorePhase === "finished") {
    renderScoreFinishedCard();
  }

  // Template buttons only visible in setup
  if (scoreTemplatesRowEl) {
    scoreTemplatesRowEl.classList.toggle("is-hidden", scorePhase !== "setup");
  }

  // Skip button only visible during play
  if (scoreSkipHoleBtnEl) {
    scoreSkipHoleBtnEl.classList.toggle("is-hidden", scorePhase !== "play");
  }

  const totalTurns = scoreTotalTurns();
  const doneTurns = scoreCompletedTurns();
  if (scoreGameStatusEl) {
    if (scorePhase === "setup") {
      scoreGameStatusEl.textContent = hasPlayers
        ? `Setup bereit: ${scorePlayers.length} Spieler. PAR bestaetigen und starten.`
        : "Schritt 1: Spieler hinzufuegen.";
    } else if (scorePhase === "play") {
      scoreGameStatusEl.textContent = `Spiel laeuft: ${doneTurns} / ${totalTurns} Zuege abgeschlossen. Bahnstatus oben antippen zum Wechsel.`;
    } else {
      scoreGameStatusEl.textContent = "";
    }
  }

  if (scoreResetRoundBtn) {
    scoreResetRoundBtn.disabled = scorePhase === "play";
  }
  if (scoreUndoTurnBtn) scoreUndoTurnBtn.disabled = scoreHistory.length === 0 || scorePhase === "setup";
  if (scoreNextTurnBtn) scoreNextTurnBtn.disabled = !hasPlayers || scorePhase !== "play";
}

function wireScoreEvents() {
  const addPlayer = () => {
    if (scorePhase !== "setup") return;
    const name = (scorePlayerNameEl?.value || "").trim();
    scorePlayers.push(createScorePlayer(name, scorePlayers.length + 1));
    if (scorePlayerNameEl) scorePlayerNameEl.value = "";
    persistScoreSession();
    renderScorePanel();
  };

  addScorePlayerBtn?.addEventListener("click", () => {
    addPlayer();
  });

  scorePlayerNameEl?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addPlayer();
  });

  confirmParBtn?.addEventListener("click", () => {
    if (scorePhase !== "setup" || scorePlayers.length === 0) return;
    scorePar = scorePar.map((x) => clampStroke(x));
    scorePlayers = scorePlayers.map((player) => ({
      ...player,
      scores: Array(SCORE_HOLES).fill(null),
    }));
    scorePhase = "play";
    scoreTurn = { holeIndex: 0, playerIndex: 0 };
    scoreHistory = [];
    persistScoreSession();
    renderScorePanel();
    scoreStrokeInputEl?.focus();
  });

  const commitTurn = (strokeValue) => {
    if (scorePhase !== "play" || scorePlayers.length === 0) return;

    const holeIndex = scoreTurn.holeIndex;
    const playerIndex = scoreTurn.playerIndex;
    const player = scorePlayers[playerIndex];
    if (!player) return;

    const stroke = clampStroke(strokeValue);
    const previousValue = player.scores[holeIndex] ?? null;
    player.scores[holeIndex] = stroke;
    scoreHistory.push({ holeIndex, playerIndex, previousValue, newValue: stroke, at: Date.now() });
    scoreResumeNoticeVisible = false;

    const isLastPlayerInHole = playerIndex === scorePlayers.length - 1;
    if (isLastPlayerInHole) {
      if (holeIndex === SCORE_HOLES - 1) {
        scorePhase = "finished";
      } else {
        scoreTurn = { holeIndex: holeIndex + 1, playerIndex: 0 };
      }
    } else {
      scoreTurn = { holeIndex, playerIndex: playerIndex + 1 };
    }

    persistScoreSession();
    renderScorePanel();
    scoreStrokeInputEl?.focus();
    scoreStrokeInputEl?.select();
  };

  scoreResetRoundBtn?.addEventListener("click", () => {
    scoreResetOptionsEl?.classList.toggle("is-hidden");
  });

  scoreApplyResetBtn?.addEventListener("click", () => {
    resetScoreRound({
      keepPlayers: Boolean(scoreKeepPlayersEl?.checked),
      keepPar: Boolean(scoreKeepParEl?.checked),
    });
  });

  scoreCancelResetBtn?.addEventListener("click", () => {
    scoreResetOptionsEl?.classList.add("is-hidden");
  });

  scoreResumeContinueBtn?.addEventListener("click", () => {
    scoreResumeNoticeVisible = false;
    renderScorePanel();
    scoreStrokeInputEl?.focus();
  });

  scoreResumeRestartBtn?.addEventListener("click", () => {
    scoreResumeNoticeVisible = false;
    scoreResetOptionsEl?.classList.remove("is-hidden");
    renderScorePanel();
  });

  scoreNextTurnBtn?.addEventListener("click", () => {
    commitTurn(scoreStrokeInputEl?.value ?? 2);
  });

  scoreVenueNameEl?.addEventListener("input", () => {
    scoreVenueName = (scoreVenueNameEl.value || "").trim();
    persistScoreSession();
  });

  scoreStrokeInputEl?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitTurn(scoreStrokeInputEl.value || 2);
  });

  scoreStrokeInputEl?.addEventListener("input", () => {
    if (scorePhase !== "play") return;
    const typed = Number(scoreStrokeInputEl.value);
    if (!Number.isFinite(typed)) return;
    if (typed >= MAX_STROKES_PER_HOLE) {
      scoreStrokeInputEl.value = String(MAX_STROKES_PER_HOLE);
      commitTurn(MAX_STROKES_PER_HOLE);
    }
  });

  scoreTurnCard?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const btn = target.closest("button.score-quick-btn");
    if (!btn) return;
    const mode = btn.dataset.strokesMode || "delta";
    const raw = Number(btn.dataset.strokes);
    if (!Number.isFinite(raw)) return;
    const par = scorePar[scoreTurn.holeIndex] || 2;
    const quick = mode === "par" ? par : par + raw;
    const stroke = clampStroke(quick);
    scoreStrokeInputEl.value = String(stroke);
    commitTurn(stroke);
  });

  scoreHoleStatusEl?.addEventListener("click", (event) => {
    if (scorePhase !== "play") return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const chip = target.closest("button[data-hole-index]");
    if (!chip) return;

    const holeIndex = Number(chip.getAttribute("data-hole-index"));
    if (!Number.isInteger(holeIndex)) return;

    let playerIndex = scorePlayers.findIndex((player) => player.scores[holeIndex] === null || player.scores[holeIndex] === undefined);
    if (playerIndex < 0) playerIndex = 0;

    scoreTurn = { holeIndex, playerIndex };
    persistScoreSession();
    renderScorePanel();
    scoreStrokeInputEl?.focus();
  });

  scoreDensityCompactBtn?.addEventListener("click", () => {
    setScoreDensityMode("compact");
  });

  scoreDensityComfortBtn?.addEventListener("click", () => {
    setScoreDensityMode("comfort");
  });

  scoreA11yLargeBtn?.addEventListener("click", () => {
    setScoreAccessibilityPref("largeText", !scoreAccessibilityPrefs.largeText);
  });

  scoreA11yContrastBtn?.addEventListener("click", () => {
    setScoreAccessibilityPref("highContrast", !scoreAccessibilityPrefs.highContrast);
  });

  scoreA11yDyslexiaBtn?.addEventListener("click", () => {
    setScoreAccessibilityPref("dyslexiaFont", !scoreAccessibilityPrefs.dyslexiaFont);
  });

  scoreUndoTurnBtn?.addEventListener("click", () => {
    if (scoreHistory.length === 0 || scorePlayers.length === 0) return;
    const last = scoreHistory.pop();
    const player = scorePlayers[last.playerIndex];
    if (!player) return;
    player.scores[last.holeIndex] = last.previousValue;
    scorePhase = "play";
    scoreTurn = { holeIndex: last.holeIndex, playerIndex: last.playerIndex };
    scoreResumeNoticeVisible = false;
    persistScoreSession();
    renderScorePanel();
    scoreStrokeInputEl?.focus();
  });

  scoreTableWrap?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (target.classList.contains("score-par-input")) {
      if (scorePhase !== "setup") return;
      const holeIndex = Number(target.dataset.holeIndex);
      if (Number.isInteger(holeIndex)) {
        scorePar[holeIndex] = clampStroke(target.value);
        persistScoreSession();
        renderScorePanel();
      }
    }
  });

  scorePlayersListEl?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || scorePhase !== "setup") return;
    const btn = target.closest("button[data-action='remove-setup-player']");
    if (!btn) return;
    const playerId = btn.getAttribute("data-player-id");
    if (!playerId) return;
    scorePlayers = scorePlayers.filter((p) => p.id !== playerId);
    persistScoreSession();
    renderScorePanel();
  });

  scoreTableWrap?.addEventListener("click", (event) => {
    if (scorePhase !== "setup") return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const btn = target.closest("button[data-action='remove-player']");
    if (!btn) return;
    const playerId = btn.getAttribute("data-player-id");
    if (!playerId) return;
    scorePlayers = scorePlayers.filter((p) => p.id !== playerId);
    persistScoreSession();
    renderScorePanel();
  });

  // Quick-start templates
  template2BtnEl?.addEventListener("click", () => applyTemplate(2));
  template3BtnEl?.addEventListener("click", () => applyTemplate(3));
  template4BtnEl?.addEventListener("click", () => applyTemplate(4));

  // Skip hole
  scoreSkipHoleBtnEl?.addEventListener("click", () => {
    scoreSkipReasonPanelEl?.classList.toggle("is-hidden");
  });

  scoreSkipReasonPanelEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-reason]");
    if (btn) skipHole(btn.dataset.reason);
  });

  scoreSkipCancelBtnEl?.addEventListener("click", () => {
    scoreSkipReasonPanelEl?.classList.add("is-hidden");
  });

  // Finished card actions
  scoreShareBtnEl?.addEventListener("click", () => shareScoreResult().catch(() => {}));

  scoreNewRoundSamePlayersBtnEl?.addEventListener("click", () => {
    resetScoreRound({ keepPlayers: true, keepPar: true });
  });

  scoreFullResetBtnEl?.addEventListener("click", () => {
    resetScoreRound({ keepPlayers: false, keepPar: false });
  });

  // Tiebreaker +/- buttons
  scoreTiebreakerRowsEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const pIdx = Number(btn.dataset.playerIdx);
    if (!Number.isInteger(pIdx)) return;
    const current = scoreTiebreaker[pIdx] ?? 2;
    if (btn.classList.contains("tb-minus")) {
      scoreTiebreaker[pIdx] = Math.max(1, current - 1);
    } else if (btn.classList.contains("tb-plus")) {
      scoreTiebreaker[pIdx] = Math.min(MAX_STROKES_PER_HOLE, current + 1);
    }
    renderScoreFinishedCard();
  });

  scoreTiebreakerEvalBtnEl?.addEventListener("click", () => evalTiebreaker());
}

function initMap(bounds, savedMapView = null) {
  map = L.map("map", { zoomControl: true, minZoom: 4 }).setView([51.1634, 10.4477], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);

  if (
    savedMapView &&
    typeof savedMapView.lat === "number" &&
    typeof savedMapView.lng === "number" &&
    typeof savedMapView.zoom === "number"
  ) {
    map.setView([savedMapView.lat, savedMapView.lng], Math.min(18, Math.max(4, savedMapView.zoom)), {
      animate: false,
    });
  } else if (bounds?.lat_min && bounds?.lng_min && bounds?.lat_max && bounds?.lng_max) {
    const leafletBounds = L.latLngBounds(
      [bounds.lat_min, bounds.lng_min],
      [bounds.lat_max, bounds.lng_max],
    );
    map.fitBounds(leafletBounds.pad(0.04));
  }

  const center = map.getCenter();
  mapCenterLatLng = { lat: center.lat, lng: center.lng };
  updateMapPointLayers();
  updateMapMetaText();

  map.on("moveend", () => {
    const c = map.getCenter();
    mapCenterLatLng = { lat: c.lat, lng: c.lng };
    setSetting("lastMapView", { lat: c.lat, lng: c.lng, zoom: map.getZoom() }).catch(() => {});
    updateMapPointLayers();
    updateReferenceModeButtons();
    updateMapMetaText();
    renderList();
  });

  map.on("click", (event) => {
    if (!pickPointMode) return;
    customPointLatLng = { lat: event.latlng.lat, lng: event.latlng.lng };
    setSetting("customPoint", customPointLatLng).catch(() => {});
    followMapCenter = false;
    followMapToggle.checked = false;
    setSetting("followMapCenter", followMapCenter).catch(() => {});
    referenceMode = "point";
    setSetting("referenceMode", referenceMode).catch(() => {});
    pickPointMode = false;
    pickPointBtn?.classList.remove("is-active");
    const customBounds = L.circle([customPointLatLng.lat, customPointLatLng.lng], {
      radius: DEFAULT_FOCUS_RADIUS_KM * 1000,
    }).getBounds();
    map.fitBounds(customBounds, { padding: [24, 24], maxZoom: 13, animate: true });
    updateMapPointLayers();
    updateReferenceModeButtons();
    updateMapMetaText();
    renderList();
  });
}

function matchesFilter(item, search, type) {
  const hay = `${item.id || ""} ${item.name} ${item.place || ""} ${item.postcode || ""}`.toLowerCase();
  const okSearch = !search || hay.includes(search);
  const okType = !type || (item.course_types || []).includes(type);
  return okSearch && okType;
}

function markerById(id) {
  return markers.find((m) => m.id === id) || null;
}

function renderVenueId(id) {
  return id ? `<span class="venue-id">ID: ${id}</span>` : "";
}

function renderCoordinateSource(item) {
  const label = item?.coordinate_source_label || item?.coordinates?.source?.label;
  const raw = item?.coordinate_source_raw || item?.source?.coordinate_source?.raw_geocode_source;
  if (!label && !raw) return "";
  return `<span class="coord-source">Koordinaten: ${label || raw}${label && raw && label !== raw ? ` <span class="coord-source-raw">(${raw})</span>` : ""}</span>`;
}

function buildRouteUrl(item) {
  const destination = `${item.lat},${item.lng}`;
  const params = new URLSearchParams({
    api: "1",
    destination,
    travelmode: "walking",
  });

  if (userLatLng) {
    params.set("origin", `${userLatLng.lat},${userLatLng.lng}`);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function openRoute(item) {
  const url = buildRouteUrl(item);
  window.open(url, "_blank", "noopener,noreferrer");
}

function nearbyPoiHint(item) {
  if (item.nearby_trusted_address) {
    return `In der Naehe von: ${item.nearby_trusted_address}`;
  }

  if (item.google_relation_kind !== "nearby_reference") return null;
  if (!item.google_poi_name) return null;

  // Atlas venue: show nearby Google POI only when no OSM linkage exists.
  if (item.source_plz_group && item.source_plz_group !== "osm" && item.has_osm_reference) {
    return null;
  }

  return `POI in der Naehe: ${item.google_poi_name}`;
}

function renderActionButtons(item, options = {}) {
  const { compact = false } = options;
  const favClass = favorites.has(item.id) ? "action-btn fav-btn is-favorite" : "action-btn fav-btn";
  const favLabel = favorites.has(item.id) ? "Gemerkt" : "Merken";
  const visitClass = visited.has(item.id) ? "action-btn visit-btn is-visited" : "action-btn visit-btn";
  const visitLabel = visited.has(item.id) ? "Besucht" : "Besucht";

  return `
    <button type="button" class="action-btn detail-btn" data-action="detail" data-id="${item.id}" title="Details" aria-label="Details">
      <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
      <span class="label">Details</span>
    </button>
    <button type="button" class="action-btn map-btn" data-action="fly" data-id="${item.id}" title="Karte" aria-label="Karte fokussieren">
      <i class="fa-solid fa-map-location-dot" aria-hidden="true"></i>
      <span class="label">Karte</span>
    </button>
    <button type="button" class="action-btn route-btn" data-action="route" data-id="${item.id}" title="Route" aria-label="Route starten">
      <i class="fa-solid fa-route" aria-hidden="true"></i>
      <span class="label">Route</span>
    </button>
    <button type="button" class="${favClass}" data-action="favorite" data-id="${item.id}" title="${favLabel}" aria-label="${favLabel}">
      <i class="fa-${favorites.has(item.id) ? "solid" : "regular"} fa-bookmark" aria-hidden="true"></i>
      <span class="label">${compact ? "Save" : favLabel}</span>
    </button>
    <button type="button" class="${visitClass}" data-action="visited" data-id="${item.id}" title="${visitLabel}" aria-label="${visitLabel}">
      <i class="fa-solid fa-check-circle" aria-hidden="true"></i>
      <span class="label">${compact ? "Visited" : visitLabel}</span>
    </button>
  `;
}

function rankNearby(items, reference) {
  return items
    .map((item) => ({
      ...item,
      _distanceKm: haversineKm(reference.lat, reference.lng, item.lat, item.lng),
      _rating: typeof item.rating === "number" ? item.rating : 0,
    }))
    .sort((a, b) => {
      if (a._distanceKm !== b._distanceKm) return a._distanceKm - b._distanceKm;
      return b._rating - a._rating;
    });
}

function applyTopFilters(items) {
  let out = items;
  if (currentView === "saved") {
    out = out.filter((item) => favorites.has(item.id));
  }
  if (hideVisited) {
    out = out.filter((item) => !visited.has(item.id));
  }
  return out;
}

function buildVenueListItem(item, { showRating = false, showTypes = false } = {}) {
  const li = document.createElement("li");
  li.className = "venue-item";
  const distance = typeof item._distanceKm === "number" ? `${item._distanceKm.toFixed(1)} km` : null;
  const rating = showRating && typeof item.rating === "number" ? `★ ${item.rating.toFixed(1)}` : null;
  const types = showTypes ? (item.course_types || []).map((t) => `<span class="chip">${t}</span>`).join(" ") : "";
  const visitedBadge = visited.has(item.id) ? "<span class='visited-badge'>visited</span>" : "";
  const poiHint = nearbyPoiHint(item);
  const distLine = [distance, rating].filter(Boolean).join(" • ");

  li.innerHTML = `
    <h3>${item.name}${visitedBadge}</h3>
    <div class="venue-meta venue-tags">${renderVenueId(item.id)} ${renderCoordinateSource(item)}</div>
    ${distLine ? `<div class="venue-meta">${distLine}</div>` : ""}
    <div class="venue-meta">${item.postcode || ""} ${item.place || ""}</div>
    ${types ? `<div class="venue-meta">${types || "<span class='chip'>unknown</span>"}</div>` : ""}
    ${poiHint ? `<div class="poi-note">${poiHint}</div>` : ""}
    <div class="venue-actions">
      ${renderActionButtons(item)}
    </div>
  `;

  li.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.getAttribute("data-action");
    const itemId = target.getAttribute("data-id");
    if (!action) return;
    if (action === "detail" || action === "fly" || action === "route") {
      lastSelectedVenue = item;
      if (!scoreVenueName && scoreVenueNameEl) {
        scoreVenueNameEl.value = `${item.name}${item.place ? `, ${item.place}` : ""}`;
      }
    }
    if (action === "detail") showDetails(item.id);
    if (action === "fly") map.flyTo([item.lat, item.lng], 14, { duration: 0.6 });
    if (action === "route") openRoute(item);
    if (action === "favorite" && itemId) {
      toggleFavorite(itemId)
        .then((isFav) => {
          if (isFav) favorites.add(itemId);
          else favorites.delete(itemId);
          renderList();
        })
        .catch(() => {});
    }
    if (action === "visited" && itemId) {
      toggleVisited(itemId)
        .then((isVis) => {
          if (isVis) visited.add(itemId);
          else visited.delete(itemId);
          renderList();
        })
        .catch(() => {});
    }
  });

  return li;
}

async function showDetails(venueId) {
  detailTitle.textContent = "Loading...";
  detailContent.textContent = "";
  detailDialog.showModal();

  const venue = await getVenueDetailsById(venueId);
  if (!venue) {
    detailTitle.textContent = "No details available";
    detailContent.textContent = "This venue has no full detail record yet.";
    return;
  }

  detailTitle.textContent = venue.name || "Venue";

  const line1 = [venue.address?.street_name, venue.address?.house_number].filter(Boolean).join(" ");
  const line2 = [venue.address?.postcode, venue.address?.place].filter(Boolean).join(" ");
  const rating = venue.google?.rating ? `${venue.google.rating} (${venue.google.rating_count || 0})` : "n/a";

  detailContent.innerHTML = `
    <p><strong>ID:</strong> <span class="venue-id">${venue.id || "-"}</span></p>
    <p><strong>Koordinatenquelle:</strong> ${venue.source?.coordinate_source?.label || venue.source?.coordinate_source?.raw_geocode_source || "-"}</p>
    <p><strong>Lat/Lng:</strong> ${venue.coordinates?.lat ?? "-"}, ${venue.coordinates?.lng ?? "-"}</p>
    <p><strong>Address:</strong> ${line1 || "-"}, ${line2 || "-"}</p>
    <p><strong>Course Types:</strong> ${(venue.classification?.course_types || []).join(", ") || "-"}</p>
    <p><strong>Rating:</strong> ${rating}</p>
    <p><strong>Card Accepted:</strong> ${venue.classification?.accepts_minigolf_card ? "Yes" : "No"}</p>
    <p><strong>Website:</strong> ${
      venue.contact?.website
        ? `<a href="${venue.contact.website}" target="_blank" rel="noreferrer">${venue.contact.website}</a>`
        : "-"
    }</p>
  `;
}

function renderList() {
  if (!listEl) return;
  const reference = getActiveReferencePoint();

  if (currentView === "nearby") {
    listEl.innerHTML = "";
    if (!reference) {
      if (aroundMeMetaEl) aroundMeMetaEl.textContent = "Aktiviere Standort oder nutze Map-Center/Punkt fuer Nearby-Liste.";
      return;
    }
    const ranked = rankNearby(applyTopFilters(markers), reference);
    if (ranked.length === 0) {
      if (aroundMeMetaEl) aroundMeMetaEl.textContent = "Keine Orte fuer die aktuelle Filterauswahl gefunden.";
      return;
    }
    let effectiveRadiusKm = nearbyRadiusKm;
    let chosen = ranked.filter((x) => x._distanceKm <= effectiveRadiusKm);
    // Expand to the minimum radius that yields at least MIN_AROUND_ME_COUNT selectable venues.
    if (chosen.length < MIN_AROUND_ME_COUNT && ranked.length >= MIN_AROUND_ME_COUNT) {
      effectiveRadiusKm = ranked[MIN_AROUND_ME_COUNT - 1]._distanceKm;
      chosen = ranked.filter((x) => x._distanceKm <= effectiveRadiusKm);
    }
    if (chosen.length < MIN_AROUND_ME_COUNT) {
      chosen = ranked;
      effectiveRadiusKm = ranked[ranked.length - 1]._distanceKm;
    }
    if (aroundMeMetaEl) {
      aroundMeMetaEl.textContent =
        effectiveRadiusKm > nearbyRadiusKm
          ? `Radius dynamisch erweitert auf ${effectiveRadiusKm.toFixed(1)} km, damit mindestens ${Math.min(MIN_AROUND_ME_COUNT, ranked.length)} Orte verfuegbar sind (${chosen.length} Treffer).`
          : `Zeige ${chosen.length} Orte innerhalb ${effectiveRadiusKm.toFixed(1)} km um ${describeReferenceSource(reference.source)}.`;
    }
    for (const item of chosen) {
      listEl.appendChild(buildVenueListItem(item, { showRating: true }));
    }
    return;
  }

  // "all" / "saved" mode
  const search = searchEl.value.trim().toLowerCase();
  const type = typeEl.value;

  const filtered = applyTopFilters(markers)
    .filter((m) => matchesFilter(m, search, type))
    .map((m) => {
      if (reference) {
        return { ...m, _distanceKm: haversineKm(reference.lat, reference.lng, m.lat, m.lng) };
      }
      return m;
    })
    .sort((a, b) => {
      if (reference) return (a._distanceKm || 9999) - (b._distanceKm || 9999);
      return a.name.localeCompare(b.name);
    })
    .slice(0, 250);

  listEl.innerHTML = "";
  markerLayer.clearLayers();

  for (const item of filtered) {
    listEl.appendChild(buildVenueListItem(item, { showTypes: true }));

    const poiHint = nearbyPoiHint(item);
    const pin = L.circleMarker([item.lat, item.lng], {
      radius: 5,
      weight: 1,
      color: "#074c37",
      fillColor: item.accepts_minigolf_card ? "#f3b542" : "#0b7c59",
      fillOpacity: 0.86,
    }).bindPopup(
      `<strong>${item.name}</strong><br/>${renderVenueId(item.id)}<br/>${renderCoordinateSource(item)}<br/>${item.postcode || ""} ${item.place || ""}${
        poiHint ? `<br/><span class="poi-note">${poiHint}</span>` : ""
      }<br/><a href="${buildRouteUrl(item)}" target="_blank" rel="noreferrer">Route starten</a>`,
    );
    pin.addTo(markerLayer);
  }
}

function setActiveView(view) {
  currentView = view;
  setSetting("currentView", view).catch(() => {});
  listModeNearbyBtn?.classList.toggle("is-active", view === "nearby");
  listModeAllBtn?.classList.toggle("is-active", view === "all");
  listModeSavedBtn?.classList.toggle("is-active", view === "saved");
  if (panelListEl) panelListEl.dataset.listMode = view;
  renderList();
}

function setUserLocation(lat, lng, shouldFly = true) {
  userLatLng = { lat, lng };
  lastKnownLatLng = { lat, lng };
  if (referenceMode === "auto" || referenceMode === "location") {
    referenceMode = "location";
    setSetting("referenceMode", referenceMode).catch(() => {});
  }
  setSetting("lastLocation", userLatLng).catch(() => {});
  if (shouldFly && map) {
    const locationBounds = L.circle([lat, lng], {
      radius: DEFAULT_FOCUS_RADIUS_KM * 1000,
    }).getBounds();
    map.fitBounds(locationBounds, { padding: [24, 24], maxZoom: 13, animate: true });
  }
  updateLocateButtonState().catch(() => {});
  updateReferenceModeButtons();
  updateMapMetaText();
  renderList();
}

function requestLocation({ shouldFly = true } = {}) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setUserLocation(pos.coords.latitude, pos.coords.longitude, shouldFly);
    },
    () => {
      if (lastKnownLatLng) {
        setUserLocation(lastKnownLatLng.lat, lastKnownLatLng.lng, shouldFly);
      }
    },
    { enableHighAccuracy: true, timeout: 7000, maximumAge: 120000 },
  );
}

function hookEvents() {
  searchEl.addEventListener("input", () => {
    renderList();
  });
  typeEl.addEventListener("change", () => {
    renderList();
  });

  locateBtn.addEventListener("click", () => {
    requestLocation({ shouldFly: true });
  });

  quickToAroundBtn?.addEventListener("click", () => { setActiveView("nearby"); setActiveTab("list"); });
  quickToListBtn?.addEventListener("click", () => { setActiveView("all"); setActiveTab("list"); });
  quickResetViewBtn?.addEventListener("click", () => {
    customPointLatLng = null;
    setSetting("customPoint", null).catch(() => {});
    referenceMode = "auto";
    setSetting("referenceMode", referenceMode).catch(() => {});
    if (map) map.fitWorld({ animate: true });
    updateMapPointLayers();
    updateReferenceModeButtons();
    updateMapMetaText();
    renderList();
  });

  listModeNearbyBtn?.addEventListener("click", () => setActiveView("nearby"));
  listModeAllBtn?.addEventListener("click", () => setActiveView("all"));
  listModeSavedBtn?.addEventListener("click", () => setActiveView("saved"));

  hideVisitedToggle.addEventListener("change", () => {
    hideVisited = hideVisitedToggle.checked;
    setSetting("hideVisited", hideVisited).catch(() => {});
    renderList();
  });

  followMapToggle.addEventListener("change", () => {
    followMapCenter = followMapToggle.checked;
    setSetting("followMapCenter", followMapCenter).catch(() => {});
    updateReferenceModeButtons();
    updateMapMetaText();
    renderList();
  });

  nearbyRadiusEl?.addEventListener("input", () => {
    nearbyRadiusKm = Number(nearbyRadiusEl.value) || DEFAULT_NEARBY_RADIUS_KM;
    updateNearbyRadiusLabel();
    updateMapMetaText();
    renderList();
  });

  nearbyRadiusEl?.addEventListener("change", () => {
    setSetting("nearbyRadiusKm", nearbyRadiusKm).catch(() => {});
  });

  refAutoBtn?.addEventListener("click", () => setReferenceMode("auto"));
  refPointBtn?.addEventListener("click", () => {
    if (!customPointLatLng) return;
    setReferenceMode("point");
  });
  refLocationBtn?.addEventListener("click", () => {
    if (!userLatLng) {
      requestLocation({ shouldFly: true });
      return;
    }
    setReferenceMode("location");
  });
  refMapBtn?.addEventListener("click", () => setReferenceMode("map"));

  pickPointBtn?.addEventListener("click", () => {
    pickPointMode = !pickPointMode;
    pickPointBtn.classList.toggle("is-active", pickPointMode);
    mapFocusMeta.textContent = pickPointMode
      ? "Klick auf die Karte, um einen Suchpunkt zu setzen."
      : mapFocusMeta.textContent;
  });

  clearPointBtn?.addEventListener("click", () => {
    customPointLatLng = null;
    setSetting("customPoint", null).catch(() => {});
    if (referenceMode === "point") {
      referenceMode = "auto";
      setSetting("referenceMode", referenceMode).catch(() => {});
    }
    pickPointMode = false;
    pickPointBtn?.classList.remove("is-active");
    updateMapPointLayers();
    updateReferenceModeButtons();
    updateMapMetaText();
    renderList();
  });

  detailClose.addEventListener("click", () => detailDialog.close());
  updateReloadBtn?.addEventListener("click", () => activatePendingUpdate());
  updateDismissBtn?.addEventListener("click", () => hideUpdateBanner());
}

async function boot() {
  const { bootstrap, markers: markerPayload } = await loadInitialData();
  try {
    favorites = await listFavorites();
  } catch {
    favorites = new Set();
  }
  try {
    visited = await listVisited();
  } catch {
    visited = new Set();
  }

  hideVisited = Boolean(await getSetting("hideVisited").catch(() => false));
  hideVisitedToggle.checked = hideVisited;

  const savedActiveTab = await getSetting("activeTab").catch(() => "map");
  if (["map", "list", "rules", "score"].includes(savedActiveTab)) {
    activeTab = savedActiveTab;
  } else if (savedActiveTab === "around") {
    // Migrated: old "around" tab is now "nearby" mode inside "list"
    activeTab = "list";
    setSetting("activeTab", "list").catch(() => {});
  }

  const lastLocation = await getSetting("lastLocation").catch(() => null);
  if (lastLocation?.lat && lastLocation?.lng) {
    // Do not auto-apply stale location on startup; only use as manual fallback.
    lastKnownLatLng = { lat: lastLocation.lat, lng: lastLocation.lng };
  }

  const savedCustomPoint = await getSetting("customPoint").catch(() => null);
  if (savedCustomPoint?.lat && savedCustomPoint?.lng) {
    customPointLatLng = { lat: savedCustomPoint.lat, lng: savedCustomPoint.lng };
  }

  const savedReferenceMode = await getSetting("referenceMode").catch(() => null);
  if (savedReferenceMode === "auto" || savedReferenceMode === "point" || savedReferenceMode === "location" || savedReferenceMode === "map") {
    referenceMode = savedReferenceMode;
    if (referenceMode === "point" && !refPointBtn) {
      referenceMode = "auto";
      setSetting("referenceMode", referenceMode).catch(() => {});
    }
  }

  const savedRadius = await getSetting("nearbyRadiusKm").catch(() => null);
  if (typeof savedRadius === "number" && savedRadius >= 5 && savedRadius <= 200) {
    nearbyRadiusKm = savedRadius;
  }

  const savedMapView = await getSetting("lastMapView").catch(() => null);
  const savedScoreSession = await getSetting(SCORE_SESSION_KEY).catch(() => null);
  loadScoreSession(savedScoreSession);
  scoreDensityMode = SCORE_DEFAULT_DENSITY;
  scoreAccessibilityPrefs = { ...SCORE_DEFAULT_A11Y };

  if (savedScoreSession && (scorePhase === "play" || scorePhase === "finished") && scoreCompletedTurns() > 0) {
    scoreResumeNoticeVisible = true;
  }

  const savedCurrentView = await getSetting("currentView").catch(() => null);
  if (savedCurrentView === "nearby" || savedCurrentView === "all" || savedCurrentView === "saved") {
    currentView = savedCurrentView;
  }

  followMapCenter = Boolean(await getSetting("followMapCenter").catch(() => false));
  followMapToggle.checked = followMapCenter;

  markers = markerPayload.markers || [];

  if (metaEl) {
    metaEl.textContent = "";
  }
  if (appVersionMetaEl) {
    appVersionMetaEl.textContent = `Version ${APP_VERSION}`;
  }

  initMap(bootstrap.bounds, savedMapView);
  wireTabs();
  hookEvents();
  wireScoreEvents();
  showOnboardingIfNeeded();
  renderScorePanel();
  applyScoreDensityMode();
  applyScoreAccessibilityPrefs();
  setActiveView(currentView);
  setActiveTab(activeTab);
  updateNearbyRadiusLabel();
  updateReferenceModeButtons();
  updateMapMetaText();
  updateLocateButtonState().catch(() => {});
  renderList();

  requestLocation({ shouldFly: false });

  scheduleBackgroundWarmup();
  window.setInterval(() => renderOfflineStatus(), 10000);
}

wireServiceWorkerUpdates();

boot().catch((err) => {
  if (metaEl) {
    metaEl.textContent = "Failed to load dataset";
  }
  console.error(err);
});

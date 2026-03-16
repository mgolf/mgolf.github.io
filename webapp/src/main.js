import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "./styles.css";
import { getVenueDetailsById, loadInitialData, scheduleBackgroundWarmup } from "./data-loader.js";
import {
  buildNextChallenge,
  buildSessionProgress,
  computeDiscoveryProgress,
  evaluatePersonalBest,
  formatStreakLine,
  getAchievementLabel,
  getHoleFeedback,
  getNewAchievementIds,
  updateStreakState,
} from "./gamification-utils.js";
import { buildConnectivityMessage, parseLaunchState, shouldHoldWakeLock, shouldShowInstallBanner } from "./pwa-utils.js";
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
const installBannerEl = document.getElementById("installBanner");
const installBannerTextEl = document.getElementById("installBannerText");
const installBannerConfirmBtn = document.getElementById("installBannerConfirmBtn");
const installBannerDismissBtn = document.getElementById("installBannerDismissBtn");
const connectivityBannerEl = document.getElementById("connectivityBanner");
const connectivityBannerTextEl = document.getElementById("connectivityBannerText");
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
const showOnlyNewNearbyToggle = document.getElementById("showOnlyNewNearbyToggle");
const newNearbyWithinManualRadiusToggle = document.getElementById("newNearbyWithinManualRadiusToggle");
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
const scoreQuickRoundBtnEl = document.getElementById("scoreQuickRoundBtn");
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
const scoreMomentFeedbackEl = document.getElementById("scoreMomentFeedback");
const scoreOfflineStatusEl = document.getElementById("scoreOfflineStatus");
const scoreStreakMetaEl = document.getElementById("scoreStreakMeta");
const scoreSessionProgressEl = document.getElementById("scoreSessionProgress");
const scorePersonalBestMetaEl = document.getElementById("scorePersonalBestMeta");
const scoreNextChallengeEl = document.getElementById("scoreNextChallenge");
const scoreAchievementUnlocksEl = document.getElementById("scoreAchievementUnlocks");
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
const INSTALL_VISITS_KEY = "installBannerVisits";
const INSTALL_DISMISSED_AT_KEY = "installBannerDismissedAt";
const INSTALL_INSTALLED_KEY = "installBannerInstalled";
const SCORE_ACHIEVEMENTS_KEY = "scoreAchievementsV1";
const SCORE_PERSONAL_BESTS_KEY = "scorePersonalBestsV1";
const SCORE_STREAK_STATE_KEY = "scoreStreakStateV1";
const NEW_NEARBY_SEEN_IDS_KEY = "newNearbySeenIdsV1";
const SHOW_ONLY_NEW_NEARBY_KEY = "showOnlyNewNearby";
const NEW_NEARBY_WITHIN_MANUAL_RADIUS_KEY = "newNearbyWithinManualRadius";
const SMART_BANNER_PRIORITY = {
  streak: 1,
  personalBest: 2,
  achievement: 3,
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
let showOnlyNewNearby = false;
let newNearbyWithinManualRadius = true;
let mapCenterLatLng = null;
let customPointLatLng = null;
let followMapCenter = true;
let pickPointMode = false;
let customPointLayer = null;
let mapCenterLayer = null;
let userLocationLayer = null;
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
let deferredInstallPrompt = null;
let installVisitCount = 0;
let installBannerDismissedAt = 0;
let installBannerInstalled = false;
let installBannerMode = "none";
let isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
let connectivityBannerMode = isOnline ? null : "offline";
let connectivityBannerTimer = null;
let wakeLockSentinel = null;
let unlockedAchievementIds = [];
let personalBestByVenue = {};
let scoreMomentFeedback = null;
let scoreMomentFeedbackTimer = null;
let scoreFinishMeta = { personalBestLines: [], achievementIds: [], nextChallenge: "", streakLine: "", progressLine: "" };
let updateBannerMessage = "";
let activeSmartBanner = null;
let smartBannerQueue = [];
let smartBannerTimer = null;
let scoreStreakState = { streakCount: 0, bestStreak: 0, totalRounds: 0, lastRoundDay: "" };
let seenNearbyIds = new Set();
let geolocationWatchId = null;
let geolocationPermissionState = "unknown";

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean)));
}

function isStandaloneMode() {
  return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true);
}

function isLikelyIOS() {
  const ua = String(navigator.userAgent || "");
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && "ontouchend" in document);
}

function isLikelySafari() {
  const ua = String(navigator.userAgent || "");
  return /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/i.test(ua);
}

function shouldShowIosInstallHint() {
  if (!isLikelyIOS() || !isLikelySafari()) return false;
  if (isStandaloneMode() || installBannerInstalled) return false;
  if (installVisitCount < 2) return false;
  if (installBannerDismissedAt && Date.now() - installBannerDismissedAt < 7 * 24 * 60 * 60 * 1000) return false;
  return true;
}

function decodeShareSearchValue(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 220);
}

function extractShareTextCandidate(params) {
  const candidates = [
    params.get("share_url"),
    params.get("share_text"),
    params.get("share_title"),
    params.get("url"),
    params.get("text"),
    params.get("title"),
  ];
  const first = candidates.map(decodeShareSearchValue).find(Boolean);
  return first || "";
}

function handleShareTargetLaunch(search) {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const hasShareMarker = params.get("share_target") === "1" || params.has("share_url") || params.has("share_text") || params.has("share_title");
  if (!hasShareMarker) return;

  const candidate = extractShareTextCandidate(params);
  if (candidate && searchEl) {
    searchEl.value = candidate;
  }
  setActiveView("all");
  setActiveTab("list");
  renderList();

  const isMapLike = /maps\.|google\.com\/maps|openstreetmap|geo:/i.test(candidate);
  showSmartBannerMessage(
    isMapLike
      ? "Geteilter Kartenlink uebernommen. Treffer in der Liste anzeigen."
      : "Geteilter Ort uebernommen. Treffer in der Liste anzeigen.",
    "online",
    3600,
    2,
  );

  ["share_target", "share_url", "share_text", "share_title", "url", "text", "title"].forEach((key) => params.delete(key));
  const nextQuery = params.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
}

function buildOfflineDetailFallback(item) {
  if (!item) {
    return {
      title: "Offline",
      html: "<p>Offline und keine lokalen Details verfuegbar.</p>",
    };
  }
  const types = Array.isArray(item.course_types) && item.course_types.length > 0 ? item.course_types.join(", ") : "-";
  return {
    title: item.name || "Ort",
    html: `
      <p><strong>Offline-Modus:</strong> Zeige lokale Basisdaten.</p>
      <p><strong>ID:</strong> <span class="venue-id">${item.id || "-"}</span></p>
      <p><strong>Lat/Lng:</strong> ${item.lat ?? "-"}, ${item.lng ?? "-"}</p>
      <p><strong>Adresse:</strong> ${item.postcode || ""} ${item.place || ""}</p>
      <p><strong>Bahnarten:</strong> ${types}</p>
      <p><strong>Hinweis:</strong> Volle Details und Route starten wieder bei Verbindung.</p>
    `,
  };
}

function normalizeAchievementIds(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean)));
}

function normalizePersonalBestMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [venueKey, venueMap] of Object.entries(value)) {
    if (!venueMap || typeof venueMap !== "object" || Array.isArray(venueMap)) continue;
    const normalizedVenueKey = String(venueKey || "").trim();
    if (!normalizedVenueKey) continue;
    out[normalizedVenueKey] = {};
    for (const [playerKey, best] of Object.entries(venueMap)) {
      const safeBest = Number(best);
      if (!Number.isFinite(safeBest)) continue;
      out[normalizedVenueKey][String(playerKey || "").trim().toLowerCase()] = safeBest;
    }
  }
  return out;
}

function normalizeScoreFinishMeta(value) {
  if (!value || typeof value !== "object") {
    return { personalBestLines: [], achievementIds: [], nextChallenge: "", streakLine: "", progressLine: "" };
  }
  return {
    personalBestLines: Array.isArray(value.personalBestLines)
      ? value.personalBestLines.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [],
    achievementIds: normalizeAchievementIds(value.achievementIds),
    nextChallenge: String(value.nextChallenge || "").trim(),
    streakLine: String(value.streakLine || "").trim(),
    progressLine: String(value.progressLine || "").trim(),
  };
}

function normalizeStreakState(value) {
  if (!value || typeof value !== "object") {
    return { streakCount: 0, bestStreak: 0, totalRounds: 0, lastRoundDay: "" };
  }
  return {
    streakCount: Number.isFinite(Number(value.streakCount)) ? Number(value.streakCount) : 0,
    bestStreak: Number.isFinite(Number(value.bestStreak)) ? Number(value.bestStreak) : 0,
    totalRounds: Number.isFinite(Number(value.totalRounds)) ? Number(value.totalRounds) : 0,
    lastRoundDay: String(value.lastRoundDay || "").trim(),
  };
}

function buildVenueKey(value) {
  return String(value || "Freie Runde")
    .trim()
    .toLowerCase();
}

function renderTopBanners() {
  const installPromptVisible = shouldShowInstallBanner({
    visits: installVisitCount,
    isStandalone: isStandaloneMode(),
    hasDeferredPrompt: Boolean(deferredInstallPrompt),
    dismissedAt: installBannerDismissedAt,
    isInstalled: installBannerInstalled,
  });
  const installIosVisible = shouldShowIosInstallHint();
  installBannerMode = installPromptVisible ? "prompt" : installIosVisible ? "ios" : "none";
  const connectivityMessage = connectivityBannerMode
    ? buildConnectivityMessage({ isOnline: connectivityBannerMode === "online", activeTab })
    : null;

  updateBannerEl?.classList.add("is-hidden");
  installBannerEl?.classList.add("is-hidden");
  connectivityBannerEl?.classList.add("is-hidden");

  if (updateBannerMessage) {
    if (updateBannerTextEl) updateBannerTextEl.textContent = updateBannerMessage;
    updateBannerEl?.classList.remove("is-hidden");
    return;
  }

  if (activeSmartBanner) {
    if (connectivityBannerTextEl) connectivityBannerTextEl.textContent = activeSmartBanner.text;
    connectivityBannerEl?.classList.remove("is-hidden");
    connectivityBannerEl?.classList.toggle("is-offline", activeSmartBanner.tone === "offline");
    connectivityBannerEl?.classList.toggle("is-online", activeSmartBanner.tone !== "offline");
    return;
  }

  if (installBannerMode !== "none") {
    if (installBannerTextEl) {
      installBannerTextEl.textContent =
        installBannerMode === "ios"
          ? "iPhone/iPad: In Safari auf Teilen tippen und 'Zum Home-Bildschirm' waehlen."
          : "Als App installieren fuer schnelleren Start, bessere Offline-Nutzung und Homescreen-Zugriff.";
    }
    if (installBannerConfirmBtn) {
      installBannerConfirmBtn.textContent = installBannerMode === "ios" ? "Anleitung" : "Als App installieren";
    }
    installBannerEl?.classList.remove("is-hidden");
    return;
  }

  if (connectivityMessage) {
    if (connectivityBannerTextEl) connectivityBannerTextEl.textContent = connectivityMessage.text;
    connectivityBannerEl?.classList.remove("is-hidden");
    connectivityBannerEl?.classList.toggle("is-offline", connectivityMessage.tone === "offline");
    connectivityBannerEl?.classList.toggle("is-online", connectivityMessage.tone === "online");
  }
}

function showSmartBannerMessage(text, tone = "online", duration = 3600, priority = 1) {
  const safeText = String(text || "").trim();
  if (!safeText) return;

  const duplicateInQueue = smartBannerQueue.some((item) => item.text === safeText && item.tone === tone);
  const duplicateActive = activeSmartBanner?.text === safeText && activeSmartBanner?.tone === tone;
  if (duplicateInQueue || duplicateActive) return;

  smartBannerQueue.push({
    text: safeText,
    tone,
    duration: Math.max(1200, Number(duration) || 3600),
    priority: Number(priority) || 1,
    createdAt: Date.now(),
  });

  smartBannerQueue.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.createdAt - b.createdAt;
  });

  if (!activeSmartBanner) {
    activeSmartBanner = smartBannerQueue.shift() || null;
    renderTopBanners();
    scheduleSmartBannerTimeout();
  }
}

function scheduleSmartBannerTimeout() {
  if (smartBannerTimer) {
    window.clearTimeout(smartBannerTimer);
    smartBannerTimer = null;
  }
  if (!activeSmartBanner) return;
  smartBannerTimer = window.setTimeout(() => {
    smartBannerTimer = null;
    activeSmartBanner = smartBannerQueue.shift() || null;
    renderTopBanners();
    scheduleSmartBannerTimeout();
  }, activeSmartBanner.duration);
}

function markNearbySeen(itemId) {
  if (!itemId) return;
  seenNearbyIds.add(itemId);
  setSetting(NEW_NEARBY_SEEN_IDS_KEY, Array.from(seenNearbyIds)).catch(() => {});
}

function renderInstallBanner() {
  renderTopBanners();
}

function renderConnectivityBanner() {
  renderTopBanners();
}

function setConnectivityState(nextOnline) {
  isOnline = nextOnline;
  connectivityBannerMode = nextOnline ? "online" : "offline";
  if (connectivityBannerTimer) {
    window.clearTimeout(connectivityBannerTimer);
    connectivityBannerTimer = null;
  }
  renderConnectivityBanner();
  if (nextOnline) {
    connectivityBannerTimer = window.setTimeout(() => {
      connectivityBannerMode = null;
      renderConnectivityBanner();
    }, 4000);
  }
}

async function updateWakeLockState() {
  const shouldLock = shouldHoldWakeLock({
    activeTab,
    scorePhase,
    visibilityState: document.visibilityState,
    hasWakeLockApi: Boolean(navigator.wakeLock?.request),
  });

  if (!shouldLock) {
    if (wakeLockSentinel) {
      try {
        await wakeLockSentinel.release();
      } catch {
        // Ignore release race conditions.
      }
      wakeLockSentinel = null;
    }
    return;
  }

  if (wakeLockSentinel) return;

  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    wakeLockSentinel.addEventListener("release", () => {
      wakeLockSentinel = null;
    });
  } catch {
    wakeLockSentinel = null;
  }
}

function wireInstallPromptHandling() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    renderInstallBanner();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installBannerInstalled = true;
    setSetting(INSTALL_INSTALLED_KEY, true).catch(() => {});
    renderInstallBanner();
  });
}

async function updateLocateButtonState() {
  if (!locateBtn) return;

  let permissionGranted = false;
  geolocationPermissionState = "unknown";
  try {
    if (navigator.permissions?.query) {
      const result = await navigator.permissions.query({ name: "geolocation" });
      permissionGranted = result.state === "granted";
      geolocationPermissionState = result.state;
      result.onchange = () => {
        updateLocateButtonState().catch(() => {});
      };
    }
  } catch {
    permissionGranted = false;
    geolocationPermissionState = "unknown";
  }

  const hasLiveLocation = Boolean(userLatLng?.lat && userLatLng?.lng);
  locateBtn.classList.toggle("is-active", permissionGranted || hasLiveLocation);
  locateBtn.classList.toggle("is-blocked", geolocationPermissionState === "denied");
  const label = locateBtn.querySelector(".label");
  if (label) {
    if (geolocationPermissionState === "denied") {
      label.textContent = "Standort blockiert";
    } else {
      label.textContent = hasLiveLocation ? "Standort aktiv" : "Standort aktivieren";
    }
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
  updateBannerMessage = message;
  renderTopBanners();
}

function hideUpdateBanner() {
  updateBannerMessage = "";
  renderTopBanners();
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
  // In auto mode, map center can be the primary reference when follow-map is enabled.
  if (followMapCenter && mapCenterLatLng) return { ...mapCenterLatLng, source: "map" };
  if (userLatLng) return { ...userLatLng, source: "location" };
  if (mapCenterLatLng) return { ...mapCenterLatLng, source: "map" };
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
  if (source === "map") return "Kartenmitte";
  return "Standort";
}

function updateMapMetaText() {
  const ref = getActiveReferencePoint();
  if (!ref) {
    mapFocusMeta.textContent = "Keine aktive Referenz. Nutze Standort oder Kartenmitte.";
    return;
  }
  mapFocusMeta.textContent = `Aktive Referenz: ${describeReferenceSource(ref.source)} • Radius ${nearbyRadiusKm} km`;
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
  if (userLocationLayer) {
    map.removeLayer(userLocationLayer);
    userLocationLayer = null;
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

  if (userLatLng) {
    userLocationLayer = L.circle([userLatLng.lat, userLatLng.lng], {
      radius: 30,
      color: "#1f4fff",
      weight: 2,
      fillColor: "#3f6cff",
      fillOpacity: 0.25,
    })
      .bindPopup("Dein Standort")
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
  renderConnectivityBanner();
  updateWakeLockState().catch(() => {});
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

function renderScoreMomentFeedback() {
  if (!scoreMomentFeedbackEl) return;
  const isVisible = scorePhase === "play" && scoreMomentFeedback;
  scoreMomentFeedbackEl.classList.toggle("is-hidden", !isVisible);
  if (!isVisible) {
    scoreMomentFeedbackEl.textContent = "";
    scoreMomentFeedbackEl.className = "score-moment-feedback is-hidden";
    return;
  }
  scoreMomentFeedbackEl.textContent = scoreMomentFeedback.label;
  scoreMomentFeedbackEl.className = `score-moment-feedback tone-${scoreMomentFeedback.tone || "neutral"}`;
}

function flashScoreMomentFeedback(feedback) {
  scoreMomentFeedback = feedback;
  renderScoreMomentFeedback();
  if (scoreMomentFeedbackTimer) {
    window.clearTimeout(scoreMomentFeedbackTimer);
  }
  scoreMomentFeedbackTimer = window.setTimeout(() => {
    scoreMomentFeedback = null;
    scoreMomentFeedbackTimer = null;
    renderScoreMomentFeedback();
  }, 2400);
}

function unlockAchievementProgress(progress, { announce = true } = {}) {
  const gained = getNewAchievementIds({
    unlockedIds: unlockedAchievementIds,
    favoritesCount: favorites.size,
    visitedCount: visited.size,
    ...progress,
  });

  if (gained.length === 0) return [];

  unlockedAchievementIds = normalizeAchievementIds([...unlockedAchievementIds, ...gained]);
  setSetting(SCORE_ACHIEVEMENTS_KEY, unlockedAchievementIds).catch(() => {});

  if (announce) {
    const lead = getAchievementLabel(gained[0]);
    const suffix = gained.length > 1 ? ` +${gained.length - 1} weitere` : "";
    showSmartBannerMessage(`Freigeschaltet: ${lead}${suffix}`, "online", 3600, SMART_BANNER_PRIORITY.achievement);
  }

  return gained;
}

function summarizeRoundStats() {
  const parSum = scoreTotal(scorePar);
  let birdieCount = 0;
  let bogeyFreeCount = 0;

  for (let holeIndex = 0; holeIndex < SCORE_HOLES; holeIndex += 1) {
    for (const player of scorePlayers) {
      const stroke = player.scores[holeIndex];
      if (stroke === null || stroke === undefined) continue;
      const delta = Number(stroke) - Number(scorePar[holeIndex] || 2);
      if (delta < 0 || Number(stroke) === 1) birdieCount += 1;
      if (delta <= 0) bogeyFreeCount += 1;
    }
  }

  return {
    parSum,
    skippedCount: Object.keys(scoreSkips).length,
    birdieCount,
    bogeyFreeCount,
  };
}

function finalizeFinishedRound() {
  const venueLabel = inferVenueFromContext() || "Freie Runde";
  const venueKey = buildVenueKey(venueLabel);
  const nextPersonalBestMap = {
    ...personalBestByVenue,
    [venueKey]: { ...(personalBestByVenue[venueKey] || {}) },
  };
  const personalBestLines = [];

  for (const player of scorePlayers) {
    const total = scoreTotal(player.scores);
    const playerKey = String(player.name || "").trim().toLowerCase();
    const previousBest = nextPersonalBestMap[venueKey][playerKey] ?? null;
    const result = evaluatePersonalBest({ previousBest, total });
    nextPersonalBestMap[venueKey][playerKey] = result.best;
    if (result.improved) {
      personalBestLines.push(
        result.isFirst
          ? `${player.name}: erster Bestwert mit ${result.best}`
          : `${player.name}: neuer Bestwert ${result.best}`,
      );
    }
  }

  personalBestByVenue = nextPersonalBestMap;
  setSetting(SCORE_PERSONAL_BESTS_KEY, personalBestByVenue).catch(() => {});

  const streakUpdate = updateStreakState({ state: scoreStreakState, now: Date.now() });
  scoreStreakState = streakUpdate.nextState;
  setSetting(SCORE_STREAK_STATE_KEY, scoreStreakState).catch(() => {});
  const streakLine = formatStreakLine({
    streakCount: scoreStreakState.streakCount,
    bestStreak: scoreStreakState.bestStreak,
    event: streakUpdate.event,
  });
  const progressLine = buildSessionProgress({
    totalRounds: scoreStreakState.totalRounds,
    bestStreak: scoreStreakState.bestStreak,
  });

  const stats = summarizeRoundStats();
  const bestTotal = Math.min(...scorePlayers.map((player) => scoreTotal(player.scores)));
  const achievementIds = unlockAchievementProgress({ justFinishedRound: true }, { announce: false });

  scoreFinishMeta = {
    personalBestLines,
    achievementIds,
    nextChallenge: buildNextChallenge({
      parSum: stats.parSum,
      total: bestTotal,
      skippedCount: stats.skippedCount,
      birdieCount: stats.birdieCount,
      bogeyFreeCount: stats.bogeyFreeCount,
    }),
    streakLine,
    progressLine,
  };

  if (achievementIds.length > 0) {
    showSmartBannerMessage(
      `Freigeschaltet: ${getAchievementLabel(achievementIds[0])}`,
      "online",
      3600,
      SMART_BANNER_PRIORITY.achievement,
    );
  } else if (personalBestLines.length > 0) {
    showSmartBannerMessage(personalBestLines[0], "online", 3200, SMART_BANNER_PRIORITY.personalBest);
  } else {
    showSmartBannerMessage(streakLine, "online", 2800, SMART_BANNER_PRIORITY.streak);
  }
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
    finishMeta: scoreFinishMeta,
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

  scoreFinishMeta = normalizeScoreFinishMeta(session.finishMeta);
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
  scoreFinishMeta = { personalBestLines: [], achievementIds: [], nextChallenge: "", streakLine: "", progressLine: "" };
  scoreMomentFeedback = null;
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

  if (scorePersonalBestMetaEl) {
    const personalBestText = scoreFinishMeta.personalBestLines.join(" • ");
    scorePersonalBestMetaEl.textContent = personalBestText;
    scorePersonalBestMetaEl.classList.toggle("is-hidden", !personalBestText);
  }

  if (scoreStreakMetaEl) {
    scoreStreakMetaEl.textContent = scoreFinishMeta.streakLine || "";
    scoreStreakMetaEl.classList.toggle("is-hidden", !scoreFinishMeta.streakLine);
  }

  if (scoreSessionProgressEl) {
    const fallback = buildSessionProgress({
      totalRounds: scoreStreakState.totalRounds,
      bestStreak: scoreStreakState.bestStreak,
    });
    scoreSessionProgressEl.textContent = scoreFinishMeta.progressLine || fallback;
  }

  if (scoreNextChallengeEl) {
    scoreNextChallengeEl.textContent = scoreFinishMeta.nextChallenge || buildNextChallenge(summarizeRoundStats());
  }

  if (scoreAchievementUnlocksEl) {
    scoreAchievementUnlocksEl.innerHTML = scoreFinishMeta.achievementIds
      .map((achievementId) => `<li>${getAchievementLabel(achievementId)}</li>`)
      .join("");
    scoreAchievementUnlocksEl.classList.toggle("is-hidden", scoreFinishMeta.achievementIds.length === 0);
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
    finalizeFinishedRound();
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
  renderScoreMomentFeedback();

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

  if (scoreQuickRoundBtnEl) {
    scoreQuickRoundBtnEl.classList.toggle("is-hidden", scorePhase !== "setup");
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
  updateWakeLockState().catch(() => {});
}

function wireScoreEvents() {
  const startQuickRound = (playerCount = 2) => {
    scorePlayers = Array.from({ length: playerCount }, (_, index) => createScorePlayer(`Spieler ${index + 1}`, index + 1));
    scorePar = scorePar.map((value) => clampStroke(value));
    scorePlayers = scorePlayers.map((player) => ({
      ...player,
      scores: Array(SCORE_HOLES).fill(null),
    }));
    scorePhase = "play";
    scoreTurn = { holeIndex: 0, playerIndex: 0 };
    scoreHistory = [];
    scoreSkips = {};
    scoreTiebreaker = {};
    scoreFinishMeta = { personalBestLines: [], achievementIds: [], nextChallenge: "", streakLine: "", progressLine: "" };
    scoreResumeNoticeVisible = false;
    if (!scoreVenueName && scoreVenueNameEl) {
      const inferredVenue = inferVenueFromContext();
      if (inferredVenue) {
        scoreVenueName = inferredVenue;
        scoreVenueNameEl.value = inferredVenue;
      }
    }
    persistScoreSession();
    renderScorePanel();
    scoreStrokeInputEl?.focus();
  };

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

  scoreQuickRoundBtnEl?.addEventListener("click", () => {
    if (scorePhase !== "setup") return;
    startQuickRound(2);
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
    scoreSkips = {};
    scoreFinishMeta = { personalBestLines: [], achievementIds: [], nextChallenge: "", streakLine: "", progressLine: "" };
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
    flashScoreMomentFeedback(getHoleFeedback({ stroke, par: scorePar[holeIndex] || 2 }));
    unlockAchievementProgress({ bogeyFreeHole: stroke <= (scorePar[holeIndex] || 2) });

    const isLastPlayerInHole = playerIndex === scorePlayers.length - 1;
    if (isLastPlayerInHole) {
      if (holeIndex === SCORE_HOLES - 1) {
        scorePhase = "finished";
        finalizeFinishedRound();
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
  map = L.map("map", { zoomControl: true, minZoom: 4, closePopupOnClick: false }).setView([51.1634, 10.4477], 6);

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

function renderCoordinateSource(item) {
  const label = item?.coordinate_source_label || item?.coordinates?.source?.label;
  const raw = item?.coordinate_source_raw || item?.source?.coordinate_source?.raw_geocode_source;
  if (!label && !raw) return "";
  return `<span class="coord-source">Koordinaten: ${label || raw}${label && raw && label !== raw ? ` <span class="coord-source-raw">(${raw})</span>` : ""}</span>`;
}

function getOpeningHoursText(itemOrVenue) {
  const raw =
    itemOrVenue?.opening_hours_text ||
    itemOrVenue?.google?.opening_hours_text ||
    itemOrVenue?.opening_hours?.text ||
    null;
  const text = String(raw || "").trim();
  return text || null;
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
  if (!navigator.onLine) {
    const fallbackText = `${item?.name || "Ort"}: ${item?.lat ?? ""},${item?.lng ?? ""}`;
    navigator.clipboard?.writeText(fallbackText).catch(() => {});
    showSmartBannerMessage(
      "Offline: Route kann nicht gestartet werden. Koordinaten wurden in die Zwischenablage kopiert.",
      "offline",
      4600,
      2,
    );
    return;
  }
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
      <span class="label">${compact ? "Merken" : favLabel}</span>
    </button>
    <button type="button" class="${visitClass}" data-action="visited" data-id="${item.id}" title="${visitLabel}" aria-label="${visitLabel}">
      <i class="fa-solid fa-check-circle" aria-hidden="true"></i>
      <span class="label">${compact ? "Besucht" : visitLabel}</span>
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

function isNewNearbyCandidate(item, radiusLimitKm = nearbyRadiusKm) {
  if (!item?.id) return false;
  if (seenNearbyIds.has(item.id) || favorites.has(item.id) || visited.has(item.id)) return false;
  if (!Number.isFinite(item._distanceKm)) return false;
  return item._distanceKm <= radiusLimitKm;
}

function buildVenueListItem(item, { showRating = false, showTypes = false } = {}) {
  const li = document.createElement("li");
  li.className = "venue-item";
  const distance = typeof item._distanceKm === "number" ? `${item._distanceKm.toFixed(1)} km` : null;
  const rating = showRating && typeof item.rating === "number" ? `★ ${item.rating.toFixed(1)}` : null;
  const types = showTypes ? (item.course_types || []).map((t) => `<span class="chip">${t}</span>`).join(" ") : "";
  const visitedBadge = visited.has(item.id) ? "<span class='visited-badge'>besucht</span>" : "";
  const newNearbyBadge = item._isNewNearby ? "<span class='new-nearby-badge'>Neu in deiner Naehe</span>" : "";
  const poiHint = nearbyPoiHint(item);
  const openingHoursText = getOpeningHoursText(item);
  const distLine = [distance, rating].filter(Boolean).join(" • ");

  li.innerHTML = `
    <h3>${item.name}${visitedBadge}${newNearbyBadge}</h3>
    <div class="venue-meta venue-tags">${renderCoordinateSource(item)}</div>
    ${distLine ? `<div class="venue-meta">${distLine}</div>` : ""}
    <div class="venue-meta">${item.postcode || ""} ${item.place || ""}</div>
    ${openingHoursText ? `<div class="venue-meta">Oeffnungszeiten: ${openingHoursText}</div>` : ""}
    ${types ? `<div class="venue-meta">${types || "<span class='chip'>unbekannt</span>"}</div>` : ""}
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
    let markedNearby = false;
    if (action === "detail" || action === "fly" || action === "route") {
      if (item._isNewNearby) {
        markNearbySeen(item.id);
        markedNearby = true;
      }
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
          markNearbySeen(itemId);
          unlockAchievementProgress({ favoritesCount: favorites.size });
          renderList();
        })
        .catch(() => {});
    }
    if (action === "visited" && itemId) {
      toggleVisited(itemId)
        .then((isVis) => {
          if (isVis) visited.add(itemId);
          else visited.delete(itemId);
          markNearbySeen(itemId);
          unlockAchievementProgress({ visitedCount: visited.size });
          renderList();
        })
        .catch(() => {});
    }
    if (markedNearby && action !== "favorite" && action !== "visited") {
      renderList();
    }
  });

  return li;
}

async function showDetails(venueId) {
  detailTitle.textContent = "Lade Details...";
  detailContent.textContent = "";
  detailDialog.showModal();

  let venue = null;
  try {
    venue = await getVenueDetailsById(venueId);
  } catch {
    venue = null;
  }

  if (!venue) {
    const fallbackMarker = markerById(venueId);
    if (!navigator.onLine || fallbackMarker) {
      const fallback = buildOfflineDetailFallback(fallbackMarker);
      detailTitle.textContent = fallback.title;
      detailContent.innerHTML = fallback.html;
      return;
    }
    detailTitle.textContent = "Keine Details verfuegbar";
    detailContent.textContent = "Fuer diesen Ort sind noch keine vollstaendigen Details vorhanden.";
    return;
  }

  detailTitle.textContent = venue.name || "Ort";

  const line1 = [venue.address?.street_name, venue.address?.house_number].filter(Boolean).join(" ");
  const line2 = [venue.address?.postcode, venue.address?.place].filter(Boolean).join(" ");
  const rating = venue.google?.rating ? `${venue.google.rating} (${venue.google.rating_count || 0})` : "-";
  const openingHoursText = getOpeningHoursText(venue);
  const marker = markerById(venueId);
  const progress = computeDiscoveryProgress({
    markers,
    favorites,
    visited,
    place: marker?.place || venue.address?.place || "",
  });
  const progressText =
    progress.total > 0
      ? `${progress.visited}/${progress.total} besucht, ${progress.saved}/${progress.total} gespeichert in ${progress.place}`
      : "";

  detailContent.innerHTML = `
    <p><strong>Koordinatenquelle:</strong> ${venue.source?.coordinate_source?.label || venue.source?.coordinate_source?.raw_geocode_source || "-"}</p>
    <p><strong>Lat/Lng:</strong> ${venue.coordinates?.lat ?? "-"}, ${venue.coordinates?.lng ?? "-"}</p>
    <p><strong>Adresse:</strong> ${line1 || "-"}, ${line2 || "-"}</p>
    ${openingHoursText ? `<p><strong>Oeffnungszeiten:</strong> ${openingHoursText}</p>` : ""}
    <p><strong>Bahnarten:</strong> ${(venue.classification?.course_types || []).join(", ") || "-"}</p>
    <p><strong>Rating:</strong> ${rating}</p>
    ${progressText ? `<p><strong>Entdeckungsfortschritt:</strong> ${progressText}</p>` : ""}
    <p><strong>Minigolf-Card:</strong> ${venue.classification?.accepts_minigolf_card ? "Ja" : "Nein"}</p>
    <p><strong>Webseite:</strong> ${
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
    markerLayer.clearLayers();
    if (!reference) {
      if (aroundMeMetaEl) {
        aroundMeMetaEl.textContent = "Keine Referenz aktiv. Tippe auf Standort oder waehle Auto/Standort/Karte.";
      }
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

    const newRadiusLimitKm = newNearbyWithinManualRadius ? nearbyRadiusKm : effectiveRadiusKm;

    let enriched = chosen.map((item) => ({
      ...item,
      _isNewNearby: isNewNearbyCandidate(item, newRadiusLimitKm),
    }));

    if (showOnlyNewNearby) {
      enriched = enriched.filter((item) => item._isNewNearby);
    }

    const visibleSavedCount = enriched.filter((item) => favorites.has(item.id)).length;
    const visibleVisitedCount = enriched.filter((item) => visited.has(item.id)).length;
    const visibleNewCount = enriched.filter((item) => item._isNewNearby).length;

    if (aroundMeMetaEl) {
      const sourceLabel = describeReferenceSource(reference.source);
      const radiusLabel =
        effectiveRadiusKm > nearbyRadiusKm
          ? `${nearbyRadiusKm.toFixed(0)} km (auto bis ${effectiveRadiusKm.toFixed(1)} km erweitert)`
          : `${effectiveRadiusKm.toFixed(1)} km`;
      aroundMeMetaEl.textContent = `Bezug: ${sourceLabel} • Radius: ${radiusLabel} • Orte: ${enriched.length} (neu ${visibleNewCount}, gespeichert ${visibleSavedCount}, besucht ${visibleVisitedCount})`;
    }

    for (const item of enriched) {
      listEl.appendChild(buildVenueListItem(item, { showRating: true }));

      const poiHint = nearbyPoiHint(item);
      const openingHoursText = getOpeningHoursText(item);
      const pin = L.circleMarker([item.lat, item.lng], {
        radius: 5,
        weight: 1,
        color: "#074c37",
        fillColor: item.accepts_minigolf_card ? "#f3b542" : "#0b7c59",
        fillOpacity: 0.86,
      }).bindPopup(
        `<strong>${item.name}</strong><br/>${renderCoordinateSource(item)}<br/>${item.postcode || ""} ${item.place || ""}${
          openingHoursText ? `<br/><strong>Oeffnungszeiten:</strong> ${openingHoursText}` : ""
        }${
          item._isNewNearby ? `<br/><span class="new-nearby-badge">Neu in deiner Naehe</span>` : ""
        }${
          poiHint ? `<br/><span class="poi-note">${poiHint}</span>` : ""
        }<br/><a href="${buildRouteUrl(item)}" target="_blank" rel="noreferrer">Route starten</a>`,
        { autoClose: false, closeOnClick: false, keepInView: true, autoPan: false },
      );
      pin.addTo(markerLayer);
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
    .slice(0, 250)
    .map((item) => ({ ...item, _isNewNearby: isNewNearbyCandidate(item) }));

  listEl.innerHTML = "";
  markerLayer.clearLayers();

  for (const item of filtered) {
    listEl.appendChild(buildVenueListItem(item, { showTypes: true }));

    const poiHint = nearbyPoiHint(item);
    const openingHoursText = getOpeningHoursText(item);
    const pin = L.circleMarker([item.lat, item.lng], {
      radius: 5,
      weight: 1,
      color: "#074c37",
      fillColor: item.accepts_minigolf_card ? "#f3b542" : "#0b7c59",
      fillOpacity: 0.86,
    }).bindPopup(
      `<strong>${item.name}</strong><br/>${renderCoordinateSource(item)}<br/>${item.postcode || ""} ${item.place || ""}${
        openingHoursText ? `<br/><strong>Oeffnungszeiten:</strong> ${openingHoursText}` : ""
      }${
        item._isNewNearby ? `<br/><span class="new-nearby-badge">Neu in deiner Naehe</span>` : ""
      }${
        poiHint ? `<br/><span class="poi-note">${poiHint}</span>` : ""
      }<br/><a href="${buildRouteUrl(item)}" target="_blank" rel="noreferrer">Route starten</a>`,
      { autoClose: false, closeOnClick: false, keepInView: true, autoPan: false },
    );
    pin.addTo(markerLayer);
  }
}

function setActiveView(view) {
  currentView = view;
  setSetting("currentView", view).catch(() => {});

  // Nearby mode should primarily use the current user location when available.
  if (view === "nearby") {
    if (userLatLng && referenceMode !== "point") {
      referenceMode = "location";
      setSetting("referenceMode", referenceMode).catch(() => {});
      updateReferenceModeButtons();
      updateMapMetaText();
    } else if (!userLatLng && geolocationPermissionState !== "denied") {
      requestLocation({ shouldFly: false, showSuccessBanner: false, showErrorBanner: false });
    }
  }

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
  updateMapPointLayers();
  updateLocateButtonState().catch(() => {});
  updateReferenceModeButtons();
  updateMapMetaText();
  renderList();
}

function geolocationErrorMessage(error) {
  const code = Number(error?.code);
  if (code === 1) {
    return "Standortzugriff verweigert. Bitte Berechtigung im Browser erlauben.";
  }
  if (code === 2) {
    return "Standort aktuell nicht verfuegbar. Bitte GPS oder WLAN pruefen.";
  }
  if (code === 3) {
    return "Standortabfrage dauerte zu lange. Bitte erneut versuchen.";
  }
  return "Standort konnte nicht ermittelt werden.";
}

function geolocationPermissionHelpText() {
  if (isLikelyIOS()) {
    return "Standort ist blockiert. In iOS Safari: aA -> Website-Einstellungen -> Standort -> Erlauben.";
  }
  return "Standort ist blockiert. Bitte im Browser bei dieser Seite Standort auf 'Zulassen' stellen und erneut tippen.";
}

function stopLocationWatch() {
  if (geolocationWatchId == null || !navigator.geolocation?.clearWatch) return;
  navigator.geolocation.clearWatch(geolocationWatchId);
  geolocationWatchId = null;
}

function ensureLocationWatch() {
  if (!navigator.geolocation?.watchPosition || geolocationWatchId != null) return;
  geolocationWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      setUserLocation(pos.coords.latitude, pos.coords.longitude, false);
    },
    () => {
      // Silent fallback: explicit requestLocation handles user-facing feedback.
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
  );
}

function requestLocation({ shouldFly = true, showSuccessBanner = true, showErrorBanner = true } = {}) {
  if (!navigator.geolocation) {
    if (showErrorBanner) {
      showSmartBannerMessage("Dieses Geraet unterstuetzt keine Standortabfrage.", "offline", 4200, 2);
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setUserLocation(pos.coords.latitude, pos.coords.longitude, shouldFly);
      ensureLocationWatch();
      if (showSuccessBanner) {
        showSmartBannerMessage("Standort aktualisiert.", "online", 2200, 1);
      }
    },
    (error) => {
      if (showErrorBanner) {
        showSmartBannerMessage(geolocationErrorMessage(error), "offline", 4600, 2);
      }
      if (lastKnownLatLng && Number(error?.code) !== 1) {
        setUserLocation(lastKnownLatLng.lat, lastKnownLatLng.lng, shouldFly);
      }
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
}

async function maybeRefreshLocationSilently() {
  if (!navigator.geolocation) return;

  let shouldRequest = true;
  try {
    if (navigator.permissions?.query) {
      const result = await navigator.permissions.query({ name: "geolocation" });
      shouldRequest = result.state === "granted";
    }
  } catch {
    // If permission state cannot be queried, keep default behavior.
  }

  if (!shouldRequest) {
    updateLocateButtonState().catch(() => {});
    return;
  }

  requestLocation({ shouldFly: false, showSuccessBanner: false, showErrorBanner: false });
}

function hookEvents() {
  searchEl.addEventListener("input", () => {
    renderList();
  });
  typeEl.addEventListener("change", () => {
    renderList();
  });

  locateBtn.addEventListener("click", () => {
    if (geolocationPermissionState === "denied") {
      showSmartBannerMessage(geolocationPermissionHelpText(), "offline", 5200, 3);
      return;
    }
    setActiveView("nearby");
    setActiveTab("list");
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

  showOnlyNewNearbyToggle?.addEventListener("change", () => {
    showOnlyNewNearby = Boolean(showOnlyNewNearbyToggle.checked);
    setSetting(SHOW_ONLY_NEW_NEARBY_KEY, showOnlyNewNearby).catch(() => {});
    renderList();
  });

  newNearbyWithinManualRadiusToggle?.addEventListener("change", () => {
    newNearbyWithinManualRadius = Boolean(newNearbyWithinManualRadiusToggle.checked);
    setSetting(NEW_NEARBY_WITHIN_MANUAL_RADIUS_KEY, newNearbyWithinManualRadius).catch(() => {});
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
  installBannerDismissBtn?.addEventListener("click", () => {
    installBannerDismissedAt = Date.now();
    setSetting(INSTALL_DISMISSED_AT_KEY, installBannerDismissedAt).catch(() => {});
    renderInstallBanner();
  });
  installBannerConfirmBtn?.addEventListener("click", async () => {
    if (installBannerMode === "ios") {
      showSmartBannerMessage("In Safari: Teilen -> Zum Home-Bildschirm", "online", 4200, 2);
      return;
    }
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    try {
      const result = await deferredInstallPrompt.userChoice;
      if (result?.outcome === "accepted") {
        installBannerInstalled = true;
        setSetting(INSTALL_INSTALLED_KEY, true).catch(() => {});
      }
    } catch {
      // Ignore prompt errors.
    }
    deferredInstallPrompt = null;
    renderInstallBanner();
  });
  window.addEventListener("online", () => setConnectivityState(true));
  window.addEventListener("offline", () => setConnectivityState(false));
  window.addEventListener("beforeunload", () => {
    stopLocationWatch();
  });
  document.addEventListener("visibilitychange", () => {
    updateWakeLockState().catch(() => {});
  });
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
  showOnlyNewNearby = Boolean(await getSetting(SHOW_ONLY_NEW_NEARBY_KEY).catch(() => false));
  if (showOnlyNewNearbyToggle) showOnlyNewNearbyToggle.checked = showOnlyNewNearby;
  newNearbyWithinManualRadius = Boolean(await getSetting(NEW_NEARBY_WITHIN_MANUAL_RADIUS_KEY).catch(() => true));
  if (newNearbyWithinManualRadiusToggle) {
    newNearbyWithinManualRadiusToggle.checked = newNearbyWithinManualRadius;
  }
  seenNearbyIds = new Set(normalizeStringList(await getSetting(NEW_NEARBY_SEEN_IDS_KEY).catch(() => [])));

  installVisitCount = Number(await getSetting(INSTALL_VISITS_KEY).catch(() => 0)) || 0;
  installBannerDismissedAt = Number(await getSetting(INSTALL_DISMISSED_AT_KEY).catch(() => 0)) || 0;
  installBannerInstalled = Boolean(await getSetting(INSTALL_INSTALLED_KEY).catch(() => false));
  unlockedAchievementIds = normalizeAchievementIds(await getSetting(SCORE_ACHIEVEMENTS_KEY).catch(() => []));
  personalBestByVenue = normalizePersonalBestMap(await getSetting(SCORE_PERSONAL_BESTS_KEY).catch(() => ({})));
  scoreStreakState = normalizeStreakState(await getSetting(SCORE_STREAK_STATE_KEY).catch(() => ({})));
  installVisitCount += 1;
  setSetting(INSTALL_VISITS_KEY, installVisitCount).catch(() => {});

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

  const launchState = parseLaunchState(window.location.search, { activeTab, currentView });
  if (launchState.hasExplicitTab) {
    activeTab = launchState.activeTab;
  }
  if (launchState.hasExplicitMode) {
    currentView = launchState.currentView;
  }

  handleShareTargetLaunch(window.location.search);

  followMapCenter = Boolean(await getSetting("followMapCenter").catch(() => true));
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
  wireInstallPromptHandling();
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
  renderInstallBanner();
  renderConnectivityBanner();
  renderList();

  scheduleSmartBannerTimeout();

  maybeRefreshLocationSilently().catch(() => {});

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

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
const detailDialog = document.getElementById("detailDialog");
const detailTitle = document.getElementById("detailTitle");
const detailContent = document.getElementById("detailContent");
const detailClose = document.getElementById("detailClose");
const aroundMeListEl = document.getElementById("aroundMeList");
const aroundMeMetaEl = document.getElementById("aroundMeMeta");
const viewAllBtn = document.getElementById("viewAllBtn");
const viewSavedBtn = document.getElementById("viewSavedBtn");
const hideVisitedToggle = document.getElementById("hideVisitedToggle");
const pickPointBtn = document.getElementById("pickPointBtn");
const clearPointBtn = document.getElementById("clearPointBtn");
const followMapToggle = document.getElementById("followMapToggle");
const mapFocusMeta = document.getElementById("mapFocusMeta");

const DEFAULT_NEARBY_COUNT = 10;

let markers = [];
let map = null;
let markerLayer = null;
let userLatLng = null;
let favorites = new Set();
let visited = new Set();
let currentView = "all";
let hideVisited = false;
let mapCenterLatLng = null;
let customPointLatLng = null;
let followMapCenter = true;
let pickPointMode = false;
let customPointLayer = null;
let mapCenterLayer = null;
let reloadScheduled = false;
let pendingServiceWorker = null;

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
  if (customPointLatLng) return { ...customPointLatLng, source: "point" };
  if (userLatLng) return { ...userLatLng, source: "location" };
  if (followMapCenter && mapCenterLatLng) return { ...mapCenterLatLng, source: "map" };
  return null;
}

function describeReferenceSource(source) {
  if (source === "point") return "Punkt";
  if (source === "map") return "Map-Center";
  return "Standort";
}

function updateMapMetaText() {
  const ref = getActiveReferencePoint();
  if (!ref) {
    mapFocusMeta.textContent = "Map-Explore aktiv. Bewege die Karte oder setze einen Punkt.";
    return;
  }
  mapFocusMeta.textContent = `Aktive Referenz: ${describeReferenceSource(ref.source)} (${ref.lat.toFixed(4)}, ${ref.lng.toFixed(4)})`;
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

function initMap(bounds) {
  map = L.map("map", { zoomControl: true, minZoom: 4 }).setView([51.1634, 10.4477], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);

  if (bounds?.lat_min && bounds?.lng_min && bounds?.lat_max && bounds?.lng_max) {
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
    updateMapPointLayers();
    updateMapMetaText();
    renderList();
    renderAroundMe();
  });

  map.on("click", (event) => {
    if (!pickPointMode) return;
    customPointLatLng = { lat: event.latlng.lat, lng: event.latlng.lng };
    pickPointMode = false;
    pickPointBtn.classList.remove("is-active");
    updateMapPointLayers();
    updateMapMetaText();
    renderList();
    renderAroundMe();
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

function renderAroundMe() {
  aroundMeListEl.innerHTML = "";
  const reference = getActiveReferencePoint();

  if (!reference) {
    aroundMeMetaEl.textContent = "Aktiviere Standort oder nutze Map-Center/Punkt fuer Nearby-Liste.";
    return;
  }

  let ranked = rankNearby(applyTopFilters(markers), reference);

  const nearby30 = ranked.filter((x) => x._distanceKm <= 30);
  const nearby60 = ranked.filter((x) => x._distanceKm <= 60);
  const chosen = (nearby30.length >= 6 ? nearby30 : nearby60.length >= 6 ? nearby60 : ranked).slice(0, DEFAULT_NEARBY_COUNT);

  aroundMeMetaEl.textContent = `Zeige ${chosen.length} Orte nahe ${describeReferenceSource(reference.source)}.`;

  for (const item of chosen) {
    const li = document.createElement("li");
    li.className = "around-item";
    const rating = typeof item.rating === "number" ? `★ ${item.rating.toFixed(1)}` : "no rating";
    const favClass = favorites.has(item.id) ? "fav-btn is-favorite" : "fav-btn";
    const favLabel = favorites.has(item.id) ? "Saved" : "Save";
    const visitClass = visited.has(item.id) ? "visit-btn is-visited" : "visit-btn";
    const visitLabel = visited.has(item.id) ? "Visited" : "Mark Visited";
    const visitedBadge = visited.has(item.id) ? "<span class='visited-badge'>visited</span>" : "";
    const poiHint = nearbyPoiHint(item);

    li.innerHTML = `
      <h3>${item.name}${visitedBadge}</h3>
      <div class="venue-meta venue-tags">${renderVenueId(item.id)} ${renderCoordinateSource(item)}</div>
      <div class="venue-meta">${item._distanceKm.toFixed(1)} km • ${rating}</div>
      <div class="venue-meta">${item.postcode || ""} ${item.place || ""}</div>
      ${poiHint ? `<div class="poi-note">${poiHint}</div>` : ""}
      <div class="venue-actions">
        <button type="button" data-action="detail" data-id="${item.id}">Details</button>
        <button type="button" data-action="fly" data-id="${item.id}">Map</button>
        <button type="button" class="route-btn" data-action="route" data-id="${item.id}">Route</button>
        <button type="button" class="${favClass}" data-action="favorite" data-id="${item.id}">${favLabel}</button>
        <button type="button" class="${visitClass}" data-action="visited" data-id="${item.id}">${visitLabel}</button>
      </div>
    `;

    aroundMeListEl.appendChild(li);
  }
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
  const reference = getActiveReferencePoint();
  const search = searchEl.value.trim().toLowerCase();
  const type = typeEl.value;

  const filtered = applyTopFilters(markers)
    .filter((m) => matchesFilter(m, search, type))
    .map((m) => {
      if (reference) {
        return {
          ...m,
          _distanceKm: haversineKm(reference.lat, reference.lng, m.lat, m.lng),
        };
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
    const li = document.createElement("li");
    li.className = "venue-item";

    const distance = typeof item._distanceKm === "number" ? `${item._distanceKm.toFixed(1)} km` : null;
    const types = (item.course_types || []).map((t) => `<span class="chip">${t}</span>`).join(" ");
    const favClass = favorites.has(item.id) ? "fav-btn is-favorite" : "fav-btn";
    const favLabel = favorites.has(item.id) ? "Saved" : "Save";
    const visitClass = visited.has(item.id) ? "visit-btn is-visited" : "visit-btn";
    const visitLabel = visited.has(item.id) ? "Visited" : "Mark Visited";
    const visitedBadge = visited.has(item.id) ? "<span class='visited-badge'>visited</span>" : "";
    const poiHint = nearbyPoiHint(item);

    li.innerHTML = `
      <h3>${item.name}${visitedBadge}</h3>
      <div class="venue-meta venue-tags">${renderVenueId(item.id)} ${renderCoordinateSource(item)}</div>
      <div class="venue-meta">${item.postcode || ""} ${item.place || ""}${distance ? ` • ${distance}` : ""}</div>
      <div class="venue-meta">${types || "<span class='chip'>unknown</span>"}</div>
      ${poiHint ? `<div class="poi-note">${poiHint}</div>` : ""}
      <div class="venue-actions">
        <button type="button" data-action="detail" data-id="${item.id}">Details</button>
        <button type="button" data-action="fly" data-id="${item.id}">Map</button>
        <button type="button" class="route-btn" data-action="route" data-id="${item.id}">Route</button>
        <button type="button" class="${favClass}" data-action="favorite" data-id="${item.id}">${favLabel}</button>
        <button type="button" class="${visitClass}" data-action="visited" data-id="${item.id}">${visitLabel}</button>
      </div>
    `;

    li.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.getAttribute("data-action");
      const itemId = target.getAttribute("data-id");
      if (!action) return;
      if (action === "detail") showDetails(item.id);
      if (action === "fly") map.flyTo([item.lat, item.lng], 14, { duration: 0.6 });
      if (action === "route") openRoute(item);
      if (action === "favorite" && itemId) {
        toggleFavorite(itemId)
          .then((isFavorite) => {
            if (isFavorite) favorites.add(itemId);
            else favorites.delete(itemId);
            renderList();
            renderAroundMe();
          })
          .catch(() => {});
      }
      if (action === "visited" && itemId) {
        toggleVisited(itemId)
          .then((isVisited) => {
            if (isVisited) visited.add(itemId);
            else visited.delete(itemId);
            renderList();
            renderAroundMe();
          })
          .catch(() => {});
      }
    });

    listEl.appendChild(li);

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

function wireAroundMeEvents() {
  aroundMeListEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.getAttribute("data-action");
    const itemId = target.getAttribute("data-id");
    if (!action || !itemId) return;
    const item = markerById(itemId);
    if (!item) return;

    if (action === "detail") showDetails(item.id);
    if (action === "fly") map.flyTo([item.lat, item.lng], 14, { duration: 0.6 });
    if (action === "route") openRoute(item);
    if (action === "favorite") {
      toggleFavorite(itemId)
        .then((isFavorite) => {
          if (isFavorite) favorites.add(itemId);
          else favorites.delete(itemId);
          renderList();
          renderAroundMe();
        })
        .catch(() => {});
    }
    if (action === "visited") {
      toggleVisited(itemId)
        .then((isVisited) => {
          if (isVisited) visited.add(itemId);
          else visited.delete(itemId);
          renderList();
          renderAroundMe();
        })
        .catch(() => {});
    }
  });
}

function setActiveView(view) {
  currentView = view;
  viewAllBtn.classList.toggle("is-active", view === "all");
  viewSavedBtn.classList.toggle("is-active", view === "saved");
  renderList();
  renderAroundMe();
}

function setUserLocation(lat, lng, shouldFly = true) {
  userLatLng = { lat, lng };
  setSetting("lastLocation", userLatLng).catch(() => {});
  if (shouldFly && map) map.flyTo([lat, lng], 11, { duration: 0.7 });
  renderList();
  renderAroundMe();
}

function requestLocation({ shouldFly = true } = {}) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setUserLocation(pos.coords.latitude, pos.coords.longitude, shouldFly);
    },
    () => {},
    { enableHighAccuracy: true, timeout: 7000, maximumAge: 120000 },
  );
}

function hookEvents() {
  searchEl.addEventListener("input", renderList);
  typeEl.addEventListener("change", renderList);

  locateBtn.addEventListener("click", () => {
    requestLocation({ shouldFly: true });
  });

  viewAllBtn.addEventListener("click", () => setActiveView("all"));
  viewSavedBtn.addEventListener("click", () => setActiveView("saved"));
  hideVisitedToggle.addEventListener("change", () => {
    hideVisited = hideVisitedToggle.checked;
    setSetting("hideVisited", hideVisited).catch(() => {});
    renderList();
    renderAroundMe();
  });

  followMapToggle.addEventListener("change", () => {
    followMapCenter = followMapToggle.checked;
    setSetting("followMapCenter", followMapCenter).catch(() => {});
    updateMapMetaText();
    renderList();
    renderAroundMe();
  });

  pickPointBtn.addEventListener("click", () => {
    pickPointMode = !pickPointMode;
    pickPointBtn.classList.toggle("is-active", pickPointMode);
    mapFocusMeta.textContent = pickPointMode
      ? "Klick auf die Karte, um einen Suchpunkt zu setzen."
      : mapFocusMeta.textContent;
  });

  clearPointBtn.addEventListener("click", () => {
    customPointLatLng = null;
    pickPointMode = false;
    pickPointBtn.classList.remove("is-active");
    updateMapPointLayers();
    updateMapMetaText();
    renderList();
    renderAroundMe();
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

  const lastLocation = await getSetting("lastLocation").catch(() => null);
  if (lastLocation?.lat && lastLocation?.lng) {
    userLatLng = { lat: lastLocation.lat, lng: lastLocation.lng };
  }

  followMapCenter = Boolean(await getSetting("followMapCenter").catch(() => false));
  followMapToggle.checked = followMapCenter;

  markers = markerPayload.markers || [];

  metaEl.textContent = `${bootstrap.total_venues} venues • ${bootstrap.stats.with_google_place} with Google details`;
  if (appVersionMetaEl) {
    appVersionMetaEl.textContent = `Version ${APP_VERSION}`;
  }

  initMap(bootstrap.bounds);
  hookEvents();
  wireAroundMeEvents();
  renderList();
  renderAroundMe();

  requestLocation({ shouldFly: false });

  scheduleBackgroundWarmup();
}

wireServiceWorkerUpdates();

boot().catch((err) => {
  metaEl.textContent = "Failed to load dataset";
  console.error(err);
});

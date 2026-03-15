const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

function versionedPath(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${encodeURIComponent(APP_VERSION)}`;
}

const DEFAULT_PATHS = {
  bootstrap: versionedPath("/data/venues-bootstrap.json"),
  markers: versionedPath("/data/venues-markers.json"),
  full: versionedPath("/data/venues-webapp.json"),
};

let fullDataPromise = null;
let fullDataById = null;

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildIdIndex(fullPayload) {
  const index = new Map();
  for (const venue of fullPayload.venues || []) {
    if (venue?.id) index.set(venue.id, venue);
  }
  return index;
}

export async function loadInitialData(paths = DEFAULT_PATHS) {
  const [bootstrap, markers] = await Promise.all([
    fetchJson(paths.bootstrap, 8000),
    fetchJson(paths.markers, 12000),
  ]);
  return { bootstrap, markers };
}

export function warmFullData(paths = DEFAULT_PATHS) {
  if (!fullDataPromise) {
    fullDataPromise = fetchJson(paths.full, 30000)
      .then((payload) => {
        fullDataById = buildIdIndex(payload);
        return payload;
      })
      .catch((err) => {
        fullDataPromise = null;
        throw err;
      });
  }
  return fullDataPromise;
}

export async function getVenueDetailsById(venueId, paths = DEFAULT_PATHS) {
  if (!fullDataById) {
    await warmFullData(paths);
  }
  return fullDataById ? fullDataById.get(venueId) || null : null;
}

export function scheduleBackgroundWarmup(paths = DEFAULT_PATHS) {
  const runner = () => {
    warmFullData(paths).catch(() => {});
  };

  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(runner, { timeout: 3000 });
    return;
  }
  setTimeout(runner, 1200);
}

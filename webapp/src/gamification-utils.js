export const ACHIEVEMENT_DEFS = {
  first_round_finished: "Erste Runde beendet",
  first_visited_place: "Erster besuchter Platz",
  three_saved_places: "3 Plaetze gespeichert",
  bogey_free_hole: "Bogey-freie Bahn",
};

export function getAchievementLabel(id) {
  return ACHIEVEMENT_DEFS[id] || id;
}

export function getHoleFeedback({ stroke, par }) {
  const safeStroke = Number(stroke);
  const safePar = Number(par);
  if (!Number.isFinite(safeStroke) || !Number.isFinite(safePar)) {
    return { label: "Eingetragen", tone: "neutral" };
  }
  const delta = safeStroke - safePar;
  if (safeStroke === 1 || delta <= -2) return { label: "Birdie", tone: "great" };
  if (delta === -1) return { label: "Stark", tone: "good" };
  if (delta === 0) return { label: "Par", tone: "par" };
  if (delta === 1) return { label: "Knapp drueber", tone: "warn" };
  return { label: "Autsch", tone: "tough" };
}

export function getNewAchievementIds({
  unlockedIds = [],
  favoritesCount = 0,
  visitedCount = 0,
  justFinishedRound = false,
  bogeyFreeHole = false,
} = {}) {
  const existing = new Set(unlockedIds);
  const gained = [];
  if (justFinishedRound && !existing.has("first_round_finished")) gained.push("first_round_finished");
  if (visitedCount >= 1 && !existing.has("first_visited_place")) gained.push("first_visited_place");
  if (favoritesCount >= 3 && !existing.has("three_saved_places")) gained.push("three_saved_places");
  if (bogeyFreeHole && !existing.has("bogey_free_hole")) gained.push("bogey_free_hole");
  return gained;
}

export function evaluatePersonalBest({ previousBest = null, total = 0 } = {}) {
  if (!Number.isFinite(total)) {
    return { best: previousBest, improved: false, isFirst: false };
  }
  if (!Number.isFinite(previousBest)) {
    return { best: total, improved: true, isFirst: true };
  }
  if (total < previousBest) {
    return { best: total, improved: true, isFirst: false };
  }
  return { best: previousBest, improved: false, isFirst: false };
}

export function computeDiscoveryProgress({ markers = [], favorites = new Set(), visited = new Set(), place = "" } = {}) {
  const normalized = String(place || "").trim().toLowerCase();
  if (!normalized) {
    return { total: 0, saved: 0, visited: 0, place: "" };
  }
  const scoped = markers.filter((item) => String(item?.place || "").trim().toLowerCase() === normalized);
  return {
    place,
    total: scoped.length,
    saved: scoped.filter((item) => favorites.has(item.id)).length,
    visited: scoped.filter((item) => visited.has(item.id)).length,
  };
}

export function buildNextChallenge({ parSum = 0, total = 0, skippedCount = 0, birdieCount = 0, bogeyFreeCount = 0 } = {}) {
  if (skippedCount > 0) return "Naechste Challenge: Runde ohne Skip beenden.";
  if (total > parSum) return "Naechste Challenge: auf 3 Bahnen unter PAR bleiben.";
  if (birdieCount < 1) return "Naechste Challenge: mindestens einen Birdie holen.";
  if (bogeyFreeCount < 3) return "Naechste Challenge: drei bogey-freie Bahnen schaffen.";
  return "Naechste Challenge: persoenlichen Bestwert knacken.";
}

function toDayKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function dayDistance(fromDay, toDay) {
  const from = new Date(`${fromDay}T00:00:00Z`).getTime();
  const to = new Date(`${toDay}T00:00:00Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86400000);
}

export function updateStreakState({ state = {}, now = Date.now() } = {}) {
  const dayKey = toDayKey(now);
  const previousDay = String(state.lastRoundDay || "");
  const previousStreak = Number.isFinite(Number(state.streakCount)) ? Number(state.streakCount) : 0;
  const previousBest = Number.isFinite(Number(state.bestStreak)) ? Number(state.bestStreak) : 0;
  const previousRounds = Number.isFinite(Number(state.totalRounds)) ? Number(state.totalRounds) : 0;

  let streakCount = previousStreak;
  let streakEvent = "none";

  if (!previousDay) {
    streakCount = 1;
    streakEvent = "started";
  } else {
    const diff = dayDistance(previousDay, dayKey);
    if (diff === 0) {
      streakEvent = "same-day";
    } else if (diff === 1) {
      streakCount = Math.max(1, previousStreak + 1);
      streakEvent = "continued";
    } else {
      streakCount = 1;
      streakEvent = "reset";
    }
  }

  const totalRounds = previousRounds + 1;
  const bestStreak = Math.max(previousBest, streakCount);

  return {
    nextState: {
      streakCount,
      bestStreak,
      totalRounds,
      lastRoundDay: dayKey,
    },
    event: streakEvent,
  };
}

export function formatStreakLine({ streakCount = 0, bestStreak = 0, event = "none" } = {}) {
  if (event === "same-day") {
    return `Tagesserie bleibt bei ${streakCount}. Beste Serie: ${bestStreak}.`;
  }
  if (event === "continued") {
    return `Serie ausgebaut: ${streakCount} Tage am Stueck.`;
  }
  if (event === "reset") {
    return `Neue Serie gestartet. Aktuell: 1 Tag. Beste Serie: ${bestStreak}.`;
  }
  return `Serie gestartet: ${Math.max(1, streakCount)} Tag.`;
}

export function buildSessionProgress({ totalRounds = 0, bestStreak = 0 } = {}) {
  const rounds = Number.isFinite(Number(totalRounds)) ? Number(totalRounds) : 0;
  const streak = Number.isFinite(Number(bestStreak)) ? Number(bestStreak) : 0;

  if (rounds >= 50 || streak >= 10) {
    return "Level: Atlas-Legende";
  }
  if (rounds >= 20 || streak >= 5) {
    return "Level: Platz-Kenner";
  }
  if (rounds >= 5 || streak >= 2) {
    return "Level: Regelmaessig unterwegs";
  }
  return "Level: Erste Schritte";
}

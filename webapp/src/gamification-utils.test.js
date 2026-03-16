import { describe, expect, it } from "vitest";
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

describe("getHoleFeedback", () => {
  it("returns birdie for clearly under par", () => {
    expect(getHoleFeedback({ stroke: 1, par: 3 })).toEqual({ label: "Birdie", tone: "great" });
  });

  it("returns par for equal score", () => {
    expect(getHoleFeedback({ stroke: 2, par: 2 })).toEqual({ label: "Par", tone: "par" });
  });
});

describe("getNewAchievementIds", () => {
  it("unlocks requested milestones", () => {
    expect(
      getNewAchievementIds({ favoritesCount: 3, visitedCount: 1, justFinishedRound: true, bogeyFreeHole: true }),
    ).toEqual([
      "first_round_finished",
      "first_visited_place",
      "three_saved_places",
      "bogey_free_hole",
    ]);
  });

  it("does not unlock already owned achievements", () => {
    expect(getNewAchievementIds({ unlockedIds: ["first_round_finished"], justFinishedRound: true })).toEqual([]);
  });
});

describe("evaluatePersonalBest", () => {
  it("detects first and improved best", () => {
    expect(evaluatePersonalBest({ previousBest: null, total: 42 })).toEqual({ best: 42, improved: true, isFirst: true });
    expect(evaluatePersonalBest({ previousBest: 42, total: 39 })).toEqual({ best: 39, improved: true, isFirst: false });
  });
});

describe("computeDiscoveryProgress", () => {
  it("counts visited and saved for one place", () => {
    const markers = [
      { id: "a", place: "Berlin" },
      { id: "b", place: "Berlin" },
      { id: "c", place: "Hamburg" },
    ];
    const favorites = new Set(["a"]);
    const visited = new Set(["a", "b"]);
    expect(computeDiscoveryProgress({ markers, favorites, visited, place: "Berlin" })).toEqual({
      place: "Berlin",
      total: 2,
      saved: 1,
      visited: 2,
    });
  });
});

describe("buildNextChallenge", () => {
  it("prioritizes unfinished discipline gaps", () => {
    expect(buildNextChallenge({ skippedCount: 1 })).toBe("Naechste Challenge: Runde ohne Skip beenden.");
    expect(buildNextChallenge({ parSum: 36, total: 40, skippedCount: 0 })).toBe("Naechste Challenge: auf 3 Bahnen unter PAR bleiben.");
  });
});

describe("getAchievementLabel", () => {
  it("maps ids to readable labels", () => {
    expect(getAchievementLabel("three_saved_places")).toBe("3 Plaetze gespeichert");
  });
});

describe("updateStreakState", () => {
  it("starts streak on first round", () => {
    const { nextState, event } = updateStreakState({ state: {}, now: Date.parse("2026-03-16T10:00:00Z") });
    expect(event).toBe("started");
    expect(nextState.streakCount).toBe(1);
    expect(nextState.totalRounds).toBe(1);
  });

  it("continues streak on next day", () => {
    const { nextState, event } = updateStreakState({
      state: { streakCount: 2, bestStreak: 2, totalRounds: 4, lastRoundDay: "2026-03-15" },
      now: Date.parse("2026-03-16T07:00:00Z"),
    });
    expect(event).toBe("continued");
    expect(nextState.streakCount).toBe(3);
    expect(nextState.bestStreak).toBe(3);
    expect(nextState.totalRounds).toBe(5);
  });
});

describe("formatStreakLine", () => {
  it("formats reset message", () => {
    expect(formatStreakLine({ streakCount: 1, bestStreak: 4, event: "reset" })).toContain("Neue Serie gestartet");
  });
});

describe("buildSessionProgress", () => {
  it("maps rounds to progress levels", () => {
    expect(buildSessionProgress({ totalRounds: 1, bestStreak: 1 })).toBe("Level: Erste Schritte");
    expect(buildSessionProgress({ totalRounds: 6, bestStreak: 2 })).toBe("Level: Regelmaessig unterwegs");
  });
});

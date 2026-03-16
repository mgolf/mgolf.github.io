import { describe, expect, it } from "vitest";
import {
  INSTALL_BANNER_COOLDOWN_MS,
  buildConnectivityMessage,
  parseLaunchState,
  shouldHoldWakeLock,
  shouldShowInstallBanner,
} from "./pwa-utils.js";

describe("shouldShowInstallBanner", () => {
  it("hides on first visit", () => {
    expect(shouldShowInstallBanner({ visits: 1, hasDeferredPrompt: true })).toBe(false);
  });

  it("shows on second visit when prompt exists", () => {
    expect(shouldShowInstallBanner({ visits: 2, hasDeferredPrompt: true })).toBe(true);
  });

  it("respects cooldown after dismiss", () => {
    expect(
      shouldShowInstallBanner({
        visits: 5,
        hasDeferredPrompt: true,
        dismissedAt: 1000,
        now: 1000 + INSTALL_BANNER_COOLDOWN_MS - 1,
      }),
    ).toBe(false);
  });

  it("hides when installed", () => {
    expect(shouldShowInstallBanner({ visits: 5, hasDeferredPrompt: true, isInstalled: true })).toBe(false);
  });
});

describe("parseLaunchState", () => {
  it("parses shortcut links", () => {
    expect(parseLaunchState("?tab=list&mode=saved")).toEqual({
      activeTab: "list",
      currentView: "saved",
      hasExplicitTab: true,
      hasExplicitMode: true,
    });
  });

  it("falls back for invalid params", () => {
    expect(parseLaunchState("?tab=foo&mode=bar")).toEqual({
      activeTab: "map",
      currentView: "nearby",
      hasExplicitTab: false,
      hasExplicitMode: false,
    });
  });
});

describe("buildConnectivityMessage", () => {
  it("returns offline map-specific text", () => {
    expect(buildConnectivityMessage({ isOnline: false, activeTab: "map" }).text).toContain("Kartenkacheln");
  });

  it("returns online recovery text", () => {
    expect(buildConnectivityMessage({ isOnline: true }).tone).toBe("online");
  });
});

describe("shouldHoldWakeLock", () => {
  it("holds wake lock only during live scoring", () => {
    expect(shouldHoldWakeLock({ activeTab: "score", scorePhase: "play", visibilityState: "visible", hasWakeLockApi: true })).toBe(true);
    expect(shouldHoldWakeLock({ activeTab: "map", scorePhase: "play", visibilityState: "visible", hasWakeLockApi: true })).toBe(false);
  });
});

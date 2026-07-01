// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { generateTrackingCode, isValidTrackingCode } from "@trk/shared/trk";
import { parseOrigin } from "../src/parseUrl";
import { getStoredId, storeId, getStoredOrigin, storeOrigin } from "../src/storage";

describe("tracker · TRK", () => {
  it("gera código no formato TRK-XXXX e valida", () => {
    const trk = generateTrackingCode();
    expect(trk).toMatch(/^TRK-[A-Z0-9]{12}$/);
    expect(isValidTrackingCode(trk)).toBe(true);
  });
});

describe("tracker · parseOrigin", () => {
  it("extrai UTMs e click ids da URL", () => {
    window.history.replaceState({}, "", "/produto?utm_source=meta&utm_medium=cpc&fbclid=abc");
    const origin = parseOrigin();
    expect(origin.utm.source).toBe("meta");
    expect(origin.utm.medium).toBe("cpc");
    expect(origin.clickIds.fbclid).toBe("abc");
    expect(origin.landingPageUrl).toContain("/produto");
  });

  it("origem vazia quando não há parâmetros", () => {
    window.history.replaceState({}, "", "/");
    const origin = parseOrigin();
    expect(origin.utm.source).toBeNull();
    expect(origin.clickIds.gclid).toBeNull();
  });
});

describe("tracker · storeLocal", () => {
  beforeEach(() => window.localStorage.clear());

  it("persiste e recupera o Tracking ID", () => {
    expect(getStoredId()).toBeNull();
    storeId("TRK-ABC123DEF456");
    expect(getStoredId()).toBe("TRK-ABC123DEF456");
  });

  it("persiste e recupera a origem (roundtrip JSON)", () => {
    window.history.replaceState({}, "", "/?utm_source=google&gclid=xyz");
    const origin = parseOrigin();
    storeOrigin(origin);
    const restored = getStoredOrigin();
    expect(restored?.utm.source).toBe("google");
    expect(restored?.clickIds.gclid).toBe("xyz");
  });
});

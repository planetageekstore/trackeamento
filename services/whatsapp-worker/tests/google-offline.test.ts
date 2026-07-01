import { describe, it, expect } from "vitest";
import { buildGoogleOfflinePayload } from "../src/senders/google";
import { toGoogleDateTime, computeMatchQuality } from "../src/senders/retry";

describe("buildGoogleOfflinePayload (contrato)", () => {
  it("atrela gclid + conversion_action + data/hora + valor", () => {
    const p = buildGoogleOfflinePayload({
      gclid: "xyz789",
      conversionAction: "customers/123/conversionActions/456",
      conversionDateTime: "2026-06-28 10:15:00+00:00",
      value: 199.9,
      currency: "BRL",
    });
    expect(p.conversions).toHaveLength(1);
    expect(p.conversions[0]).toMatchObject({
      gclid: "xyz789",
      conversionAction: "customers/123/conversionActions/456",
      conversionDateTime: "2026-06-28 10:15:00+00:00",
      conversionValue: 199.9,
      currencyCode: "BRL",
    });
  });
});

describe("helpers de dispatch", () => {
  it("computeMatchQuality reflete presença de click id", () => {
    expect(computeMatchQuality(true)).toBe("full");
    expect(computeMatchQuality(false)).toBe("reduced");
  });

  it("toGoogleDateTime formata em UTC", () => {
    expect(toGoogleDateTime("2026-06-28T10:15:00.000Z")).toBe("2026-06-28 10:15:00+00:00");
  });
});

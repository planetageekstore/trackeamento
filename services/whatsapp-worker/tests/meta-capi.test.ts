import { describe, it, expect } from "vitest";
import { buildMetaCapiPayload, sha256 } from "../src/senders/meta";

describe("buildMetaCapiPayload (contrato)", () => {
  it("deriva fbc do fbclid e hasheia PII (EMQ verde)", () => {
    const p = buildMetaCapiPayload({
      eventName: "Purchase",
      eventTime: 1751284800,
      phone: "+55 11 99999-9999",
      email: "Cliente@Example.com",
      fbclid: "abc123",
      clickTimeMs: 1751000000000,
      value: 199.9,
      currency: "BRL",
      testEventCode: "TEST123",
    });
    const data = (p.data as Array<Record<string, any>>)[0];
    expect(data.event_name).toBe("Purchase");
    expect(data.action_source).toBe("website");
    expect(data.user_data.fbc).toBe("fb.1.1751000000000.abc123");
    expect(data.user_data.ph[0]).toBe(sha256("5511999999999"));
    expect(data.user_data.em[0]).toBe(sha256("cliente@example.com"));
    expect(data.custom_data).toMatchObject({ value: 199.9, currency: "BRL" });
    expect((p as Record<string, unknown>).test_event_code).toBe("TEST123");
  });

  it("sem fbclid não inclui fbc (correspondência reduzida)", () => {
    const p = buildMetaCapiPayload({ eventName: "Lead", eventTime: 1, fbclid: null });
    const data = (p.data as Array<Record<string, any>>)[0];
    expect(data.user_data.fbc).toBeUndefined();
  });
});

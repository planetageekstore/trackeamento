import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { mapMetaInsightsToCosts } from "@/server/integrations/meta";
import { mapGoogleRowsToCosts } from "@/server/integrations/google";

describe("mapMetaInsightsToCosts", () => {
  it("mapeia insights para campaign_cost", () => {
    const rows = mapMetaInsightsToCosts(
      [
        { campaign_id: "c1", campaign_name: "Black", spend: "12.50", impressions: "1000", clicks: "10", date_start: "2026-06-01" },
      ],
      "t1",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenant_id: "t1",
      provider: "meta",
      campaign_id: "c1",
      campaign_name: "Black",
      date: "2026-06-01",
      spend: 12.5,
      impressions: 1000,
      clicks: 10,
    });
  });

  it("descarta linhas sem campaign_id ou data", () => {
    expect(mapMetaInsightsToCosts([{ spend: "5" }], "t1")).toHaveLength(0);
  });
});

describe("mapGoogleRowsToCosts", () => {
  it("converte cost_micros para reais (÷1e6)", () => {
    const rows = mapGoogleRowsToCosts(
      [
        {
          campaign: { id: "77", name: "Search" },
          metrics: { costMicros: "12500000", impressions: "500", clicks: "20" },
          segments: { date: "2026-06-02" },
        },
      ],
      "t1",
    );
    expect(rows[0]).toMatchObject({
      provider: "google",
      campaign_id: "77",
      campaign_name: "Search",
      date: "2026-06-02",
      spend: 12.5,
      impressions: 500,
      clicks: 20,
    });
  });
});

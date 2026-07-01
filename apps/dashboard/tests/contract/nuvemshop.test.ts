import { describe, it, expect, beforeAll, vi } from "vitest";
import { createHmac } from "node:crypto";
import { POST } from "@/app/api/webhooks/nuvemshop/route";

vi.mock("server-only", () => ({}));

const SECRET = "test-client-secret";
beforeAll(() => {
  process.env.NUVEMSHOP_CLIENT_SECRET = SECRET;
});

function sign(raw: string): string {
  return createHmac("sha256", SECRET).update(raw, "utf8").digest("hex");
}

function makeReq(raw: string, hmac: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (hmac) headers["x-linkedstore-hmac-sha256"] = hmac;
  return new Request("http://localhost/api/webhooks/nuvemshop", { method: "POST", headers, body: raw });
}

describe("POST /api/webhooks/nuvemshop (contrato)", () => {
  it("rejeita HMAC inválido com 401", async () => {
    const raw = JSON.stringify({ store_id: 1, event: "order/paid", id: 99 });
    const res = await POST(makeReq(raw, "deadbeef"));
    expect(res.status).toBe(401);
  });

  it("rejeita quando falta a assinatura", async () => {
    const raw = JSON.stringify({ store_id: 1, event: "order/paid", id: 99 });
    const res = await POST(makeReq(raw, null));
    expect(res.status).toBe(401);
  });

  it("aceita HMAC válido e responde 202 (payload sem id não gera evento)", async () => {
    const raw = JSON.stringify({ store_id: 1, event: "order/paid" });
    const res = await POST(makeReq(raw, sign(raw)));
    expect(res.status).toBe(202);
  });
});

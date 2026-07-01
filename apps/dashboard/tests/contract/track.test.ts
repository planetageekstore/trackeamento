import { describe, it, expect, vi, beforeEach } from "vitest";

// `server-only` lança fora de um contexto RSC — neutraliza no ambiente de teste.
vi.mock("server-only", () => ({}));
// Isola a rota das dependências de banco (contrato = forma da API, não a persistência).
vi.mock("@/server/tenant", () => ({ resolveTenant: vi.fn() }));
vi.mock("@/server/ingest", () => ({ ingestEvents: vi.fn() }));

import { resolveTenant } from "@/server/tenant";
import { ingestEvents } from "@/server/ingest";
import { POST, OPTIONS } from "@/app/api/track/route";

const validBody = {
  sk: "pk_live_demo",
  trk: "TRK-8ZK4Q2M7XR9A",
  events: [{ type: "PAGE_VIEW", url: "https://loja.com.br/", utm: { source: "meta" } }],
};

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/track", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://loja.com.br", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

describe("POST /api/track (contrato)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("responde 400 para JSON inválido", async () => {
    const res = await POST(makeReq("{not-json"));
    expect(res.status).toBe(400);
  });

  it("responde 400 para payload fora do schema (sem trk)", async () => {
    const res = await POST(makeReq({ sk: "pk_live_demo", events: [] }));
    expect(res.status).toBe(400);
  });

  it("responde 403 quando o tenant/domínio não resolve", async () => {
    vi.mocked(resolveTenant).mockResolvedValue(null);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(403);
    expect(ingestEvents).not.toHaveBeenCalled();
  });

  it("responde 202 e ingere quando válido", async () => {
    vi.mocked(resolveTenant).mockResolvedValue({ id: "t1", site_key: "pk_live_demo" });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(202);
    expect(ingestEvents).toHaveBeenCalledWith("t1", validBody.trk, expect.any(Array));
  });

  it("OPTIONS retorna 204 com CORS", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

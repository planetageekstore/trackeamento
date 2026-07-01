import { corsHeaders } from "@/server/http";

export const runtime = "nodejs";

/** Health do endpoint de ingestão — o tracker pode consultar antes de enviar. */
export function GET(): Response {
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

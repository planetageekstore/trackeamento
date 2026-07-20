import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CHAT_TOOLS, runTool } from "@/server/chat/tools";
import { createLogger } from "@trk/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const log = createLogger({ route: "api/chat" });

const MODEL = "claude-opus-4-8";
const MAX_ITERS = 8;

const SYSTEM = `Você é o copiloto de tráfego do cliente selecionado — um gestor de tráfego sênior com acesso somente-leitura aos dados do sistema (campanhas, leads, conversões, conversas, integrações). Responde perguntas e sugere otimizações.

REGRAS:
- Use as ferramentas para buscar números reais antes de afirmar qualquer métrica. Nunca invente dados.
- Se uma integração não está conectada, diga isso (use get_integration_status) em vez de supor.
- Português do Brasil, direto e prático. Ao recomendar, seja acionável (o que pausar/escalar, onde investir).
- Você NÃO executa ações (pausar campanha etc.) — apenas analisa e recomenda.`;

interface Body {
  tenantId?: string;
  conversationId?: string;
  message?: string;
}

export async function POST(req: Request): Promise<Response> {
  await requireUser();
  const body = (await req.json().catch(() => ({}))) as Body;
  const tenantId = body.tenantId ?? "";
  const message = (body.message ?? "").trim();
  if (!tenantId || !message) return Response.json({ error: "bad_request" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: tenant } = await supabase.from("tenant").select("id, name").eq("id", tenantId).maybeSingle();
  if (!tenant) return Response.json({ error: "forbidden" }, { status: 403 });

  // Conversa: cria se necessário.
  let conversationId = body.conversationId ?? "";
  if (!conversationId) {
    const { data: conv } = await supabase
      .from("chat_conversation")
      .insert({ tenant_id: tenantId, title: message.slice(0, 60) })
      .select("id")
      .single();
    conversationId = conv?.id as string;
  }

  // Histórico (texto) para contexto.
  const { data: history } = await supabase
    .from("chat_message")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);

  const messages: Anthropic.MessageParam[] = [];
  for (const h of history ?? []) {
    const text = (h.content as { text?: string }[])?.map((b) => b.text ?? "").join("") ?? "";
    if (text) messages.push({ role: h.role as "user" | "assistant", content: text });
  }
  messages.push({ role: "user", content: message });

  // Persiste a mensagem do usuário.
  await supabase.from("chat_message").insert({
    conversation_id: conversationId,
    tenant_id: tenantId,
    role: "user",
    content: [{ type: "text", text: message }],
  });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "ANTHROPIC_API_KEY ausente" }, { status: 500 });
  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const system = `${SYSTEM}\n\nCliente atual: ${tenant.name}. Data de hoje: ${new Date().toLocaleDateString("pt-BR")}.`;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      send({ type: "conversation", conversationId });

      let assistantText = "";
      try {
        for (let iter = 0; iter < MAX_ITERS; iter++) {
          const s = client.messages.stream({
            model: MODEL,
            max_tokens: 4000,
            thinking: { type: "adaptive" },
            system,
            tools: CHAT_TOOLS,
            messages,
          });
          s.on("text", (delta) => {
            assistantText += delta;
            send({ type: "text", text: delta });
          });
          const msg = await s.finalMessage();
          messages.push({ role: "assistant", content: msg.content });

          if (msg.stop_reason !== "tool_use") break;

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of msg.content) {
            if (block.type !== "tool_use") continue;
            send({ type: "tool", name: block.name });
            let out = "";
            try {
              out = await runTool(tenantId, block.name, (block.input as Record<string, unknown>) ?? {});
            } catch (e) {
              out = `erro: ${e instanceof Error ? e.message : "falha"}`;
            }
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
          }
          messages.push({ role: "user", content: toolResults });
        }

        // Persiste a resposta final (texto).
        if (assistantText.trim()) {
          await supabase.from("chat_message").insert({
            conversation_id: conversationId,
            tenant_id: tenantId,
            role: "assistant",
            content: [{ type: "text", text: assistantText }],
          });
          await supabase.from("chat_conversation").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
        }
        send({ type: "done" });
      } catch (err) {
        log.error("falha no chat", { tenantId, err: String(err) });
        send({ type: "error", error: err instanceof Error ? err.message : "falha" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
}

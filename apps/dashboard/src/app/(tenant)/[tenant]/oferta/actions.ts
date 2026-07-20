"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  generateGso,
  regenerateGsoBlock,
  generateAdCopy,
  askEngineer,
  loadLibrary,
  type GsoInputs,
  type AdCopyInputs,
} from "@/server/offerV2";

async function assertTenant(tenantId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenant").select("id, name").eq("id", tenantId).maybeSingle();
  if (!data) throw new Error("Sem acesso a este cliente.");
  return { supabase, tenantName: (data.name as string) ?? "" };
}

/** Contexto leve do cliente para a IA (quando o checkbox está ligado). */
async function clientContext(tenantId: string, on: boolean): Promise<string | undefined> {
  if (!on) return undefined;
  const { tenantName } = await assertTenant(tenantId);
  return `Cliente: ${tenantName}.`;
}

async function notesFor(tenantId: string) {
  const { defaults, custom } = await loadLibrary(tenantId);
  return [...defaults, ...custom];
}

/** Grand Slam Offer: gera e salva. */
export async function criarGso(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  const { supabase } = await assertTenant(tenantId);

  const inputs: GsoInputs = {
    produto: String(formData.get("produto") ?? "").trim(),
    publico: String(formData.get("publico") ?? "").trim(),
    problema: String(formData.get("problema") ?? "").trim() || undefined,
    preco: String(formData.get("preco") ?? "").trim() || undefined,
    clientContext: await clientContext(tenantId, formData.get("useContext") === "on"),
  };
  if (!inputs.produto || !inputs.publico) throw new Error("Preencha produto e público.");

  const { outputMd, blocks, model } = await generateGso(inputs, await notesFor(tenantId));
  await supabase.from("oferta").insert({
    tenant_id: tenantId,
    kind: "gso",
    inputs,
    output_md: outputMd,
    blocks,
    model,
  });
  revalidatePath(`/${tenantId}/oferta`);
}

/** Regenera um bloco da GSO mais recente. */
export async function regenerarGsoBloco(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  const ofertaId = String(formData.get("ofertaId") ?? "");
  const blockKey = String(formData.get("blockKey") ?? "");
  const { supabase } = await assertTenant(tenantId);

  const { data: oferta } = await supabase
    .from("oferta")
    .select("inputs, output_md, blocks")
    .eq("id", ofertaId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!oferta) throw new Error("Oferta não encontrada.");

  const novo = await regenerateGsoBlock(
    oferta.inputs as GsoInputs,
    await notesFor(tenantId),
    String(oferta.output_md ?? ""),
    blockKey,
  );
  const blocks = { ...((oferta.blocks as Record<string, string>) ?? {}), [blockKey]: novo };
  await supabase.from("oferta").update({ blocks }).eq("id", ofertaId).eq("tenant_id", tenantId);
  revalidatePath(`/${tenantId}/oferta`);
}

/** Copy de Anúncio: gera 3 variações e salva. */
export async function gerarAdCopy(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  const { supabase } = await assertTenant(tenantId);

  const inputs: AdCopyInputs = {
    produto: String(formData.get("produto") ?? "").trim(),
    publico: String(formData.get("publico") ?? "").trim(),
    objetivo: String(formData.get("objetivo") ?? "").trim(),
    tom: String(formData.get("tom") ?? "").trim(),
    diferencial: String(formData.get("diferencial") ?? "").trim() || undefined,
    plataforma: String(formData.get("plataforma") ?? "Meta Ads"),
    framework: String(formData.get("framework") ?? "").trim() || undefined,
    clientContext: await clientContext(tenantId, formData.get("useContext") === "on"),
  };
  if (!inputs.produto || !inputs.publico) throw new Error("Preencha produto e público.");

  const { outputMd, model } = await generateAdCopy(inputs, await notesFor(tenantId));
  await supabase.from("oferta").insert({
    tenant_id: tenantId,
    kind: "ad_copy",
    inputs,
    output_md: outputMd,
    blocks: {},
    model,
  });
  revalidatePath(`/${tenantId}/oferta`);
}

/** Engenheiro (chat livre) — retorna a resposta (sem persistir). */
export async function perguntarEngenheiro(input: { tenantId: string; question: string }): Promise<string> {
  await requireUser();
  await assertTenant(input.tenantId);
  if (!input.question.trim()) return "";
  return askEngineer(input.question, await notesFor(input.tenantId));
}

/** Biblioteca: adiciona uma nota. */
export async function adicionarNota(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  const { supabase } = await assertTenant(tenantId);
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!title || !content) throw new Error("Título e conteúdo são obrigatórios.");
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  await supabase.from("copy_note").insert({ tenant_id: tenantId, title, content, tags });
  revalidatePath(`/${tenantId}/oferta`);
}

/** Biblioteca: remove uma nota do tenant. */
export async function removerNota(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  const noteId = String(formData.get("noteId") ?? "");
  const { supabase } = await assertTenant(tenantId);
  await supabase.from("copy_note").delete().eq("id", noteId).eq("tenant_id", tenantId);
  revalidatePath(`/${tenantId}/oferta`);
}

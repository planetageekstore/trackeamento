"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateOffer, regenerateBlock, type OfferInputs } from "@/server/offer";

/** Lê e valida os 5 inputs do formulário. Retorna null se algum estiver vazio. */
function readInputs(formData: FormData): OfferInputs | null {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const inputs: OfferInputs = {
    nicho: get("nicho"),
    produto: get("produto"),
    preco: get("preco"),
    roma: get("roma"),
    problema: get("problema"),
  };
  if (Object.values(inputs).some((v) => !v)) return null;
  return inputs;
}

/** Garante que o usuário tem acesso ao tenant (RLS na sessão do usuário). */
async function assertTenant(tenantId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenant").select("id").eq("id", tenantId).maybeSingle();
  if (!data) throw new Error("Sem acesso a este cliente.");
  return supabase;
}

/** Gera uma nova oferta a partir dos 5 inputs e salva vinculada ao tenant. */
export async function criarOferta(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) throw new Error("Cliente inválido.");
  const inputs = readInputs(formData);
  if (!inputs) throw new Error("Preencha todos os 5 campos para gerar a oferta.");

  const supabase = await assertTenant(tenantId);
  const { outputMd, blocks, model } = await generateOffer(inputs);

  await supabase.from("oferta").insert({
    tenant_id: tenantId,
    nicho: inputs.nicho,
    produto: inputs.produto,
    preco: inputs.preco,
    roma: inputs.roma,
    problema: inputs.problema,
    output_md: outputMd,
    blocks,
    model,
  });

  revalidatePath(`/${tenantId}/oferta`);
}

/** Regenera apenas um bloco de uma oferta existente e atualiza o registro. */
export async function regenerarBloco(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  const ofertaId = String(formData.get("ofertaId") ?? "");
  const blockKey = String(formData.get("blockKey") ?? "");
  if (!tenantId || !ofertaId || !blockKey) throw new Error("Parâmetros inválidos.");

  const supabase = await assertTenant(tenantId);
  const { data: oferta } = await supabase
    .from("oferta")
    .select("id, nicho, produto, preco, roma, problema, output_md, blocks")
    .eq("id", ofertaId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!oferta) throw new Error("Oferta não encontrada.");

  const inputs: OfferInputs = {
    nicho: oferta.nicho as string,
    produto: oferta.produto as string,
    preco: oferta.preco as string,
    roma: oferta.roma as string,
    problema: oferta.problema as string,
  };
  const novo = await regenerateBlock(inputs, String(oferta.output_md ?? ""), blockKey);

  const blocks = { ...((oferta.blocks as Record<string, string>) ?? {}), [blockKey]: novo };
  await supabase
    .from("oferta")
    .update({ blocks })
    .eq("id", ofertaId)
    .eq("tenant_id", tenantId);

  revalidatePath(`/${tenantId}/oferta`);
}

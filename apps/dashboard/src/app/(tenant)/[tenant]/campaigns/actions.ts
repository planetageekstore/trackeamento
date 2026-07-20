"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setAdObjectStatus } from "@/server/integrations/meta";

async function assertTenant(tenantId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenant").select("id").eq("id", tenantId).maybeSingle();
  if (!data) throw new Error("Sem acesso a este cliente.");
  return supabase;
}

export interface PauseInput {
  tenantId: string;
  objectType: "campaign" | "adset" | "ad";
  objectId: string;
  objectName: string;
  action: "pause" | "activate";
}

/**
 * Pausa ou reativa um objeto na Meta e registra a ação no log de auditoria.
 * Retorna erro claro quando o token não tem permissão de gerenciamento.
 */
export async function pausarObjeto(input: PauseInput): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const supabase = await assertTenant(input.tenantId);

  const status = input.action === "pause" ? "PAUSED" : "ACTIVE";
  const res = await setAdObjectStatus(input.tenantId, input.objectId, status);

  await supabase.from("campaign_action_log").insert({
    tenant_id: input.tenantId,
    user_id: user.id,
    object_type: input.objectType,
    object_id: input.objectId,
    object_name: input.objectName,
    action: input.action,
    result: res.ok ? "ok" : "error",
    detail: res.error ?? null,
  });

  if (res.ok) revalidatePath(`/${input.tenantId}/campaigns`);
  return res;
}

/** Ação em massa: pausa/reativa vários objetos e reporta sucesso/falha por item. */
export async function pausarEmMassa(
  tenantId: string,
  action: "pause" | "activate",
  objects: { objectType: "campaign" | "adset" | "ad"; objectId: string; objectName: string }[],
): Promise<{ done: number; failed: { id: string; error: string }[] }> {
  const failed: { id: string; error: string }[] = [];
  let done = 0;
  for (const o of objects) {
    const res = await pausarObjeto({ tenantId, action, ...o });
    if (res.ok) done++;
    else failed.push({ id: o.objectId, error: res.error ?? "erro" });
  }
  return { done, failed };
}

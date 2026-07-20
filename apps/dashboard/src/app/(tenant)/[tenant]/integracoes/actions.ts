"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { encryptSecret } from "@/server/crypto";

async function assertTenant(tenantId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenant").select("id").eq("id", tenantId).maybeSingle();
  if (!data) throw new Error("Sem acesso a este cliente.");
}

/** Lê o meta atual de uma integração (via service client). */
async function currentMeta(tenantId: string, provider: string): Promise<Record<string, unknown>> {
  const { data } = await createSupabaseServiceClient()
    .from("integration")
    .select("meta")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle();
  return (data?.meta as Record<string, unknown>) ?? {};
}

/** Conecta/atualiza o GA4 (Measurement ID + API Secret cifrado). */
export async function salvarGa4(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  await assertTenant(tenantId);
  const measurementId = String(formData.get("measurement_id") ?? "").trim();
  const apiSecret = String(formData.get("api_secret") ?? "").trim();
  const loadGtag = formData.get("load_gtag") === "on";
  if (!measurementId) throw new Error("Measurement ID é obrigatório.");

  const meta = await currentMeta(tenantId, "ga4");
  meta.measurement_id = measurementId;
  meta.load_gtag = loadGtag;
  if (apiSecret) meta.api_secret_enc = await encryptSecret(apiSecret);

  await createSupabaseServiceClient()
    .from("integration")
    .upsert(
      { tenant_id: tenantId, provider: "ga4", status: "connected", account_ref: measurementId, meta },
      { onConflict: "tenant_id,provider" },
    );
  revalidatePath(`/${tenantId}/integracoes`);
}

/** Liga/desliga o envio de conversões de um provider. */
export async function toggleDispatch(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  const provider = String(formData.get("provider") ?? "");
  const enabled = formData.get("enabled") === "on";
  await assertTenant(tenantId);
  const meta = await currentMeta(tenantId, provider);
  meta.dispatch_enabled = enabled;
  await createSupabaseServiceClient().from("integration").update({ meta }).eq("tenant_id", tenantId).eq("provider", provider);
  revalidatePath(`/${tenantId}/integracoes`);
}

/** Salva o test_event_code da Meta (validação no Gerenciador de Eventos). */
export async function salvarMetaTestCode(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  await assertTenant(tenantId);
  const meta = await currentMeta(tenantId, "meta");
  meta.test_event_code = String(formData.get("test_event_code") ?? "").trim() || null;
  await createSupabaseServiceClient().from("integration").update({ meta }).eq("tenant_id", tenantId).eq("provider", "meta");
  revalidatePath(`/${tenantId}/integracoes`);
}

/** Salva a Conversion Action do Google (resource name). */
export async function salvarConversionAction(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  await assertTenant(tenantId);
  const meta = await currentMeta(tenantId, "google");
  meta.conversion_action = String(formData.get("conversion_action") ?? "").trim() || null;
  await createSupabaseServiceClient().from("integration").update({ meta }).eq("tenant_id", tenantId).eq("provider", "google");
  revalidatePath(`/${tenantId}/integracoes`);
}

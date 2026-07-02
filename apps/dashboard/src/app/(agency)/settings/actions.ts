"use server";

import { revalidatePath } from "next/cache";
import { requireUser, resolveScope } from "@/lib/auth";
import { saveAppCredentials } from "@/server/appCredentials";

/** Salva as credenciais do app parceiro (client id/secret) da agência. */
export async function saveCredentials(formData: FormData): Promise<void> {
  await requireUser();
  const scope = await resolveScope();
  if (!scope.isAgencyAdmin || !scope.agencyId) {
    throw new Error("Apenas administradores da agência.");
  }

  const provider = String(formData.get("provider") ?? "") as
    | "meta"
    | "nuvemshop"
    | "google"
    | "whatsapp";
  if (!["meta", "nuvemshop", "google", "whatsapp"].includes(provider)) return;

  const clientId = String(formData.get("clientId") ?? "").trim();
  const clientSecret = String(formData.get("clientSecret") ?? "").trim();
  if (!clientId) return;

  await saveAppCredentials(scope.agencyId, provider, clientId, clientSecret || null);
  revalidatePath("/settings");
}

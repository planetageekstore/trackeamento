import { createRequire } from "node:module";
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { supabase } from "../supabase.js";

// Baileys é CommonJS — os valores vêm via require (o ESM do Node não detecta
// alguns named exports como `proto`). Tipos vêm por `import type` acima.
const baileys = createRequire(import.meta.url)("@whiskeysockets/baileys");
const { initAuthCreds, BufferJSON, proto } = baileys;

/**
 * Auth state do Baileys persistido no Supabase (tabela whatsapp_session).
 * Guarda `creds` + `keys` serializados (BufferJSON) para a sessão sobreviver a
 * restart sem pedir QR de novo. Uma linha por tenant.
 */
export async function useSupabaseAuthState(tenantId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clear: () => Promise<void>;
}> {
  const db = supabase();
  const { data } = await db
    .from("whatsapp_session")
    .select("auth")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const parsed = data?.auth ? JSON.parse(data.auth, BufferJSON.reviver) : null;
  const creds: AuthenticationCreds = parsed?.creds ?? initAuthCreds();
  const keys: Record<string, Record<string, unknown>> = parsed?.keys ?? {};

  const save = async (): Promise<void> => {
    const serialized = JSON.stringify({ creds, keys }, BufferJSON.replacer);
    await db
      .from("whatsapp_session")
      .upsert(
        { tenant_id: tenantId, auth: serialized, updated_at: new Date().toISOString() },
        { onConflict: "tenant_id" },
      );
  };

  return {
    state: {
      creds,
      keys: {
        get: (type, ids) => {
          const cat = keys[type] ?? {};
          const result: Record<string, unknown> = {};
          for (const id of ids) {
            let value = cat[id];
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value as object);
            }
            result[id] = value;
          }
          return result as unknown as { [id: string]: SignalDataTypeMap[typeof type] };
        },
        set: async (data) => {
          for (const type in data) {
            keys[type] = keys[type] ?? {};
            const cat = (data as Record<string, Record<string, unknown>>)[type];
            for (const id in cat) keys[type][id] = cat[id];
          }
          await save();
        },
      },
    },
    saveCreds: save,
    clear: async () => {
      await db.from("whatsapp_session").delete().eq("tenant_id", tenantId);
    },
  };
}

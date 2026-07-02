import Link from "next/link";
import { requireUser, resolveScope } from "@/lib/auth";
import { listAppCredentials } from "@/server/appCredentials";
import { saveCredentials } from "./actions";

export const dynamic = "force-dynamic";

function CredentialForm({
  provider,
  title,
  idLabel,
  secretLabel,
  help,
  current,
}: {
  provider: string;
  title: string;
  idLabel: string;
  secretLabel: string;
  help: string;
  current?: { clientId: string | null; hasSecret: boolean };
}) {
  return (
    <form action={saveCredentials} className="space-y-3 rounded-xl border bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{title}</h2>
        {current?.clientId && (
          <span className="text-xs text-emerald-600">
            ● configurado{current.hasSecret ? " (com secret)" : ""}
          </span>
        )}
      </div>
      <p className="text-sm text-neutral-600">{help}</p>
      <input type="hidden" name="provider" value={provider} />
      <div>
        <label className="mb-1 block text-xs text-neutral-500">{idLabel}</label>
        <input
          name="clientId"
          required
          defaultValue={current?.clientId ?? ""}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-neutral-500">
          {secretLabel} {current?.hasSecret && "(deixe em branco para manter o atual)"}
        </label>
        <input
          name="clientSecret"
          type="password"
          placeholder={current?.hasSecret ? "•••••••• (salvo)" : ""}
          className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
        />
      </div>
      <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">
        Salvar
      </button>
    </form>
  );
}

export default async function SettingsPage() {
  await requireUser();
  const scope = await resolveScope();
  const creds = scope.agencyId ? await listAppCredentials(scope.agencyId) : {};

  if (!scope.isAgencyAdmin) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="text-sm text-neutral-500">Apenas administradores da agência acessam as credenciais.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <Link href="/tenants" className="text-sm text-neutral-500 hover:underline">
          ← Clientes
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Credenciais dos apps</h1>
        <p className="text-sm text-neutral-500">
          Configuradas uma vez para a agência — usadas na conexão de todos os clientes.
        </p>
      </div>

      <CredentialForm
        provider="nuvemshop"
        title="Nuvemshop"
        idLabel="App ID"
        secretLabel="Client Secret"
        help="Do Portal de Parceiros da Nuvemshop → seu app → Chaves de acesso."
        current={creds.nuvemshop}
      />

      <CredentialForm
        provider="meta"
        title="Meta Ads (OAuth)"
        idLabel="ID do Aplicativo"
        secretLabel="Chave Secreta do Aplicativo"
        help="Do Meta for Developers → seu app → Configurações → Básico. (Opcional se você conectar via token de System User.)"
        current={creds.meta}
      />

      <CredentialForm
        provider="whatsapp"
        title="WhatsApp (Uazapi)"
        idLabel="Server URL"
        secretLabel="Admin Token"
        help="Do painel do Uazapi. Ex.: https://jgtech.uazapi.com + o Admin Token. Usado para criar as instâncias e gerar o QR."
        current={creds.whatsapp}
      />

      <CredentialForm
        provider="google"
        title="Google Ads (OAuth)"
        idLabel="Client ID"
        secretLabel="Client Secret"
        help="Do Google Cloud Console → APIs e serviços → Credenciais → ID do cliente OAuth 2.0 (aplicativo da Web). Adicione o URI de redirecionamento https://trackeamento-dashboard.vercel.app/api/oauth/google."
        current={creds.google}
      />
    </main>
  );
}

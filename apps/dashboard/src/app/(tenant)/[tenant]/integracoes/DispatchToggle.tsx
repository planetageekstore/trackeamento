"use client";

import { toggleDispatch } from "./actions";

/** Toggle de envio de conversões por provider (auto-submete ao mudar). */
export function DispatchToggle({
  tenant,
  provider,
  label,
  connected,
  enabled,
}: {
  tenant: string;
  provider: string;
  label: string;
  connected: boolean;
  enabled: boolean;
}) {
  if (!connected) {
    return (
      <p className="text-sm text-neutral-400">
        {label} — <span className="italic">conecte primeiro para habilitar o envio.</span>
      </p>
    );
  }
  return (
    <form action={toggleDispatch} className="flex items-center justify-between gap-3">
      <input type="hidden" name="tenantId" value={tenant} />
      <input type="hidden" name="provider" value={provider} />
      <span className="text-sm font-medium">{label}</span>
      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          className="h-4 w-4"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
        {enabled ? "enviando" : "desligado"}
      </label>
    </form>
  );
}

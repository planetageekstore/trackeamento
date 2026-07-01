// Enums e tipos de domínio compartilhados entre tracker, API e worker.
// Fonte única de verdade (ver data-model.md).

export const ROLE_TYPES = ["agency_admin", "client_user"] as const;
export type RoleType = (typeof ROLE_TYPES)[number];

export const INTEGRATION_PROVIDERS = ["meta", "google", "nuvemshop", "whatsapp"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const INTEGRATION_STATUSES = [
  "connected",
  "needs_reconnect",
  "revoked",
  "error",
] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export const EVENT_TYPES = [
  "PAGE_VIEW",
  "WHATSAPP_CLICK",
  "MESSAGE_RECEIVED",
  "CHECKOUT",
  "PURCHASE",
  "LEAD",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_SOURCES = ["tracker", "whatsapp", "nuvemshop", "system"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const DISPATCH_STATUSES = ["pending", "sent", "failed", "skipped"] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

export const DISPATCH_TARGETS = ["meta_capi", "google_offline"] as const;
export type DispatchTarget = (typeof DISPATCH_TARGETS)[number];

/** Parâmetros de origem capturados pelo tracker. */
export interface UtmParams {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
}

export interface ClickIds {
  fbclid: string | null;
  gclid: string | null;
}

export interface Lead {
  id: string;
  tenant_id: string;
  tracking_code: string;
  phone: string | null;
  email: string | null;
  created_at: string;
}

export interface Click {
  id: string;
  tenant_id: string;
  lead_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  referrer: string | null;
  landing_page_url: string | null;
  clicked_at: string;
}

export interface TrackEvent {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  event_type: EventType;
  source: EventSource;
  external_id: string | null;
  value: number | null;
  currency: string;
  event_data: Record<string, unknown>;
  attributed: boolean;
  occurred_at: string;
}

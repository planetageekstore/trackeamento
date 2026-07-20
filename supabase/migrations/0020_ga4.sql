-- 0020_ga4.sql — Integração GA4 (F7).
-- Novo provider `ga4` e novo alvo de dispatch `ga4_mp` (Measurement Protocol).
-- `lead.ga_client_id` guarda o client_id capturado do cookie _ga pelo tracker.
alter type integration_provider add value if not exists 'ga4';
alter type dispatch_target add value if not exists 'ga4_mp';

alter table lead add column if not exists ga_client_id text;

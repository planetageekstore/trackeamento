-- 0010_lead_session.sql — enriquecimento de sessão do lead (first-touch).
-- Dispositivo/sistema/navegador (do User-Agent), tela/idioma/fuso (do browser)
-- e geo aproximada (país/cidade/região) derivada do IP pelos headers da Vercel.
-- NÃO guardamos o IP cru — apenas a localização derivada.

alter table lead
  add column if not exists device_type text,   -- mobile | tablet | desktop
  add column if not exists os          text,   -- iOS | Android | Windows | macOS | Linux
  add column if not exists browser     text,   -- Chrome | Safari | Firefox | Edge | ...
  add column if not exists screen      text,   -- ex.: 1440x900
  add column if not exists language    text,   -- ex.: pt-BR
  add column if not exists timezone    text,   -- ex.: America/Sao_Paulo
  add column if not exists country     text,   -- ISO-2, ex.: BR
  add column if not exists region      text,   -- ex.: SP
  add column if not exists city        text;   -- ex.: São Paulo

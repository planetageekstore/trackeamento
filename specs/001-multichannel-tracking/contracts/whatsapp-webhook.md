# Contract — WhatsApp inbound (Evolution API → worker)

Uma instância Evolution **por tenant**, conectada por QR code. O worker recebe mensagens de entrada e fecha o loop de atribuição.

## Onboarding (painel → Evolution)

1. Criar instância: `POST {EVOLUTION_URL}/instance/create` `{ instanceName, integration, webhook }`.
2. Exibir QR: `GET /instance/connect/{instanceName}` → `qrcode` (base64) mostrado no painel.
3. Status: `GET /instance/connectionState/{instanceName}` → `open` quando conectado → grava `whatsapp_instance.status=open`, `phone_number`.
4. `apikey` da instância guardada cifrada (`apikey_enc`).

## Webhook de entrada (Evolution → `POST /webhooks/evolution`)

Evento `messages.upsert` (somente `key.fromMe = false`):
```json
{
  "event": "messages.upsert",
  "instance": "tenant_ab12",
  "data": {
    "key": { "remoteJid": "5511999999999@s.whatsapp.net", "id": "3EB0...", "fromMe": false },
    "message": { "conversation": "Olá, tenho interesse. [Ref: TRK-8ZK4Q2M7XR9A]" },
    "messageTimestamp": 1751284800
  }
}
```

**Processamento (worker)** — FR-010/FR-011:
1. Resolver `tenant_id` pela `instance`.
2. Aplicar regex canônico `\[Ref: (TRK-[A-Z0-9]+)\]` no texto (`conversation`/`extendedTextMessage.text`).
3. Extrair telefone de `remoteJid` (normalizar E.164).
4. **Match**: `TRK` encontrado → localizar `lead` por (`tenant_id`, `tracking_code`); setar `lead.phone`; inserir `event` `MESSAGE_RECEIVED` (`source=whatsapp`, `external_id=key.id`, `attributed=true`).
5. **Sem TRK** → `event` `MESSAGE_RECEIVED` `attributed=false`, `lead_id=null` (conciliação manual — FR-013).
6. **TRK inexistente** → registrar `event` não-correspondido, sem erro (FR-013).
7. Dedup por `(tenant_id, source=whatsapp, external_id=key.id)` (FR-014).
8. Se atribuído → enfileirar envio Meta CAPI / Google Offline (Lead) conforme `click_ids` do lead.

**Regra "primeira mensagem"**: o match do `TRK` só é obrigatório na 1ª mensagem do contato; mensagens seguintes do mesmo lead não precisam repetir o marcador.

## Segurança
- Endpoint valida um token/apikey compartilhado entre Evolution e worker.
- Instância e apikey nunca expostas ao browser.

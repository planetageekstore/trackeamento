import { describe, it, expect } from "vitest";
import { evolutionMessageSchema } from "@trk/shared/schemas";
import { extractTrackingCode, phoneFromRemoteJid } from "@trk/shared/trk";

// Payload no formato `messages.upsert` da Evolution API.
function payload(text: string, fromMe = false, id = "3EB0ABC") {
  return {
    event: "messages.upsert",
    instance: "tenant_demo",
    data: {
      key: { remoteJid: "5511999999999@s.whatsapp.net", id, fromMe },
      message: { conversation: text },
      messageTimestamp: 1751284800,
    },
  };
}

describe("contrato · webhook Evolution → atribuição", () => {
  it("valida o payload e extrai TRK + telefone (mensagem atribuível)", () => {
    const parsed = evolutionMessageSchema.safeParse(
      payload("Olá, tenho interesse. [Ref: TRK-8ZK4Q2M7XR9A]"),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const { data } = parsed.data;
    expect(data.key.fromMe).toBe(false);
    expect(extractTrackingCode(data.message!.conversation!)).toBe("TRK-8ZK4Q2M7XR9A");
    expect(phoneFromRemoteJid(data.key.remoteJid)).toBe("+5511999999999");
  });

  it("mensagem sem marcador => sem TRK (fica não-atribuída)", () => {
    const parsed = evolutionMessageSchema.parse(payload("Oi, qual o preço?"));
    expect(extractTrackingCode(parsed.data.message!.conversation!)).toBeNull();
  });

  it("aceita texto em extendedTextMessage", () => {
    const raw = {
      event: "messages.upsert",
      instance: "tenant_demo",
      data: {
        key: { remoteJid: "5511988887777@s.whatsapp.net", id: "X1", fromMe: false },
        message: { extendedTextMessage: { text: "quero [Ref: TRK-ZZ99YY88XX77]" } },
      },
    };
    const parsed = evolutionMessageSchema.parse(raw);
    const text = parsed.data.message!.extendedTextMessage!.text;
    expect(extractTrackingCode(text)).toBe("TRK-ZZ99YY88XX77");
  });
});

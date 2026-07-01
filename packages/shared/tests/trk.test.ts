import { describe, it, expect } from "vitest";
import {
  extractTrackingCode,
  buildRefMarker,
  isValidTrackingCode,
  generateTrackingCode,
  normalizePhoneE164,
  phoneFromRemoteJid,
  parseUtm,
} from "../src/trk";

describe("extractTrackingCode", () => {
  it("extrai o TRK de uma mensagem de WhatsApp", () => {
    expect(extractTrackingCode("Olá, tenho interesse. [Ref: TRK-8ZK4Q2M7XR9A]")).toBe("TRK-8ZK4Q2M7XR9A");
  });
  it("retorna null sem marcador", () => {
    expect(extractTrackingCode("Oi, quero saber o preço")).toBeNull();
  });
  it("ignora marcador malformado", () => {
    expect(extractTrackingCode("[Ref: trk-minusculo]")).toBeNull();
  });
  it("é a fonte única casada por buildRefMarker", () => {
    const trk = generateTrackingCode();
    expect(extractTrackingCode(`msg ${buildRefMarker(trk)}`)).toBe(trk);
    expect(isValidTrackingCode(trk)).toBe(true);
  });
});

describe("normalização de telefone", () => {
  it("formata número BR sem DDI", () => {
    expect(normalizePhoneE164("(11) 99999-9999")).toBe("+5511999999999");
  });
  it("mantém número já com +", () => {
    expect(normalizePhoneE164("+55 11 99999-9999")).toBe("+5511999999999");
  });
  it("extrai do remoteJid da Evolution", () => {
    expect(phoneFromRemoteJid("5511999999999@s.whatsapp.net")).toBe("+5511999999999");
  });
});

describe("parseUtm", () => {
  it("extrai todas as UTMs presentes", () => {
    const utm = parseUtm("utm_source=meta&utm_medium=cpc&utm_campaign=black&utm_content=ad1&utm_term=tenis");
    expect(utm).toEqual({ source: "meta", medium: "cpc", campaign: "black", content: "ad1", term: "tenis" });
  });
});

import { describe, it, expect } from "vitest";
import {
  extractTrackingCode,
  isValidTrackingCode,
  hasOrigin,
  normalizePhoneE164,
  parseUtm,
  parseClickIds,
} from "../src/trk";

describe("edge cases · atribuição", () => {
  it("extractTrackingCode pega o primeiro marcador quando há vários", () => {
    expect(extractTrackingCode("[Ref: TRK-AAA111] e [Ref: TRK-BBB222]")).toBe("TRK-AAA111");
  });

  it("isValidTrackingCode rejeita minúsculas e caracteres inválidos", () => {
    expect(isValidTrackingCode("TRK-abc")).toBe(false);
    expect(isValidTrackingCode("TRK-ABC_123")).toBe(false);
    expect(isValidTrackingCode("TRK-ABC123")).toBe(true);
  });

  it("hasOrigin é falso para acesso direto e verdadeiro com um único parâmetro", () => {
    expect(hasOrigin(parseUtm(""), parseClickIds(""))).toBe(false);
    expect(hasOrigin(parseUtm("utm_medium=cpc"), parseClickIds(""))).toBe(true);
    expect(hasOrigin(parseUtm(""), parseClickIds("gclid=x"))).toBe(true);
  });
});

describe("edge cases · telefone", () => {
  it("string sem dígitos vira vazio", () => {
    expect(normalizePhoneE164("sem numero")).toBe("");
  });

  it("não duplica DDI quando já presente", () => {
    expect(normalizePhoneE164("5511999999999")).toBe("+5511999999999");
  });
});

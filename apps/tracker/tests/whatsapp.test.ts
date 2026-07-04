// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { withMarker, interceptWhatsApp } from "../src/whatsapp";
import { buildRefMarker, decodeHiddenRef, encodeHiddenRef } from "@trk/shared/trk";

const TRK = "TRK-8ZK4Q2M7XR9A";
const MARKER = buildRefMarker(TRK);
const ZW = /[​‌⁠]/g; // zero-width usados na codificação

describe("marcador invisível (zero-width)", () => {
  it("codifica e decodifica de volta o mesmo TRK", () => {
    expect(decodeHiddenRef(encodeHiddenRef(TRK))).toBe(TRK);
  });
  it("não deixa nada visível (só zero-width)", () => {
    expect(MARKER).not.toContain("TRK");
    expect(MARKER.replace(ZW, "")).toBe("");
  });
});

describe("withMarker", () => {
  it("esconde o código quando não há texto", () => {
    const out = withMarker("https://wa.me/5511999999999", MARKER)!;
    const text = new URL(out).searchParams.get("text")!;
    expect(decodeHiddenRef(text)).toBe(TRK);
  });

  it("preserva o texto existente e esconde o código", () => {
    const out = withMarker("https://wa.me/55119?text=Ol%C3%A1", MARKER)!;
    const text = new URL(out).searchParams.get("text")!;
    expect(text).toContain("Olá");
    expect(decodeHiddenRef(text)).toBe(TRK);
  });

  it("é idempotente (não duplica o marcador)", () => {
    const once = withMarker("https://wa.me/55119", MARKER)!;
    const twice = withMarker(once, MARKER)!;
    expect(twice).toBe(once);
  });
});

describe("interceptWhatsApp", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reescreve links de WhatsApp com o código escondido", () => {
    document.body.innerHTML = `<a id="wa" href="https://wa.me/5511999999999?text=Ol%C3%A1">zap</a>`;
    interceptWhatsApp(TRK);
    const href = (document.getElementById("wa") as HTMLAnchorElement).href;
    const text = new URL(href).searchParams.get("text")!;
    expect(decodeHiddenRef(text)).toBe(TRK);
  });

  it("não reprocessa o mesmo link (marca data-saas-trk)", () => {
    document.body.innerHTML = `<a id="wa" href="https://wa.me/55119">zap</a>`;
    interceptWhatsApp(TRK);
    const el = document.getElementById("wa") as HTMLAnchorElement;
    expect(el.dataset.saasTrk).toBe("1");
    const before = el.href;
    interceptWhatsApp(TRK);
    expect(el.href).toBe(before);
  });
});

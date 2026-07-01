// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { withMarker, interceptWhatsApp } from "../src/whatsapp";

const TRK = "TRK-8ZK4Q2M7XR9A";
const MARKER = `[Ref: ${TRK}]`;

describe("withMarker", () => {
  it("anexa o marcador quando não há texto", () => {
    const out = withMarker("https://wa.me/5511999999999", MARKER)!;
    expect(decodeURIComponent(out)).toContain(MARKER);
  });

  it("preserva o texto existente e anexa o marcador", () => {
    const out = withMarker("https://wa.me/55119?text=Ol%C3%A1", MARKER)!;
    const text = new URL(out).searchParams.get("text")!;
    expect(text).toContain("Olá");
    expect(text).toContain(MARKER);
  });

  it("é idempotente (não duplica o marcador)", () => {
    const once = withMarker("https://wa.me/55119", MARKER)!;
    const twice = withMarker(once, MARKER)!;
    const occurrences = (new URL(twice).searchParams.get("text")!.match(/\[Ref:/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});

describe("interceptWhatsApp", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reescreve links de WhatsApp presentes na página", () => {
    document.body.innerHTML = `<a id="wa" href="https://wa.me/5511999999999?text=Ol%C3%A1">zap</a>`;
    interceptWhatsApp(TRK);
    const href = (document.getElementById("wa") as HTMLAnchorElement).href;
    expect(decodeURIComponent(href)).toContain(MARKER);
  });

  it("não reprocessa o mesmo link (marca data-saas-trk)", () => {
    document.body.innerHTML = `<a id="wa" href="https://wa.me/55119">zap</a>`;
    interceptWhatsApp(TRK);
    const el = document.getElementById("wa") as HTMLAnchorElement;
    expect(el.dataset.saasTrk).toBe("1");
    const before = el.href;
    interceptWhatsApp(TRK); // segunda passada
    expect(el.href).toBe(before);
  });
});

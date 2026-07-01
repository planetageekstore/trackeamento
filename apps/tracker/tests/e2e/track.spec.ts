import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const BUNDLE = resolve(here, "../../dist/tracker.js");

// Requer o bundle: rode `pnpm --filter tracker build` antes.
const bundle = existsSync(BUNDLE) ? readFileSync(BUNDLE, "utf8") : null;

const PAGE_HTML = `<!doctype html><html><head><title>t</title></head><body>
<a id="wa" href="https://wa.me/5511999999999?text=Ol%C3%A1">WhatsApp</a>
<script async src="https://cdn.test/t/v1/tracker.js"
        data-site-key="pk_live_demo" data-api="https://api.test"></script>
</body></html>`;

test.describe("tracker.js (US1)", () => {
  test.skip(!bundle, "bundle ausente — rode `pnpm --filter tracker build`");

  test.beforeEach(async ({ page }) => {
    // Serve o bundle buildado no lugar do CDN.
    await page.route("https://cdn.test/t/v1/tracker.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: bundle! }),
    );
  });

  test("gera e persiste o TRK e envia PAGE_VIEW", async ({ page }) => {
    const requests: string[] = [];
    await page.route("https://api.test/api/track", async (route) => {
      requests.push(route.request().postData() ?? "");
      await route.fulfill({ status: 202, contentType: "application/json", body: '{"ok":true}' });
    });

    await page.setContent(PAGE_HTML, { baseURL: "https://loja.com.br" });
    await page.waitForRequest("https://api.test/api/track");

    const trk = await page.evaluate(() => window.localStorage.getItem("_saas_trk_id"));
    expect(trk).toMatch(/^TRK-[A-Z0-9]{12}$/);
    expect(requests[0]).toContain("PAGE_VIEW");
    expect(requests[0]).toContain(trk!);
  });

  test("reutiliza o mesmo TRK entre navegações (SC-007)", async ({ page }) => {
    await page.route("https://api.test/api/track", (route) =>
      route.fulfill({ status: 202, body: '{"ok":true}' }),
    );
    await page.setContent(PAGE_HTML);
    await page.waitForRequest("https://api.test/api/track");
    const first = await page.evaluate(() => localStorage.getItem("_saas_trk_id"));

    await page.setContent(PAGE_HTML);
    const second = await page.evaluate(() => localStorage.getItem("_saas_trk_id"));
    expect(second).toBe(first);
  });

  test("não quebra a página quando o backend está offline (FR-006)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route("https://api.test/api/track", (route) => route.abort());

    await page.setContent(PAGE_HTML);
    // Mesmo com a API caída, o TRK é gerado e persistido e nada explode.
    await page.waitForFunction(() => !!localStorage.getItem("_saas_trk_id"));
    const trk = await page.evaluate(() => localStorage.getItem("_saas_trk_id"));
    expect(trk).toMatch(/^TRK-/);
    expect(errors).toHaveLength(0);
  });
});

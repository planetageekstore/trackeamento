import { defineConfig, devices } from "@playwright/test";

// E2E do tracker (US1: geração/persistência do TRK, intercept WhatsApp,
// resiliência com backend offline). Testes em apps/tracker/tests/e2e.
export default defineConfig({
  testDir: "apps/tracker/tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
  },
});

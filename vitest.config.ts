import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

// Config raiz de testes unit/contract. Cada workspace herda via seus próprios
// arquivos de teste; e2e do tracker roda pelo Playwright (playwright.config.ts).
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "packages/**/tests/**/*.test.ts",
      "apps/**/tests/**/*.test.ts",
      "services/**/tests/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/e2e/**"],
  },
  resolve: {
    alias: {
      "@trk/shared/trk": p("./packages/shared/src/trk.ts"),
      "@trk/shared/schemas": p("./packages/shared/src/schemas.ts"),
      "@trk/shared": p("./packages/shared/src/index.ts"),
      "@": p("./apps/dashboard/src"),
    },
  },
});

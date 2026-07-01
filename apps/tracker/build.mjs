import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "dist/tracker.js");
const MAX_GZIP = 15 * 1024; // orçamento SC-001: ≤15KB gzip

mkdirSync(resolve(here, "dist"), { recursive: true });

await build({
  entryPoints: [resolve(here, "src/index.ts")],
  outfile: OUT,
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2019"],
  legalComments: "none",
  // Fonte única do regex/TRK sem arrastar zod para o bundle do browser.
  alias: {
    "@trk/shared/trk": resolve(here, "../../packages/shared/src/trk.ts"),
  },
  define: {
    __API_BASE__: JSON.stringify(process.env.TRACKER_API_BASE ?? ""),
  },
});

const gz = gzipSync(readFileSync(OUT)).length;
const kb = (gz / 1024).toFixed(2);
if (gz > MAX_GZIP) {
  console.error(`✗ tracker.js ${kb}KB gzip excede o orçamento de 15KB`);
  process.exit(1);
}
console.log(`✓ tracker.js gerado (${kb}KB gzip)`);

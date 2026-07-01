import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = resolve(here, "../dist/tracker.js");

// SC-001: o tracker deve permanecer ≤15KB gzip. Rode `pnpm --filter tracker build` antes.
describe("tracker bundle (SC-001)", () => {
  it.skipIf(!existsSync(bundle))("≤ 15KB gzip", () => {
    const gz = gzipSync(readFileSync(bundle)).length;
    expect(gz).toBeLessThanOrEqual(15 * 1024);
  });
});

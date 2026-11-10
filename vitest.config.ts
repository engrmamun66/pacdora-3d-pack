import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["packages/*/test/**/*.test.ts", "apps/web/src/lib/**/*.test.ts", "apps/web/src/components/**/*.test.ts"] },
});

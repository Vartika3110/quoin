import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worktrees created by tooling hold a full copy of the source. Linting
    // them reports every problem twice and buries the real ones: this
    // directory alone produced 7,632 of 7,632 problems.
    ".claude/worktrees/**",
  ]),
  {
    /* The teaser render scripts are standalone Node programs, run by hand
       with absolute paths into a sandbox, and committed as the record of
       how that film was made rather than as part of the application. They
       are CommonJS because that is what `node render.js` takes without a
       build step, so the TypeScript rule about `require()` is measuring
       the wrong thing here. Scoped to these files on purpose: real source
       under `marketing/` should still be linted like everything else. */
    files: ["marketing/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;

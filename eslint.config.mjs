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
]);

export default eslintConfig;
